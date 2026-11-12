# Proving Ground: mission plan, software and hardware

This file is the markdown copy of `Proving Ground mission plan, software and hardware.docx`, as the team saved it on 12 November 2026. A script made the copy, so the wording is the team's. Where this file and the `.docx` differ, this file wins. It differs in one place: the app has four views, not three, because Mission 4 adds the live panel.

`docs/project-brief.md` holds the idea, the scoring rules, and the data sources. Where the two differ, this file wins, because it is newer.

Nov 11, 2026 · @Us

The project runs as four missions. Each one lists its software tasks, its hardware tasks and how the two work together. The hardware to buy is budgeted at 200 QAR or less.

## How hardware and software connect

There is one piece of hardware: a sensor pod built as a twin of MEDA, the weather station on NASA's Perseverance rover. Each pod part copies a rover instrument, so every reading has a Mars reading to sit beside. The pattern is the same each time: the app predicts, the pod measures, the app compares.

| Pod part | Rover counterpart | Where the app uses it | Missions |
|---|---|---|---|
| Infrared sensor, tilted 30° down and south | Infrared ground-temperature sensor | Day-to-night ground temperature row | 1, 3 |
| Two light sensors, one up and one down | Sunlight and reflected-sunlight sensors | Ground reflectivity row and the Sun-path check | 1, 2, 3 |
| UV sensor | UV sensor | UV row | 1, 3 |
| Air temperature and humidity sensor | Air temperature and humidity sensors | Air temperature and humidity rows | 1, 3 |
| Pressure sensor | Pressure sensor | Pressure row, which we expect to fail the match | 1, 3 |
| Ground probe at 10 cm | None | How fast heat travels into the ground | 3 |

The pod does not copy the rover's wind and dust sensors.

The pod is a slim printed sensor stick on a 1 m pole. Pod design gives the full build.

The software side is one web app with four views: the site finder, the Sun panel, the ground-truth chart, and the live panel.

## Mission 1: Site finder

**Goal.** For a chosen target and test, rank Earth sites by month and show a fidelity card with numbers and limits.

**Software tasks**

- [ ] Pull Earth data onto a half-degree land grid, per month.
- [ ] Pull target values for Shackleton Connecting Ridge and Jezero crater.
- [ ] Score each quantity from 0 to 1 against a stated tolerance.
- [ ] Combine the scores for the power test and the mobility test.
- [ ] Draw the world map with a month slider.
- [ ] Build the fidelity card, ending with the fixed limits block.
- [ ] Give each pod channel its own row: ground temperature, reflectivity, UV, air temperature, humidity and pressure.
- [ ] Run the check against the four sites NASA already uses and report every result.

**Hardware tasks**

- [ ] Give each pod reading a name and unit that matches a row on the card.

**How they work together.** The map gives a satellite estimate for every site. Where the pod has been, the card swaps the estimate for the measured value and marks that row "measured". The card for the Qatar site is the first one with measured rows.

**Done when.** One target and one test work end to end, and the Qatar card shows at least three measured rows.

## Mission 2: Sun path

**Goal.** Find where and when Earth's Sun behaves like the Sun at the target, and check the software's Sun calculation against the real Sun.

**Software tasks**

- [ ] Get the Sun's height and direction at the target through one lunar day, from JPL Horizons.
- [ ] Compute the same two angles for every Earth land cell and month.
- [ ] Match on three numbers and feed the result into the power score.
- [ ] Show the target's sky and the Earth site's sky side by side.
- [ ] Predict sunrise, sunset and the time of highest Sun for the pod's field site and date.
- [ ] Overlay the pod's measured light curve on that prediction.

**Hardware tasks**

- [ ] Mount the upward light sensor facing straight up, clear of shadows.
- [ ] Set the light sensors' range for full sunlight in code, or fit matching diffusers on both.
- [ ] Log light level once a minute for the full 24 hours, with a time stamp.
- [ ] Set the pod's clock before deployment and note its position.

**How they work together**

1. The app computes the Sun's path for the pod's position and date.
2. The pod records the real light level through the day.
3. The app compares predicted and measured sunrise, sunset and peak time.
4. The gap, in minutes, is printed beside the Sun panel as a check on the Sun code.

**What this does not show.** It checks our Sun calculation on Earth only. It says nothing about lunar terrain shadows, and haze or cloud will blur the light curve near sunrise and sunset.

**Done when.** The Sun panel works for the Moon Base target, and the measured light curve sits on the predicted one with the gap stated in minutes.

## Mission 3: Ground truth

**Goal.** At one site the map predicts, measure the same quantities Perseverance measures on Mars, and find out how far off the satellite estimates were.

**Hardware tasks**

- [ ] Print the sensor stick and fix it on a pole or tripod about 1 m tall.
- [ ] Ground temperature: tilt the infrared sensor 30° outward from the bottom cap, facing south at bare ground.
- [ ] Reflectivity: mount one light sensor facing straight up on the top cap, and one tilted down beside the infrared sensor, with its collar.
- [ ] Sky: mount the UV sensor facing straight up on the top cap.
- [ ] Air: hang the temperature and humidity sensor inside the vented air sleeve.
- [ ] Pressure: put the pressure sensor in the electronics bay, next to its vent hole.
- [ ] Depth: bury one temperature probe 10 cm down where the infrared sensor's view lands, about 60 cm south of the pole.
- [ ] Log every sensor once a minute for 24 hours to the board's own memory, on a power bank.
- [ ] Measure the reflectivity correction factor once: lay a photographer's 18% grey card flat in full sun about 10 cm under the bottom cap, so it fills the down sensor's view. Factor = (down reading ÷ up reading) ÷ 0.18. If there is no grey card, keep 0.27 and list it as a limit.
- [ ] Start the log with a header: pole height, tilt angle, facing direction, the correction factor and the air-temperature offset.

**Software tasks**

- [ ] Write the ESP32 code to the wiring table: the second light sensor at address 0x5C, the I2C bus at 100 kHz for the infrared sensor, and the UV sensor on GPIO 34.
- [ ] Import the pod's log file.
- [ ] Read the log header: pole height, tilt angle, facing direction, reflectivity correction factor and air-temperature offset. The app takes these from the header, not from hard-coded values.
- [ ] Compute reflectivity as the downward light reading divided by the upward one, then divided by the correction factor. The tilted, collared sensor sees only part of the ground, so the plain ratio is about 0.27 times the real value. Start with 0.27 and replace it with the grey-card factor once measured.
- [ ] Plot three curves per channel: the pod, the satellite-based value for that grid cell, and one Mars day from MEDA.
- [ ] Compute the gap between the pod and the satellite value, and show it as the error bar.
- [ ] Add the air-temperature offset from the thermometer check to that row's error bar. The air sleeve has no fan, so midday readings may run high.
- [ ] Fill the measured rows on the Qatar card and score each against Jezero.
- [ ] Compare the surface and 10 cm temperature curves to show how slowly heat travels into the ground.

**How they work together**

1. The app names the site and predicts its values from satellite data.
2. The pod sits there for 24 hours and logs the real values, channel by channel.
3. The app imports the log and lays each channel beside the same channel from Mars.
4. The app replaces estimates with measurements and reports how far off the estimates were.

**What this does not show.** It is one site for one day, measured with hobby sensors that are not laboratory calibrated. The light sensors see visible light only, so our reflectivity is not the full-sunlight value the rover reports. The down-facing light sensor sees one patch of ground through its collar, so reflectivity covers that patch only. The pod has no wind or dust sensor.

**Done when.** The Qatar card shows six measured rows, each with an error bar and a Mars value beside it.

**Optional extra.** A push-probe for ground firmness can be added if everything above works by Saturday afternoon. It has no Mars data to compare with, so it stays out of the core plan.

## Mission 4: Demo video and submission

**Goal.** Show the pod working and the data reaching the website in one 30-second video, then submit on time.

**Hardware tasks**

- [ ] Set the pod up outdoors on its pole, powered and streaming live to the website.
- [ ] Print a photo of Perseverance's mast with each instrument labelled, and label the matching part on the pod.
- [ ] Film the pod with a phone on a stand so the sensors are clearly visible.
- [ ] Do one visible action on camera so the readings change: cover the up-facing light sensor, or have someone stand between the Sun and the ground spot. The spot is about 60 cm south of the pole and over a metre wide, so a hand is not enough.
- [ ] Bring a spare power bank and a spare cable.

**Software tasks**

- [ ] Add a live panel that shows each pod channel as it arrives, beside the same channel from Mars.
- [ ] Screen-record the live panel while the pod is filmed, so both show the same moment.
- [ ] Show the data path on screen: sensor, ESP32, website, Qatar card.
- [ ] Keep the Qatar field card one click away from the live panel.
- [ ] Edit the footage into the 30-second video, including the field curves.
- [ ] Write the submission text and list every data source and reused part in the references field.

**How they work together**

1. The video opens on the pod beside the rover photo: the same measurements, one on Mars and one in Qatar.
2. A split screen shows the pod and the live panel. Someone shades a sensor, and its reading drops at once on the website.
3. The video follows the data from the sensor to the Qatar card, which fills its measured rows with the Mars value beside each.
4. It ends on the 24-hour field curves against the satellite estimate, with the error bar.

The live clip shows that the pod and website work together. The 24-hour field data is the evidence.

**Done when.** The demo runs twice in a row without a restart, and the project is submitted by 9 pm Sunday. The deadline is 11:59 pm local time.

## Why we built this hardware

We built it because a satellite map is only an estimate, and the app needs real measurements to check itself. These are short answers for judges.

- **Why any hardware?** The pod measures one site and tells us how far off the satellite estimate was. Without it, every score is unchecked.
- **Why copy the rover's weather station?** Perseverance's MEDA data is public, one file per Mars day ([NASA PDS](https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html)). Copying its channels means each of our readings has a Mars reading beside it.
- **Why these sensors?** Each one matches a MEDA channel: ground temperature by infrared, sunlight and reflected sunlight, UV, air temperature, humidity and pressure.
- **Why not a model or a robot?** We considered a lamp-and-terrain rig and a ground push-probe. The rig only displayed the app's output. The probe had no Mars data to compare with.
- **What does it not prove?** It is one site for one day, with hobby sensors. It has no wind or dust sensor, and its reflectivity covers visible light only.
- **What did it cost?** Under 200 QAR in parts. The table below lists each one.

## Pod design: the sensor stick

The pod is one printed tube, about 6.5 cm wide and 22 cm tall, sitting on top of a pole about 1 m high. It has no arm: the sky sensors face up from the top cap, and the ground sensors look down and outward from the bottom cap.

| Section, top to bottom | Height | Holds | Design notes |
|---|---|---|---|
| Top cap | 1.5 cm | Up-facing light sensor, UV sensor | Flat, with nothing higher than the two sensors. Open holes, no window, because clear plastic blocks UV. |
| Electronics bay | 8 cm | ESP32, mini breadboard, pressure sensor | ESP32 stands upright on printed rails. The breadboard is the hub where 3.3 V, ground and the two I2C lines are shared. One small vent hole near the top for the pressure sensor. |
| Air sleeve | 6 cm | Air temperature and humidity sensor | Slots angled at 45° all the way round. The bay above shades it, and the ESP32's heat rises away from it. Cables pass through its centre. |
| Bottom cap | 3.5 cm | Infrared sensor, down-facing light sensor | Both sensors tilted 30° outward on the same side. A collar 12 mm wide and 10 mm long on the light sensor only. One drain hole. |
| Pole socket | 3 cm | The pole or a tripod screw | See mounting below. |

**Why this order.** Heat rises, so the ESP32 sits above the air sensor instead of warming it. The tilt keeps the pole out of the ground sensors' view, and the collar stops the tilted light sensor from seeing the sky. The infrared sensor has no collar, because the collar's own heat would leak into its reading.

**Mounting.** Either option takes the stick about 1 m above the ground.

- **Tripod:** a hexagon pocket under the bottom cap holds a 1/4-inch nut, and the stick screws onto a camera tripod. Hang a bag of sand from the tripod's hook against wind.
- **PVC pipe, 20 or 25 mm:** the socket slides over the pipe with 0.3 to 0.4 mm clearance, and one bolt through socket and pipe stops the stick turning. In soft ground, slide the pipe over a steel rod or tent stake driven 30 to 40 cm down. On hard ground or a rooftop, stand it in a bucket of sand.

**Placement.** In Qatar the Sun is to the south, so the stick's shadow falls to the north. Aim the ground sensors south, at sunlit bare ground. Bury the probe 10 cm deep where the infrared sensor's view lands, about 60 cm south of the pole, and bury its cable just under the surface. Keep the power bank at the foot of the pole, in shade, with one USB cable up to the bay. A 10,000 mAh bank covers the 24-hour run.

### Wiring

Every sensor runs on 3.3 V from the ESP32, and all grounds join on the breadboard. The ESP32 connects to the breadboard with male-to-female jumper wires, so nothing needs soldering.

| Sensor | Connection | ESP32 pin |
|---|---|---|
| Up-facing light sensor | I2C, ADDR pin to ground (address 0x23) | GPIO 21 (SDA), GPIO 22 (SCL) |
| Down-facing light sensor | I2C, ADDR pin to 3.3 V (address 0x5C) | GPIO 21, GPIO 22 |
| Infrared sensor | I2C (address 0x5A); keep the bus at 100 kHz | GPIO 21, GPIO 22 |
| Pressure sensor | I2C (address 0x76 or 0x77) | GPIO 21, GPIO 22 |
| UV sensor | Analog output | GPIO 34, which still reads correctly with Wi-Fi on |
| Air temperature and humidity sensor | Digital data | GPIO 26 |
| Ground probe | Digital data, 4.7 kilohm resistor from data to 3.3 V | GPIO 27 |

The I2C cable down to the bottom cap is about 20 cm, which is fine. Once everything works, fix the jumper wires with hot glue, because they loosen when the pole moves.

### Parts the code talks to

The software plan starts from this table. Each part has one row: what the code reads, how and in what unit. All libraries install from the Arduino IDE library manager.

| Part | Exact model | Connection and pin | Unit sent to the app | Arduino library | Notes for the code |
|---|---|---|---|---|---|
| Controller | NodeMCU ESP-32S, already owned | USB 5 V from the power bank | None | Arduino core for ESP32 | Gets the time from the internet (NTP) at start-up, because it has no clock of its own. Streams live over Wi-Fi and logs to its own flash memory (LittleFS). |
| Up-facing light sensor | BH1750 | I2C 0x23, GPIO 21 and 22 | lux | BH1750 (Christopher Laws) | Set a shorter measurement time (MTreg 31) so full sunlight, about 100,000 lux, does not overflow the default 65,535 limit. |
| Down-facing light sensor | BH1750 | I2C 0x5C (ADDR to 3.3 V), GPIO 21 and 22 | lux | BH1750 (Christopher Laws) | Same settings as the up-facing one. Reflectivity = (down ÷ up) ÷ correction factor, worked out in the app. |
| Infrared sensor | MLX90614, long-range version from Voltaat | I2C 0x5A, GPIO 21 and 22 | °C | Adafruit MLX90614 | Send the object temperature (the ground). Its ambient reading is the sensor's own temperature, so log it but don't use it as air temperature. Keep the bus at 100 kHz. |
| Pressure sensor | BMP280 | I2C 0x76 or 0x77, GPIO 21 and 22 | hPa | Adafruit BMP280 | Scan the bus once to find which address the board uses. |
| Air temperature and humidity | DHT22 | Digital, GPIO 26 | °C and % relative humidity | DHT sensor library and Adafruit Unified Sensor (Adafruit) | Read no faster than once every 2 seconds. If the kit's blue DHT11 is used instead, change the sensor type in code and expect about ±2 °C. |
| UV sensor | GUVA-S12SD analog module | Analog, GPIO 34 | UV index | None, built-in analogReadMilliVolts() | UV index ≈ output in millivolts ÷ 100. This is the usual rule for this module, not a calibration, so label it approximate. Average about 16 readings, because the ESP32's analog input is noisy. |
| Ground probe | DS18B20 waterproof, 2 m cable or extended | Digital, GPIO 27, 4.7 kilohm pull-up to 3.3 V | °C | OneWire and DallasTemperature | One reading takes about 0.75 seconds at full resolution. |
| Grey card | Photographer's 18% grey card | None | None | None | Used once to measure the reflectivity correction factor, which is typed into the log header. |

**Timing.** Read every sensor every 2 seconds for the live panel, and log the one-minute average with a time stamp. Each log row holds the time and the readings above, under the header with pole height, tilt, facing direction, correction factor and air-temperature offset.

### Printing

- **Material:** PETG or ASA, in white. PLA softens in the Qatar sun.
- **Parts:** three prints joined with M3 screws: top cap with the bay, the air sleeve, and the bottom cap with the socket.
- **Settings:** 3 to 4 walls and 20 to 30% infill. The sleeve's 45° slots print upright with no supports.
- **Fit:** measure every board, the breadboard and the pole with calipers first, and leave 0.3 to 0.4 mm clearance around each.
- **Test first:** print a thin slice of the bay with just the board rails and screw holes before the full print.

### Checks before the field run

- [ ] Run the stick on a table for a few hours with every channel logging, and check the log has no gaps.
- [ ] Hang a normal thermometer in shade next to the stick for 10 minutes. The air reading should agree within about 1 °C. Write the difference into the log header as the air-temperature offset.
- [ ] Put a hand on the pole under the bottom cap. If the infrared reading changes, the pole is in its view: raise the tilt to 40°.
- [ ] Shake the pole gently while watching the live panel. No reading should drop out.

## Parts and cost in Qatar

The parts to buy come to about 188 QAR, reusing the pod's controller board. Prices are in Qatari riyals as listed by [Voltaat](https://www.voltaat.com/), an electronics store in Duhail, Doha, on 11 November 2026.

| Part | Used for | Qty | Unit price (QAR) | Total (QAR) |
|---|---|---|---|---|
| [MLX90614 infrared sensor](https://www.voltaat.com/products/non-contact-infrared-temperature-sensor-mlx90614-long-range) | Ground temperature | 1 | 44 | 44 |
| [BH1750 light sensor](https://voltaat.com/products/bh1750-light-intensity-illumination-module) | Sunlight and reflected sunlight | 2 | 13 | 26 |
| [UV light sensor](https://voltaat.com/products/uv-light-sensor) | UV level | 1 | 19 | 19 |
| [DHT22 sensor](https://www.voltaat.com/collections/arrivals/products/dht22-temperature-humidity-sensor) | Air temperature and humidity | 1 | 27 | 27 |
| [BMP280 pressure sensor](https://www.voltaat.com/products/barometric-pressure-altitude-i2c-sensor-bmp280) | Air pressure | 1 | 13 | 13 |
| [DS18B20 waterproof probe](https://www.voltaat.com/products/digital-thermometer) | Ground temperature at 10 cm | 1 | 13 | 13 |
| [Mini breadboard](https://www.voltaat.com/products/mini-breadboard) | Wiring | 1 | 7 | 7 |
| [Jumper wires, male to female, 40](https://www.voltaat.com/products/short-jumper-wires-female-to-male-40-pack) | Wiring | 1 | 7 | 7 |
| [Jumper wires, male to male, 40](https://www.voltaat.com/products/short-jumper-wires-male-to-male-40-pack) | Wiring | 1 | 7 | 7 |
| Pole, printed stick and screws | Pod housing | 1 set | 25 (our estimate) | 25 |
| Total to buy |  |  |  | 188 |

**Notes on the list**

- **Already owned, so not counted:** the NodeMCU ESP-32S board, a power bank, a USB cable and the laptops.
- **If a new board is needed.** An [ESP32 board](https://www.voltaat.com/products/doit-esp32-devkit-v1-development-board) is 39 QAR, which takes the total to 227 QAR. To stay under 200, replace the infrared sensor with a second temperature probe laid on the surface. That brings it to about 196 QAR.
- **Stock.** The pressure sensor and the waterproof probe each showed 1 in stock. Check before going.
- **Small parts from the lab.** One 4.7 kilohm resistor for the temperature probe, and an 18% grey card if anyone has one, for the reflectivity correction.
- **Probe cable.** The probe needs about 2 m of cable to reach from the stick, down the pole and 60 cm out. If its cable is 1 m, extend it with three-core wire or buy a longer version.
- **The 25 QAR line is a guess.** It covers a PVC pipe, printing filament, M3 screws and a bolt for the pole socket. A tripod someone already owns makes the pipe unnecessary.
- **How we checked.** We opened the waterproof probe page in full. The other prices come from the store's listings in search results, so confirm price and stock before buying.

## Open questions

Six things the team must settle before buying parts.

- [ ] **Budget currency.** This plan assumes 200 Qatari riyals. If the limit is 200 US dollars, there is room for spare sensors and a dust sensor.
- [ ] **What the pod already has.** List its current sensors and remove them from the buy list.
- [ ] **Sizes for the 3D model.** Measure the breadboard, the ESP32 and the pole's outside diameter before modelling the bay and socket. A full-size breadboard does not fit the stick.
- [ ] **Light sensor range.** Full sunlight can exceed the light sensor's default range. Test the range setting outdoors at midday before the field day.
- [ ] **Stock.** Confirm the pressure sensor and the waterproof probe are available, or pick substitutes.
- [ ] **Rules and access.** Read the 13 November guides on hardware prepared before the event, and confirm access to the field site.

## Sources

Pages opened and read on 10 and 11 November 2026.

- [NASA PDS: Perseverance MEDA instrument and data](https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html)
- [Voltaat: DS18B20 waterproof temperature probe](https://www.voltaat.com/products/digital-thermometer)

Data sources for the software, such as NASA POWER, MEDA and JPL Horizons, are listed in the [project brief](https://claude.ai/artifact/PrB2YcnUFVUSAH7sgrDzUj).
