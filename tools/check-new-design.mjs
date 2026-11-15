import { createServer } from "node:http";
import { readFile, mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, extname, relative, isAbsolute } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const root = resolve(import.meta.dirname, "../app/dist");
const shots = resolve(
  import.meta.dirname,
  "../app/.impeccable/review",
  process.argv.includes("--offline") ? "offline" : ".",
);
const offline = process.argv.includes("--offline");
const layoutOnly = process.argv.includes("--layout-only");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".ttf": "font/ttf",
};
const server = createServer(async (req, res) => {
  try {
    const file = resolve(
      root,
      "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
    );
    if (relative(root, file).startsWith("..")) {
      res.writeHead(403).end();
      return;
    }
    const path = file === root ? join(root, "index.html") : file;
    res.setHeader(
      "Content-Type",
      mime[extname(path)] || "application/octet-stream",
    );
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const profileRoot = resolve(tmpdir());
const profile = await mkdtemp(join(profileRoot, "proving-ground-ui-"));
const chromePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
assert.ok(chromePath, "Set CHROME_PATH to a Chromium browser.");
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    "--no-first-run",
    "--disable-extensions",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true },
);
let ws;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    await delay(100);
    try {
      port = parseInt(
        await readFile(join(profile, "DevToolsActivePort"), "utf8"),
      );
    } catch {}
  }
  assert.ok(port, "Chrome must start");
  const version = await (
    await fetch(`http://127.0.0.1:${port}/json/version`)
  ).json();
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      pending.get(m.id)?.(m);
      pending.delete(m.id);
    } else if (m.method === "Runtime.exceptionThrown")
      errors.push(
        (
          m.params.exceptionDetails.exception?.description ||
          m.params.exceptionDetails.text
        ).replace(/AIza[\w-]+/g, "[redacted]"),
      );
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((r) => {
      const key = ++id;
      pending.set(key, r);
      ws.send(JSON.stringify({ id: key, method, params, sessionId }));
    });
  const {
    result: { targetId },
  } = await send("Target.createTarget", { url: "about:blank" });
  const {
    result: { sessionId },
  } = await send("Target.attachToTarget", { targetId, flatten: true });
  const call = async (method, params = {}) => {
    const r = await send(method, params, sessionId);
    assert.ok(!r.error, JSON.stringify(r.error));
    return r.result;
  };
  const ev = async (expression) => {
    const r = await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Network.enable");
  await call("Log.enable");
  const diagnostics = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (
      m.method === "Network.responseReceived" &&
      m.params.response.status >= 400
    ) {
      const u = new URL(m.params.response.url);
      diagnostics.push({
        status: m.params.response.status,
        host: u.hostname,
        path: u.pathname,
      });
    }
    if (m.method === "Runtime.consoleAPICalled")
      diagnostics.push({
        console: m.params.type,
        text: m.params.args
          .map((a) => a.value || a.description || "")
          .join(" ")
          .replace(/AIza[\w-]+/g, "[redacted]"),
      });
  });
  await mkdir(shots, { recursive: true });

  const waitFor = async (expression, label, limit = 45000) => {
    const end = Date.now() + limit;
    while (Date.now() < end) {
      if (await ev(expression)) return;
      await delay(200);
    }
    throw new Error("Timed out: " + label);
  };
  const clickText = async (selector, text) => {
    const box = await ev(
      "(()=>{const e=[...document.querySelectorAll(" +
        JSON.stringify(selector) +
        ")].find(e=>e.textContent.trim()===" +
        JSON.stringify(text) +
        ');if(!e)return null;e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()',
    );
    assert.ok(box, text + " control exists");
    await call("Input.dispatchMouseEvent", {
      type: "mousePressed",
      button: "left",
      clickCount: 1,
      ...box,
    });
    await call("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      button: "left",
      clickCount: 1,
      ...box,
    });
    await delay(250);
  };
  const screenshot = async (name, full = false) => {
    await ev("document.fonts.ready");
    await delay(600);
    const clip = full
      ? {
          x: 0,
          y: 0,
          width: await ev("innerWidth"),
          height: await ev("document.documentElement.scrollHeight"),
          scale: 1,
        }
      : undefined;
    const shot = await call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: full,
      ...(clip ? { clip } : {}),
    });
    await writeFile(join(shots, name), Buffer.from(shot.data, "base64"));
  };
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Page.navigate", { url: origin + "/#/map" });
  await waitFor(
    'document.querySelectorAll(".ranked-cells li").length===20',
    "ranked data",
  );
  if (!offline)
    await waitFor(
      '!!document.querySelector(".google-satellite-view .google-earth-toolbar button:not(:disabled)")',
      "live Google satellite tiles",
    );
  assert.equal(
    await ev(
      'document.querySelectorAll(".ranked-cells li:not([hidden])").length',
    ),
    5,
  );
  await clickText(".rank-pagination button", "Next");
  assert.equal(
    await ev('document.querySelector(".ranked-cells li:not([hidden])").value'),
    6,
  );
  await clickText(".rank-pagination button", "Next");
  await clickText(".rank-pagination button", "Next");
  assert.equal(
    await ev('document.querySelector(".ranked-cells li:not([hidden])").value'),
    16,
  );
  assert.ok(
    await ev(
      '[...document.querySelectorAll(".rank-pagination button")].find(b=>b.textContent==="Next").disabled',
    ),
  );
  await clickText(".rank-pagination button", "Previous");
  await clickText(".rank-pagination button", "Previous");
  await clickText(".rank-pagination button", "Previous");
  await ev('document.querySelector(".ranking-notes").open=true');
  assert.ok(
    await ev(
      'document.querySelector(".ranking-notes").textContent.includes("Missing quantities")',
    ),
  );
  await ev('document.querySelector(".ranking-notes").open=false');
  console.log(
    "PASS ranking: all 20 results across four pages, coverage disclosure, enabled/disabled controls.",
  );
  if (!offline && !layoutOnly) {
    assert.ok(
      await ev(
        '[...document.querySelectorAll(".google-earth-host img")].some(i=>i.complete&&i.naturalWidth>=256)',
      ),
      "Actual Google tiles loaded",
    );
    await clickText(
      ".google-satellite-view .google-earth-toolbar button",
      "Place labels",
    );
    assert.equal(
      await ev(
        'document.querySelector(".google-satellite-view button[aria-pressed]").getAttribute("aria-pressed")',
      ),
      "false",
    );
    await clickText(
      ".google-satellite-view .google-earth-toolbar button",
      "Place labels",
    );
    await ev(
      '(()=>{const s=document.querySelector(".globe-sites select");s.value=s.options[1].value;s.dispatchEvent(new Event("change",{bubbles:true}));})()',
    );
    await waitFor(
      '!!document.querySelector(".coordinate-form input").value',
      "site coordinates",
    );
    await ev(
      'document.querySelector(".google-earth-stage").scrollIntoView({block:"center"})',
    );
    await delay(2500);
    await screenshot("satellite-detail.png");
    await clickText(".earth-map-modes button", "3D globe");
    await waitFor(
      '!!document.querySelector(".google-earth-view .google-earth-toolbar button:not(:disabled)")',
      "full 3D scene",
      50000,
    );
    await waitFor(
      'document.querySelector("gmp-map-3d").range>5000 && document.querySelector("gmp-map-3d").range<100000',
      "terrain-relative site camera",
      25000,
    );
    await delay(1500);
    await screenshot("terrain-detail.png");
    const range = await ev('document.querySelector("gmp-map-3d").range');
    await clickText(
      ".google-earth-view .google-earth-toolbar button",
      "Zoom in",
    );
    await waitFor(
      'document.querySelector("gmp-map-3d").range<' + range,
      "3D zoom",
    );
    await clickText(
      ".google-earth-view .google-earth-toolbar button",
      "Reset view",
    );
    await waitFor(
      'document.querySelector("gmp-map-3d").range>10000000',
      "3D reset",
    );
    await clickText(".earth-map-modes button", "Match colors");
    assert.ok(await ev('!!document.querySelector(".earth-globe")'));
    await clickText(".earth-map-modes button", "Satellite");
    await waitFor(
      '!!document.querySelector(".google-satellite-view .google-earth-toolbar button:not(:disabled)")',
      "satellite reentry",
    );
    assert.equal(
      await ev(
        '[...document.scripts].filter(s=>s.src.includes("maps.googleapis.com/maps/api/js")).length',
      ),
      1,
    );
    console.log(
      "PASS Google: detailed satellite tiles, labels, site coordinates, full 3D scene, elevated terrain focus, zoom/reset, score mode and SDK reuse.",
    );
  }
  for (const width of [1510, 1440, 1280, 1100, 1024, 820, 768, 390, 320]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    await delay(300);
    assert.ok(
      await ev("document.documentElement.scrollWidth<=innerWidth"),
      "Page overflow " + width,
    );
    assert.equal(
      await ev(
        'parseFloat(getComputedStyle(document.querySelector(".app-nav a")).fontSize)>=16',
      ),
      true,
      "Readable nav " + width,
    );
    if (width <= 1088) {
      await clickText("#menu-toggle", "Menu");
      assert.equal(
        await ev(
          'document.querySelector("#menu-toggle").getAttribute("aria-expanded")',
        ),
        "true",
      );
      assert.ok(
        await ev(
          '[...document.querySelectorAll(".app-nav a")].every(a=>a.getBoundingClientRect().height>=44)',
        ),
      );
      if (width === 390) await screenshot("mobile-menu.png");
      await call("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Tab",
        code: "Tab",
        windowsVirtualKeyCode: 9,
      });
      await call("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Tab",
        code: "Tab",
        windowsVirtualKeyCode: 9,
      });
      assert.ok(
        await ev('!!document.activeElement.closest(".app-nav")'),
        "Tab enters the open navigation",
      );

      await call("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await call("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await delay(100);
      assert.equal(
        await ev(
          'document.querySelector("#menu-toggle").getAttribute("aria-expanded")',
        ),
        "false",
      );
    }
    if (width === 1510) {
      await ev("scrollTo(0,0)");
      await screenshot("user-1510.png", true);
    }
    if (width === 1440) {
      await ev("scrollTo(0,0)");
      await screenshot("desktop.png", true);
    }
    if (width === 390) {
      await ev("scrollTo(0,0)");
      await screenshot("mobile.png", true);
    }
    if (width === 320) {
      await ev("scrollTo(0,0)");
      await screenshot("narrow.png", true);
    }
  }
  console.log(
    "PASS responsive: 320,390,768,820,1024,1100,1280,1440,1510; menu state, Escape, readable navigation, no horizontal overflow.",
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await ev('document.querySelector(".theme-toggle").click()');
  await delay(200);
  assert.equal(await ev("document.documentElement.dataset.theme"), "light");
  await screenshot("light.png", true);
  await ev('document.querySelector(".theme-toggle").click()');
  await ev('location.hash="#/compare"');
  await waitFor(
    'document.querySelectorAll(".location-picker").length===2',
    "comparison panels",
  );
  if (!offline)
    await waitFor(
      '!!document.querySelector(".google-satellite-view .google-earth-toolbar button:not(:disabled)")',
      "comparison Google tiles",
    );
  assert.ok(
    await ev('!!document.querySelector(".planet-surface")'),
    "Mars local surface",
  );
  await clickText(".compare-run button", "Compare selected locations");
  await waitFor('!!document.querySelector(".compare-table")', "comparison results");
  const comparisonText = await ev('document.querySelector(".compare-table").textContent');
  for (const expected of ["14.7%", "TES orbital albedo", "2.79 W/m²", "MEDA recorded UV detector flux", "3.42%", "Relative to ice", "Different humidity references"])
    assert.ok(comparisonText.includes(expected), "Comparison evidence: " + expected);
  assert.ok(!comparisonText.includes("Unavailable"), "Specific comparison explanations replace generic unavailable cells");
  assert.ok(!/\d+\.\d{5,} percentage points/.test(comparisonText), "Readable percentage-point precision");
  await clickText(".compare-table summary", "Source & coverage");
  assert.ok(await ev('document.querySelector(".compare-table details").open'), "Source details expand");
  await clickText(".compare-table summary", "Source & coverage");
  await ev('document.querySelector("#comparison-results").scrollIntoView({block:"start"})');
  await screenshot("comparison-results.png");
  console.log("PASS comparison data: sourced TES albedo, measured RDS flux, ice-relative humidity, source disclosure and readable differences; supplemental products remain separate.");
  await ev("scrollTo(0,0)");
  await screenshot("comparison.png", true);
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(300);
  assert.ok(
    await ev("document.documentElement.scrollWidth<=innerWidth"),
    "Comparison overflow",
  );
  await screenshot("comparison-mobile.png", true);
  for (const route of ["sun", "truth", "live", "ask"]) {
    await ev('location.hash="#/' + route + '"');
    await delay(600);
    assert.ok(await ev('!!document.querySelector("h1")'));
    assert.ok(
      await ev("document.documentElement.scrollWidth<=innerWidth"),
      route + " overflow",
    );
  }
  await ev('location.hash="#/map"');
  await waitFor(
    'document.querySelectorAll(".ranked-cells li").length===20',
    "map return",
  );
  if (!offline) {
    await waitFor(
      '!!document.querySelector(".google-satellite-view .google-earth-toolbar button:not(:disabled)")',
      "Google return",
    );
    await ev("window.gm_authFailure()");
    await waitFor(
      '!!document.querySelector(".google-earth-error")',
      "auth error",
    );
    await delay(1200);
    assert.ok(
      await ev('!!document.querySelector(".google-earth-error")'),
      "Auth error stays visible",
    );
    await clickText(".earth-map-modes button", "Match colors");
    assert.ok(await ev('!!document.querySelector(".earth-globe")'));
  }
  assert.deepEqual(errors, [], "Uncaught browser errors");
  console.log(
    "PASS themes, comparison and all primary routes" +
      (offline ? "." : ", explicit auth failure and usable score fallback."),
  );
  console.log("Network/console observations:", JSON.stringify(diagnostics));
} finally {
  ws?.close();
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {}
  } else chrome.kill();
  server.close();
  const profileWithinTemp = relative(profileRoot, resolve(profile));
  assert.ok(
    profileWithinTemp &&
      !profileWithinTemp.startsWith("..") &&
      !isAbsolute(profileWithinTemp),
    "Temporary browser profile must remain in the OS temp directory",
  );
  await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(
    () => {},
  );
}
