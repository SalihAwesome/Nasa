# Pod firmware

Build the `pod` sketch for NodeMCU-32S with Arduino CLI and the ESP32 core. See [the tested versions](../docs/verified-facts.md#pod-firmware-toolchain).

```sh
arduino-cli compile --fqbn esp32:esp32:nodemcu-32s firmware/pod
```

Copy `pod/secrets.example.h` to `pod/secrets.h` and set the field Wi-Fi name and password before flashing. The sketch uses the empty example for compile-only checks. Set the measured air-temperature offset and grey-card correction factor at the top of `pod.ino` before collecting field data. The initial pole height, tilt, heading, and grey-card factor are project defaults. The air-temperature offset stays empty until measured.

Prepare the LittleFS partition on a new board before the first run. Use the ESP32 core's bundled `mklittlefs` and `esptool` to write an empty filesystem to the data partition for the selected board layout. The sketch reports a mount failure over serial and preserves flash contents. A new run keeps the previous log on flash and opens a fresh `/log.csv`. The active log is available at `http://<pod-ip>/log.csv`, and the live stream is at `ws://<pod-ip>:81`. The serial monitor uses 115,200 baud. Send a newline if it opens without resetting the board and you need the header.

Check the UV module connection before logging. Its analog output gives the firmware no connection status, and darkness can give the same reading as a disconnected module. Flash and bench-test the board before field use. Save 60 seconds of serial output in `firmware/sample-output.txt` after confirming the log has no gaps.

[Pod protocol](../docs/pod-protocol.md) · [Wiring and parts](../docs/mission-plan.md#pod-design-the-sensor-stick)
