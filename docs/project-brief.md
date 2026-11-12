# Proving Ground: Space Apps 2026 project brief

This file is the markdown copy of `Proving Ground Space Apps 2026 project brief.docx`, as the team saved it on 12 November 2026. A script made the copy, so the wording is the team's.

Read it with two cautions. The brief is older than `docs/mission-plan.md`, so the mission plan wins where the two differ. The brief also says of itself that nothing in it has been run, so `docs/verified-facts.md` wins on any fact that a real call tested.

Nov 10, 2026 · @Us

## The idea

Proving Ground tells a mission planner where on Earth, and in which month, to test one specific Moon Base or Mars system. It gives the match in numbers and states where the match fails.

- **Challenge:** 10, Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars.
- **User:** an engineer planning a field test of a rover, a solar array, a radio link, a navigation camera or a science instrument.
- **Decision it supports:** which site to book, and for which weeks.
- **Name:** Proving Ground is a working title.

**The 30-second pitch.** NASA will test mobility, power, communications, navigation and science tools on the Moon before crews stay there. Each one is rehearsed on Earth first, and today the site is picked by experience. Proving Ground computes it: choose the system and the target, and it ranks Earth sites by month, shows the numbers, and shows what the site cannot reproduce. We checked it twice. It re-finds sites NASA already uses, and we measured one of its predictions ourselves in Qatar.

## Why it matters

NASA is about to need many Earth test campaigns, and site choice is still made by experience.

- **The demand is real and current.** NASA plans a Moon base near the lunar south pole. Its first phase sends rovers, instruments and technology to test mobility, power, communications, navigation and scientific tools ([R&D World](https://www.rdworldonline.com/nasa-outlines-path-to-moon-base-permanent-lunar-presence/)).
- **Earth rehearsal comes first.** NASA rehearsed Artemis moonwalks in Arizona's San Francisco Volcanic Field, chosen for its lunar-like terrain ([USGS](https://www.usgs.gov/centers/astrogeology-science-center/news/artemis-iii-mission-tests-san-francisco-volcanic-field)).
- **The match is partly improvised.** Arizona's Sun is too high, so some moonwalks ran at night with a portable spotlight standing in for the low polar Sun (same USGS source).
- **The gap:** we found no public tool that answers "for this test, at this target, which site and which month" with numbers and stated limits. We have not searched exhaustively, so check before claiming it in the pitch.

The challenge brief asks for this directly. It wants evidence beyond visual resemblance, less-studied sites, operational needs, and a clear statement of what Earth cannot reproduce.

## What the user sees

The product is one web page with a map, a card and two proof tabs.

1. **Pick a target.** Shackleton Connecting Ridge for the Moon Base, or Jezero crater for Mars.
2. **Pick a test.** Mobility, power, communications, navigation or science tools. These are NASA's own five categories.
3. **Read the map.** Land areas are coloured by match for that test. A month slider changes the colours, because a site's match changes through the year.
4. **Open a site.** A fidelity card lists each physical quantity with the target value, the Earth value and a match score.
5. **See the limits.** The same card ends with a fixed list of what this site cannot reproduce.
6. **Compare the skies.** For power and navigation, a panel shows the Sun's path at the target beside the Sun's path at the Earth site.
7. **Check our work.** One tab shows how the tool ranks sites NASA already uses. Another shows our Qatar measurement against the tool's prediction.

The card never gives a single "looks like Mars" number. A site can score high for power tests and low for mobility, and the card shows both.

## How the match is computed

Every score is a comparison of the same physical quantity on two worlds, using public data on both sides.

| Quantity | Target-side data | Earth-side data | Tests it drives |
|---|---|---|---|
| Slope and roughness | LOLA elevation (Moon), MOLA elevation (Mars) | SRTM elevation | Mobility, navigation, communications |
| Bare ground | Fully bare on both targets | MODIS vegetation index | All five |
| Day-to-night ground temperature | Diviner (Moon), [MEDA](https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html) (Mars) | MODIS land surface temperature | Power, science tools |
| Sun path | [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/manual.html) | Standard solar-position formula | Power, navigation |
| Sunlight and UV | MEDA (Mars) | NASA POWER | Power, science tools |
| Airborne dust | MEDA (Mars) | MERRA-2 | Power |
| Surface dryness | Fully dry on both targets | SMAP soil moisture | Mobility, science tools |

**Scoring rules**

- **One quantity, one score.** The score is 1 when the Earth value equals the target value and falls to 0 at a stated tolerance. The tolerance is printed on the card.
- **One test, its own quantities.** Each test combines only the rows that drive it. The weights are visible and the user can change them.
- **Place and month.** Scores are computed per land cell on a half-degree grid, for each month.
- **No machine learning and no chatbot.** Every score traces back to named numbers a judge can check.
- **Unmatchable quantities are not scored.** They go in the limits list instead.

**Data status.** We have read the MEDA and Horizons documentation. The other datasets are standard NASA products that we have not pulled yet.

## Sun-path module

This module finds where and when Earth's real Sun behaves like the Sun at the Moon Base. It is the one piece borrowed from the CLPS challenge.

- **Why it matters.** At the lunar south pole astronauts will see the Sun only along the horizon, which drives both solar power and navigation in long shadows ([USGS](https://www.usgs.gov/centers/astrogeology-science-center/news/artemis-iii-mission-tests-san-francisco-volcanic-field)).
- **Target side.** For the chosen site and dates, get the Sun's height above the horizon and its compass direction through one full lunar day.
- **Source.** The [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html) says users can define their own surface site on any body with a known rotation model, and it returns azimuth and elevation. We have not run this query yet.
- **Earth side.** Compute the same two angles for every land cell and month with the standard solar-position formula.
- **Match on three numbers.** The highest Sun height, the share of daylight with the Sun below 10 degrees, and how much of the horizon the Sun sweeps.
- **Expected result.** High-latitude sites near the equinoxes. This is our reasoning and is untested.

**Limits to print beside the panel**

- Earth's Sun crosses the sky about 30 times faster, because one lunar day lasts about 29.5 Earth days. The match is in angle, not in duration.
- Earth's air scatters light into shadows. Lunar shadows are far darker.
- We do not model shadows cast by lunar terrain. That belongs to the CLPS challenge and we leave it out.

## Proof it works

Before we trust any new site the tool suggests, it must rank the sites NASA already uses near the top for the tests NASA uses them for.

| Known site | What NASA uses it for | Our check |
|---|---|---|
| [San Francisco Volcanic Field, Arizona](https://www.usgs.gov/centers/astrogeology-science-center/news/artemis-iii-mission-tests-san-francisco-volcanic-field) | Artemis moonwalk rehearsals on lunar-like terrain | Moon Base, mobility: should rank high. Moon Base, navigation: should rank low |
| [Black Point Lava Flow, Arizona](https://science.nasa.gov/solar-system/planetary-analogs/10-things-to-know-about-planetary-analogs/) | Lunar rover field tests | Moon Base, mobility: should rank high |
| [Haughton crater, Devon Island, Canada](https://science.nasa.gov/solar-system/planetary-analogs/10-things-to-know-about-planetary-analogs/) | Moon and Mars exploration technology; barren and freezing | Jezero, mobility: should rank high |
| [Atacama Desert, Chile](https://science.nasa.gov/solar-system/planetary-analogs/10-things-to-know-about-planetary-analogs/) | Stand-in for dry, rugged Mars terrain | Jezero, science tools: should rank high |

- **Pass rule, fixed before we run it:** the known site lands in the top 10% of land cells for its expected test.
- **The Arizona row is the sharpest test.** NASA had to add a spotlight there, so a correct tool should score Arizona high on terrain and low on Sun path.
- **We report every result, including misses.** Real sites are also chosen for access and cost, which the tool does not model. A miss may reflect that, and we say so.
- **Four sites is a thin sample.** Add more from NASA's planetary analogs gallery if time allows.

## Ground truth in Qatar

We test one of the tool's predictions with our own 24-hour measurement at a Qatar sabkha.

**Why here.** A [Qatar University study](https://qspace.qu.edu.qa/handle/10576/57426) treats Qatar's coastal sabkha as a modern analog for salt-forming environments that may have existed on early Mars. Almost no other team can stand on such a site this weekend.

**What we measure.** The sensor pod logs ground temperature, reflectivity, UV, air temperature, humidity and pressure for 24 hours, plus ground temperature at 10 cm.

**What we plot.** For each quantity, three curves on one chart:

1. Our measurement.
2. The satellite-based value for the same grid cell, from NASA POWER.
3. One Mars day at Jezero from Perseverance's weather station. MEDA data is published as one CSV file per Mars day.

**What comes out**

- **An error bar.** The gap between curves 1 and 2 shows how far a satellite-only score can be off at this site.
- **A measured card for Qatar against Jezero.** We expect pressure, humidity and the day-to-night temperature swing to fail. We will measure these, not assume them.
- **An honest card for Qatar against the Moon Base.** We expect a low score and will publish it.

**Field plan**

- [ ] Deploy Saturday morning and collect Sunday morning.
- [ ] Send two people, in daylight. Sabkha crust can be soft, so stay on firm ground.
- [ ] Confirm access to the site before Saturday.
- [ ] Film the deployment for the 30-second video.
- [ ] Fallback: bare ground on campus, labelled as a fallback in the submission.

**Rules to respect.** State in the submission that the pod is reused hardware. Check the 13 November guide for what may be prepared before the event.

## Hardware: the sensor pod

There is one piece of hardware: a sensor pod built as a twin of MEDA, the weather station on NASA's Perseverance rover. It took the field data, and it is the only evidence.

**Sensor pod, running live**

- Each part copies a rover instrument, so every reading has a Mars reading to sit beside. A 10 cm ground probe has no rover counterpart.
- It is a slim 3D-printed sensor stick, about 6.5 cm wide and 22 cm tall, on a 1 m pole or tripod, with no arm. Sky sensors face up from the top, the air sensor sits in a vented sleeve, and the ground sensors look down at 30°, facing south. The [mission plan](https://claude.ai/artifact/63jr2LzvYrgKVrKMrtH48E) has the full build, wiring and checks.
- The tilted down-facing light sensor sees only part of the ground, so the app divides the reflectivity ratio by a correction factor. It starts at 0.27 and is replaced by a grey-card measurement before the field run. The pod writes the factor, its height, tilt and direction into the log header.
- Outdoors on its pole, it streams live to the website. A live panel shows each channel beside the same channel from Mars, with the Qatar field curve one click away.
- Its job is to show the field data is ours.

**The 30-second video**

- The video opens on the pod beside a photo of Perseverance's mast with each instrument labelled: the same measurements, one on Mars and one in Qatar.
- A split screen shows the pod and the live panel. Someone covers the up-facing sensor or shades the ground spot, and the reading drops at once on the website.
- It follows the data from the sensor to the Qatar card, then ends on the 24-hour field curves against the satellite estimate, with the error bar.

**Keep it honest**

- The live clip shows that the pod and website work together. The 24-hour field data is the evidence.
- The pod counts in the Doha room and in the video. Global judges see only the submission, so film it.

**Filming kit**

- Set the pod up outdoors on its pole, powered and streaming live to the website.
- Film it with a phone on a stand so the sensors are clearly visible, and screen-record the live panel at the same moment.
- Do one visible action on camera so the readings change: cover the up-facing light sensor, or have someone stand between the Sun and the ground spot. The spot is about 60 cm south of the pole and over a metre wide, so a hand is not enough.
- Bring a spare power bank and a spare cable.

## Where Earth fails

Every fidelity card ends with a fixed block of conditions no Earth site reproduces. These rows are never scored and never hidden.

- **Gravity.** About one-sixth of Earth's on the Moon and one-third on Mars. This matters most for mobility tests.
- **Air.** The Moon has none and Mars has very little. This changes how hardware cools and how dust behaves.
- **Space radiation.** Earth's atmosphere and magnetic field block it at every site.
- **Day length on the Moon.** One lunar day lasts about 29.5 Earth days, so heating and cooling cycles are far slower.
- **Deep cold.** Permanently shadowed lunar craters reach about -203 C ([USGS](https://www.usgs.gov/centers/astrogeology-science-center/news/artemis-iii-mission-tests-san-francisco-volcanic-field)).
- **Lunar dust.** It is not carried by wind, so Earth dust data says little about it. The dust row applies to Mars only.

The brief names low gravity, lunar vacuum, Mars atmospheric conditions and space radiation as limits teams must acknowledge. Stating them on every card is how we meet that.

## How it scores with judges

The project targets the Best Use of Science award, which goes to the project that makes the best and most valid use of the scientific method ([Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide)).

| Criterion | What judges ask | Our answer |
|---|---|---|
| Influence | Is it a big problem, and does it help many? | NASA's Moon Base plan starts with five kinds of tests, and each needs an Earth site |
| Creativity | Is it new or an incremental improvement? | Scoring by test purpose and by month, then measuring our own prediction |
| Validity | Is it scientifically valid and will it work in the real world? | It must re-find NASA's sites, it carries a measured error bar, and it prints its limits |
| Relevance | Does it respond to the challenge, and is it complete and usable? | It delivers what the brief lists: evidence, a less-studied site, operational needs, stated limits |
| Presentation | Did the team tell the story well? | One question, field footage from the sabkha, and two skies side by side |

**What past winners did.** They took the brief and added one real consequence. The 2024 science winner turned an orrery brief into a tool that flags satellite risk zones ([NASA, 2024 winners](https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-international-space-apps-challenge-announces-2024-global-winners/)). A 2025 winner let users design a habitat, then tested it against real solar storms ([NASA, 2025 winners](https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-announces-2025-international-space-apps-challenge-global-winners/)). Our added consequence is a booking decision: which site, which weeks.

**Realistic odds.** Ten winners came from more than 11,500 projects in 2025. The practical target is Doha's top three, then global finalist. The 30-second video will count for more than the idea.

## Build order

Build two targets and two tests completely before adding anything else. A finished narrow tool beats a wide unfinished one.

**Must have**

- Two targets: Shackleton Connecting Ridge and Jezero crater.
- Two tests: power and mobility. Power exercises the Sun path, dust and temperature rows. Mobility exercises terrain, which the Arizona check needs.
- World map with a month slider.
- Fidelity card with the limits block.
- Sun panel for the Moon Base target.
- Validation tab for the four known sites.
- Qatar chart with its three curves.
- Sensor pod streaming live from its pole to the website.
- The 30-second video and the pitch.

**Should have**

- The other three tests: communications, navigation, science tools.
- Weights the user can adjust.
- More validation sites.

**Cut**

- Lunar terrain shadows and communication windows.
- Machine learning and any chatbot.
- A finer grid or extra targets.

## Team plan

Six people: one computer scientist (CS), three computer engineers (CE) and two mechanical engineers (ME). Four build the software, one owns the electronics, and the mechanical engineers own everything physical plus the story.

| Person | Owns | Before Saturday | Saturday | Sunday |
|---|---|---|---|---|
| CS | Web app and integration | Pick the map library and hosting. Run the NASA POWER check | Map with month slider. Fidelity card | Proof tabs and live pod panel. Polish |
| CE 1 | Data | Run the MEDA and terrain checks | Earth grids and target values for power and mobility | Remaining rows. Data list for the references field |
| CE 2 | Sun path and scoring | Run the Horizons check | Sun-path module. Scores for power and mobility | Validation run on the four sites. Final tolerances |
| CE 3 | Electronics | Test the pod sensors. Collect the parts | Pod logging and log header. Grey-card factor. Deploy the pod with ME 2 | Live pod feed into the app |
| ME 1 | Sensor stick and pole | Measure the boards and pole. Model the sensor stick in SolidWorks | Print the stick and fix it on the pole or tripod | Fit electronics with CE 3. Film the demo video |
| ME 2 | Field work, limits and pitch | Confirm site access. Read the 13 November guides | Deploy and film the pod. Write the limits block and tolerances with CE 2 | Collect the pod. Three-curve chart with CE 1. Video, submission text, pitch |

"Before Saturday" means feasibility checks and reading only. Build the product during the event.

**Checkpoints**

1. Saturday 2 pm: real data shows on the map for one target.
2. Saturday 10 pm: one target and one test work end to end, from data to fidelity card.
3. Sunday noon: pod set up outdoors on its pole and streaming live, ready to film.
4. Sunday 6 pm: feature freeze. Only fixes, video and submission text after this.
5. Sunday 9 pm: submit. The deadline is 11:59 pm local time, so this leaves a three-hour buffer.

## Checks before committing

Nothing in this brief has been run yet. These six checks decide whether the plan stands, and each should take under an hour.

- [ ] **Sun path.** Horizons returns the Sun's azimuth and elevation for a point on the lunar surface.
- [ ] **Mars day.** One MEDA file downloads and plots ground temperature and UV for a full Mars day.
- [ ] **Earth point data.** NASA POWER returns hourly values for the Qatar grid cell.
- [ ] **Terrain.** Slope statistics compute for one lunar site and one Earth site from LOLA and SRTM.
- [ ] **Rules.** The 13 November guides confirm what may be prepared before the event, and the video and slide limits.
- [ ] **Site.** Access to the sabkha is confirmed, with the campus fallback ready.

**If a check fails**

- Sun path fails: use NASA's SPICE toolkit for the same angles. If that also fails, drop the Sun panel and keep the other rows.
- Mars day fails: use published Jezero values from the MEDA papers and label them as published, not pulled.
- Terrain fails: start with the power test only, which does not need it.
- Site access fails: use the campus fallback and say so in the submission.

## Sources

Pages opened and read on 10 November 2026. The Horizons manual was read in part.

- [NASA: 2025 Space Apps Global Winners](https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-announces-2025-international-space-apps-challenge-global-winners/)
- [NASA: 2024 Space Apps Global Winners](https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-international-space-apps-challenge-announces-2024-global-winners/)
- [Space Apps Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide)
- [R&D World: NASA outlines path to Moon base](https://www.rdworldonline.com/nasa-outlines-path-to-moon-base-permanent-lunar-presence/)
- [USGS: Artemis III mission tests in the San Francisco Volcanic Field](https://www.usgs.gov/centers/astrogeology-science-center/news/artemis-iii-mission-tests-san-francisco-volcanic-field)
- [NASA Science: 10 Things to Know About Planetary Analogs](https://science.nasa.gov/solar-system/planetary-analogs/10-things-to-know-about-planetary-analogs/)
- [JPL Horizons System manual](https://ssd.jpl.nasa.gov/horizons/manual.html)
- [NASA PDS: Perseverance MEDA data](https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html)
- [Qatar University: gypsum deposits in Qatar's hypersaline wetlands, astrobiological perspective](https://qspace.qu.edu.qa/handle/10576/57426)

The challenge wording comes from the team's Space Apps 2026 challenge compendium. The official challenge page takes precedence.
