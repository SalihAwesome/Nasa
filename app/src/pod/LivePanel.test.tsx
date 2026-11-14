import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App'
import { createReplaySource } from './live'
import { createLiveSession, LiveReadings } from './LivePanel'
import meda from '../../public/data/mars/meda-sol-300.json'
import site from '../../../shared/pod_site.json'

const csv = readFileSync(new URL('../../public/data/sim/pod-sim.csv', import.meta.url), 'utf8')

afterEach(() => vi.unstubAllGlobals())

test('U25 live route links directly to the Qatar card', () => {
  vi.stubGlobal('window', { location: { hash: '#/live' } })
  const live = renderToStaticMarkup(<App />)
  const link = live.match(/href="(#\/card\/pod)"/)
  expect(link).not.toBeNull()
  vi.stubGlobal('window', { location: { hash: link?.[1] } })
  expect(renderToStaticMarkup(<App />)).toContain('Site comparison')
})

test('U25 shows the next replay reading after a light drop and survives a bad line', async () => {
  const lines = csv.trimEnd().split(/\r?\n/)
  const header = lines.filter(line => !/^\d/.test(line))
  const records = lines.filter(line => /^\d/.test(line))
  const noonBin = records.findIndex((line, index) =>
    index > 0 && index + 1 < records.length
    && Number(line.split(',')[1]) < Number(records[index - 1].split(',')[1])
    && meda.channels.ground_temp.bins[Math.floor(((Date.parse(line.split(',')[0]) % 86400000) / 3600000 + site.lon / 15) * 6)]?.value != null,
  )
  expect(noonBin).toBeGreaterThan(0)
  const [before, after, recovery] = records.slice(noonBin - 1, noonBin + 2)
  const session = createLiveSession('replay')
  const snapshots: string[] = []
  const controller = new AbortController()
  const replay = createReplaySource({
    csv: [...header, before, after, 'bad line', recovery].join('\n'),
    speed: 1,
    wait: async () => {},
  })
  await replay.run(event => {
    session.receive(event)
    if (event.kind === 'record' || event.kind === 'error') {
      snapshots.push(renderToStaticMarkup(<LiveReadings snapshot={session.snapshot()} meda={meda} />))
    }
  }, controller.signal)
  expect(snapshots).toHaveLength(4)
  const up = (html: string) => Number(html.match(/data-field="lux_up" data-value="([^"]+)"/)?.[1])
  expect(up(snapshots[0])).toBe(Number(before.split(',')[1]))
  expect(up(snapshots[1])).toBe(Number(after.split(',')[1]))
  expect(up(snapshots[1])).toBeLessThan(up(snapshots[0]))
  expect(up(snapshots[2])).toBe(up(snapshots[1]))
  const badCount = (html: string) => html.match(/data-bad-lines="(\d+)"/)?.[1]
  expect(snapshots.map(badCount)).toEqual(['0', '0', '1', '1'])
  expect(up(snapshots[3])).toBe(Number(recovery.split(',')[1]))
  expect(snapshots[3]).toContain('>simulated<')
  const bin = Math.floor(((Date.parse(after.split(',')[0]) % 86400000) / 3600000 + site.lon / 15) * 6)
  expect(snapshots[1]).toContain('data-meda-value="' + meda.channels.ground_temp.bins[bin].value + '"')
  expect(snapshots[1]).toContain(meda.channels.uv.reason)
  console.info('U25 replay: lux_up ' + up(snapshots[0]) + ' → ' + up(snapshots[1])
    + ' lux on the next record. Bad lines ' + snapshots.map(badCount).join(' → ')
    + '. The following good record shows ' + up(snapshots[3]) + ' lux.')
})
