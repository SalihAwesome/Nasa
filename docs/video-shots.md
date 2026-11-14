# Recording shot list

Source: [Mission 4](mission-plan.md#mission-4-demo-video-and-submission).

| Shot | Route | Action | Length |
| --- | --- | --- | ---: |
| 1. Pod and rover | `#/live` (set up before the take) | Open on the pod beside the labelled Perseverance mast photo. Point out the matching instruments. | 5 s |
| 2. Live response | `#/live` (same view) | Show the pod and live panel side by side. Shade the upward light sensor and hold the shot until **Upward light** drops. In replay, cue the falling part of the simulator log and keep the **simulated** label visible. | 8 s |
| 3. Qatar card | `#/card/pod` | Show **Sensor → ESP32 → Website → Qatar card**, then click **Qatar card**. Show the saved log's pod readings beside the Mars column. | 7 s |
| 4. Field curves | `#/truth` | Click **Ground truth**. Frame the air-temperature chart so the pod and satellite traces, gap, and error bar are visible. Keep the satellite basis visible. | 9 s |
| | | **Total** | **29 s** |

For the simulator rehearsal, open **Live panel** and enter `7200` in **Replay speed** so the log reaches the light drop within seconds. Start **Replay simulator** as you move from shot 1 to shot 2. For the second take, follow **Live panel** from **Ground truth** and repeat in the same tab. Use **Reset buffer** to clear prior readings; if the source is still running, its next record appears normally. The saved Qatar card uses the log rather than the live buffer.

For the buffer check, enter `62` in **Replay speed** before starting. The simulator log stores one record per minute. This speed gives the browser timers enough margin to reach 600 records in ten minutes. Check **Buffered records** and the tab's memory footprint in Chrome Task Manager after ten minutes, then recheck with replay still running.

Screen recorder: `null`. Reason: the team must choose the recorder. Filming the pod, recording the live screen at the same time, editing the footage, and repeating both runs with the real pod remain team tasks.
