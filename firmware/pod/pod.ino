#include <Arduino.h>
#include <Adafruit_BMP280.h>
#include <Adafruit_MLX90614.h>
#include <BH1750.h>
#include <DHT.h>
#include <DallasTemperature.h>
#include <LittleFS.h>
#include <OneWire.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <WiFi.h>
#include <Wire.h>
#include <esp_sntp.h>
#include <esp_timer.h>
#include <atomic>
#include <time.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif

// Defaults from the mission plan. Set the measured values before the field run.
constexpr float poleHeightM = 1.0f;
constexpr int tiltDeg = 30;
constexpr int facingDeg = 180;
constexpr float reflectivityFactor = 0.27f;
// Keep this empty until the team measures the offset.
constexpr char airTemperatureOffsetC[] = "";

// BH1750 1.3.0 scales the maximum raw reading by 69 / MTreg / 1.2 in this mode.
constexpr uint8_t lightMtreg = 31;
constexpr float luxMax = UINT16_MAX * (69.0f / lightMtreg) / 1.2f;

constexpr uint8_t sdaPin = 21;
constexpr uint8_t sclPin = 22;
constexpr uint8_t uvPin = 34;
constexpr uint8_t airPin = 26;
constexpr uint8_t soilPin = 27;
constexpr uint8_t upAddress = 0x23;
constexpr uint8_t downAddress = 0x5c;
constexpr uint8_t irAddress = 0x5a;
constexpr uint8_t pressureAddresses[] = {0x76, 0x77};
constexpr int64_t microsPerSecond = 1000000;
constexpr int64_t sampleInterval = 2 * microsPerSecond;
constexpr time_t secondsPerMinute = 60;
constexpr char logPath[] = "/log.csv";
constexpr char columnLine[] = "ts,lux_up,lux_dn,tg,tamb,uv,ta,rh,p,t10";

enum Field { Up, Down, Ground, InfraredBody, UV, Air, Humidity, Pressure, Soil, FieldCount };
using Readings = float[FieldCount];

BH1750 upLight;
BH1750 downLight;
Adafruit_MLX90614 infrared;
Adafruit_BMP280 pressureSensor;
DHT airSensor(airPin, DHT22);
OneWire soilBus(soilPin);
DallasTemperature soilSensor(&soilBus);
WebSocketsServer socketServer(81);
WebServer httpServer(80);

bool upReady;
bool downReady;
bool infraredReady;
uint8_t pressureAddress;
bool soilReady;
bool storageReady;
bool logReady;
bool networkStarted;
bool clockRequested;
std::atomic<bool> clockSynced{false};
time_t utcAnchor;
int64_t monotonicAnchor;
int64_t lastSample;
time_t minuteEnd;
float sums[FieldCount];
unsigned counts[FieldCount];

bool responds(uint8_t address) {
  Wire.beginTransmission(address);
  return Wire.endTransmission() == 0;
}

bool initLight(BH1750& sensor, uint8_t address, const char* name) {
  const bool ready = sensor.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, address, &Wire)
      && sensor.setMTreg(lightMtreg);
  if (!ready) Serial.printf("# %s missing or initialization failed\n", name);
  return ready;
}

void initSensors() {
  Wire.begin(sdaPin, sclPin, 100000);
  for (uint8_t address = 1; address < 127; ++address) {
    if (responds(address)) Serial.printf("# I2C device at 0x%02X\n", address);
  }

  upReady = initLight(upLight, upAddress, "Up-facing BH1750");
  downReady = initLight(downLight, downAddress, "Down-facing BH1750");
  infraredReady = infrared.begin(irAddress, &Wire);
  if (!infraredReady) Serial.println("# MLX90614 missing or initialization failed");
  for (uint8_t address : pressureAddresses) {
    if (responds(address) && pressureSensor.begin(address)) {
      pressureAddress = address;
      break;
    }
  }
  if (!pressureAddress) Serial.println("# BMP280 missing or initialization failed");
  Wire.setClock(100000);
  airSensor.begin();
  soilSensor.begin();
  soilReady = soilSensor.getDeviceCount() > 0;
  if (soilReady) {
    soilSensor.setWaitForConversion(false);
    soilSensor.requestTemperatures();
  } else {
    Serial.println("# DS18B20 missing");
  }
  Serial.println("# Verify the analog UV module is connected before the field run");
}

float readLight(BH1750& sensor, bool ready) {
  if (!ready) return NAN;
  const float reading = sensor.readLightLevel();
  return reading >= 0 ? reading : NAN;
}

void readSensors(Readings& readings) {
  readings[Up] = readLight(upLight, upReady);
  readings[Down] = readLight(downLight, downReady);
  readings[Ground] = infraredReady ? infrared.readObjectTempC() : NAN;
  readings[InfraredBody] = infraredReady ? infrared.readAmbientTempC() : NAN;

  constexpr unsigned uvSamples = 16;
  unsigned millivolts = 0;
  for (unsigned sample = 0; sample < uvSamples; ++sample) {
    millivolts += analogReadMilliVolts(uvPin);
  }
  readings[UV] = static_cast<float>(millivolts) / uvSamples / 100.0f;

  readings[Air] = airSensor.readTemperature();
  readings[Humidity] = airSensor.readHumidity();
  if (!isfinite(readings[Air]) || !isfinite(readings[Humidity])) {
    static bool reported;
    if (!reported) Serial.println("# DHT22 missing or reading failed");
    reported = true;
  }

  readings[Pressure] = pressureAddress && responds(pressureAddress)
      ? pressureSensor.readPressure() / 100.0f : NAN;
  readings[Soil] = NAN;
  if (soilReady) {
    const float temperature = soilSensor.getTempCByIndex(0);
    if (temperature != DEVICE_DISCONNECTED_C) readings[Soil] = temperature;
    soilSensor.requestTemperatures();
  }
}

String headerLine(unsigned index) {
  switch (index) {
    case 0: return String("# pole_height_m=") + String(poleHeightM, 2);
    case 1: return String("# tilt_deg=") + String(tiltDeg);
    case 2: return String("# facing_deg=") + String(facingDeg);
    case 3: return String("# refl_factor=") + String(reflectivityFactor, 4);
    case 4: return String("# ta_offset_c=") + airTemperatureOffsetC;
    case 5: return String("# lux_max=") + String(luxMax, 3);
    default: return columnLine;
  }
}

bool writeHeader(Print& output) {
  for (unsigned index = 0; index < 7; ++index) {
    const String line = headerLine(index);
    if (output.println(line) != line.length() + 2) return false;
  }
  return true;
}

String csvRecord(time_t timestamp, const Readings& readings) {
  struct tm utc;
  char date[sizeof("2026-11-14T02:51:00Z")];
  gmtime_r(&timestamp, &utc);
  strftime(date, sizeof(date), "%Y-%m-%dT%H:%M:%SZ", &utc);

  String row;
  row.reserve(160);
  row += date;
  for (float value : readings) {
    row += ',';
    if (isfinite(value)) row += String(value, 3);
  }
  return row;
}

bool startLog(time_t start) {
  if (LittleFS.exists(logPath)) {
    // Each boot starts a new header. Preserve the previous run on the board.
    const String previous = String("/log-") + String(static_cast<unsigned long>(start)) + ".csv";
    if (LittleFS.exists(previous) || !LittleFS.rename(logPath, previous)) {
      Serial.println("# Could not preserve previous log");
      return false;
    }
  }
  File log = LittleFS.open(logPath, FILE_WRITE);
  if (!log || !writeHeader(log)) {
    Serial.println("# Could not write log header");
    return false;
  }
  return true;
}

void logSample(time_t timestamp, const Readings& readings) {
  if (timestamp >= minuteEnd) {
    Readings averages;
    for (unsigned field = 0; field < FieldCount; ++field) {
      averages[field] = counts[field] ? sums[field] / counts[field] : NAN;
      sums[field] = 0;
      counts[field] = 0;
    }

    File log = LittleFS.open(logPath, FILE_APPEND);
    const String row = csvRecord(minuteEnd, averages);
    if (!log || log.println(row) != row.length() + 2) {
      Serial.println("# Could not append minute to log");
    }
    minuteEnd = (timestamp / secondsPerMinute + 1) * secondsPerMinute;
  }

  for (unsigned field = 0; field < FieldCount; ++field) {
    if (isfinite(readings[field])) {
      sums[field] += readings[field];
      ++counts[field];
    }
  }
}

void serveLog() {
  File log = LittleFS.open(logPath, FILE_READ);
  if (log) {
    httpServer.streamFile(log, "text/csv");
  } else {
    httpServer.send(404, "text/plain", "Log unavailable");
  }
}

void socketEvent(uint8_t client, WStype_t event, uint8_t*, size_t) {
  if (event != WStype_CONNECTED) return;
  for (unsigned index = 0; index < 7; ++index) {
    String line = headerLine(index);
    socketServer.sendTXT(client, line);
  }
}

void serviceNetwork() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (!clockRequested) {
    clockRequested = true;
    sntp_set_time_sync_notification_cb([](struct timeval*) { clockSynced.store(true); });
    configTime(0, 0, "pool.ntp.org");
  }
  if (!networkStarted) {
    networkStarted = true;
    socketServer.begin();
    httpServer.begin();
    Serial.print("# Pod IP: ");
    Serial.println(WiFi.localIP());
  }
  socketServer.loop();
  httpServer.handleClient();
}

void setup() {
  Serial.begin(115200);
  writeHeader(Serial);
  initSensors();

  storageReady = LittleFS.begin();
  if (!storageReady) Serial.println("# LittleFS mount failed");
  socketServer.onEvent(socketEvent);
  httpServer.on(logPath, HTTP_GET, serveLog);

  if (wifiName[0] == '\0') {
    Serial.println("# Set the field Wi-Fi name and password in secrets.h");
  } else {
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(wifiName, wifiPassword);
  }
}

void loop() {
  // A serial terminal that opens without resetting the ESP32 can request the header.
  while (Serial.available()) {
    if (Serial.read() == '\n') writeHeader(Serial);
  }
  serviceNetwork();
  if (!clockSynced.load()) {
    delay(1);
    return;
  }

  const int64_t now = esp_timer_get_time();
  if (!utcAnchor) {
    struct timeval utc;
    gettimeofday(&utc, nullptr);
    utcAnchor = utc.tv_sec;
    monotonicAnchor = now - utc.tv_usec;
    minuteEnd = (utcAnchor / secondsPerMinute + 1) * secondsPerMinute;
    logReady = storageReady && startLog(utcAnchor);
    lastSample = now - sampleInterval;
  }
  if (now - lastSample < sampleInterval) {
    delay(1);
    return;
  }
  lastSample = now;

  // Use elapsed monotonic time so reconnects and later NTP corrections cannot
  // repeat or reorder timestamps within a run.
  const time_t timestamp = utcAnchor + (now - monotonicAnchor) / microsPerSecond;
  Readings readings;
  readSensors(readings);
  String row = csvRecord(timestamp, readings);
  Serial.println(row);
  if (WiFi.status() == WL_CONNECTED) socketServer.broadcastTXT(row);
  if (logReady) logSample(timestamp, readings);
}
