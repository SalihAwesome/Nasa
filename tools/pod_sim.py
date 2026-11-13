"""Generate a deterministic simulated pod log or stream its two-second readings."""

import argparse
import json
import math
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

OUTPUT = Path(__file__).resolve().parents[1] / "app" / "public" / "data" / "sim"
COLUMNS = "ts,lux_up,lux_dn,tg,tamb,uv,ta,rh,p,t10"
MINUTES_PER_DAY = 24 * 60
LIVE_INTERVAL_SECONDS = 2

# D7 in docs/software-plan.md.
SUN_EVENT_LUX = 400

# November POWER climatology at the D10 test site. See docs/verified-facts.md.
GROUND_MEAN_C = 25.64
GROUND_RANGE_C = 14.5
AIR_MEAN_C = 24.95
AIR_RANGE_C = 8.08
HUMIDITY_PERCENT = 56.98
PRESSURE_HPA = 101.32 * 10
UV_MEAN = 0.89


def utc_timestamp(value):
    try:
        date = datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError as error:
        raise argparse.ArgumentTypeError("expected YYYY-MM-DDTHH:MM:SSZ") from error
    return date.replace(tzinfo=timezone.utc)


def format_timestamp(date):
    return date.isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    # D8 in docs/software-plan.md. The Sun times come from the Horizons check.
    parser.add_argument("--start", type=utc_timestamp, default="2026-11-14T00:00:00Z")
    parser.add_argument("--sunrise", type=utc_timestamp, default="2026-11-14T02:51:00Z")
    parser.add_argument("--peak", type=utc_timestamp, default="2026-11-14T08:19:00Z")
    parser.add_argument("--sunset", type=utc_timestamp, default="2026-11-14T13:47:00Z")
    parser.add_argument("--peak-lux", type=float, default=80000)
    parser.add_argument("--lux-max", type=float, default=120000)
    parser.add_argument("--soil-delay-minutes", type=int, default=120)
    parser.add_argument("--soil-range-ratio", type=float, default=0.3)
    parser.add_argument("--reflectivity", type=float, default=0.30)
    parser.add_argument("--pole-height-m", type=float, default=1.0)
    parser.add_argument("--tilt-deg", type=float, default=30)
    parser.add_argument("--facing-deg", type=float, default=180)
    parser.add_argument("--refl-factor", type=float, default=0.27)
    parser.add_argument("--ta-offset-c", type=float, default=0.5)
    parser.add_argument("--live", action="store_true", help="stream one day of two-second readings")
    args = parser.parse_args()
    if not args.start < args.sunrise < args.peak < args.sunset < args.start + timedelta(days=1):
        parser.error("start, sunrise, peak, and sunset must be ordered within one day")
    for name, value in vars(args).items():
        if isinstance(value, float) and not math.isfinite(value):
            parser.error(f"{name} must be finite")
    if not SUN_EVENT_LUX < args.peak_lux <= args.lux_max:
        parser.error("peak lux must exceed the Sun event threshold and fit within lux_max")
    if not 0 < args.refl_factor <= 1 or not 0 <= args.reflectivity <= 1:
        parser.error("correction factor and reflectivity must be valid ratios")
    if not 0 <= args.soil_range_ratio <= 1 or not 0 <= args.soil_delay_minutes < MINUTES_PER_DAY:
        parser.error("soil range ratio must be in [0, 1] and delay must be within one day")
    return args


def light_at(date, args):
    if date < args.sunrise or date > args.sunset:
        return 0.0
    event = args.sunrise if date <= args.peak else args.sunset
    distance = abs((date - args.peak) / (event - args.peak))
    return SUN_EVENT_LUX + (args.peak_lux - SUN_EVENT_LUX) * (1 + math.cos(math.pi * distance)) / 2


def temperature_at(date, peak, mean, swing):
    phase = (date - peak).total_seconds() / timedelta(days=1).total_seconds()
    return mean + swing / 2 * math.cos(math.tau * phase)


def record_at(date, args, mean_lux):
    lux_up = light_at(date, args)
    lux_dn = lux_up * args.reflectivity * args.refl_factor
    ground = temperature_at(date, args.peak, GROUND_MEAN_C, GROUND_RANGE_C)
    air = temperature_at(date, args.peak, AIR_MEAN_C, AIR_RANGE_C)
    soil = temperature_at(
        date - timedelta(minutes=args.soil_delay_minutes),
        args.peak,
        GROUND_MEAN_C,
        GROUND_RANGE_C * args.soil_range_ratio,
    )
    uv = UV_MEAN * lux_up / mean_lux
    values = (lux_up, lux_dn, ground, air, uv, air, HUMIDITY_PERCENT, PRESSURE_HPA, soil)
    return ",".join([format_timestamp(date), *(f"{value:.6f}" for value in values)])


def header_lines(args):
    yield "# simulated=true"
    for key in ("pole_height_m", "tilt_deg", "facing_deg", "refl_factor", "ta_offset_c", "lux_max"):
        yield f"# {key}={getattr(args, key):g}"
    yield COLUMNS


def write_log(args, minute_ends, mean_lux):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with (OUTPUT / "pod-sim.csv").open("w", encoding="utf-8", newline="\n") as log:
        for line in header_lines(args):
            print(line, file=log)
        for date in minute_ends:
            print(record_at(date, args, mean_lux), file=log)

    truth = {
        key: format_timestamp(value) if isinstance(value, datetime) else value
        for key, value in vars(args).items()
        if key != "live"
    }
    truth.update(simulated=True, status="default")
    (OUTPUT / "pod-sim.truth.json").write_text(
        json.dumps(truth, indent=2) + "\n", encoding="utf-8", newline="\n"
    )


def stream_log(args, mean_lux):
    for line in header_lines(args):
        print(line, flush=True)
    clock_start = time.monotonic()
    for seconds in range(0, MINUTES_PER_DAY * 60, LIVE_INTERVAL_SECONDS):
        time.sleep(max(0, clock_start + seconds - time.monotonic()))
        date = args.start + timedelta(seconds=seconds)
        print(record_at(date, args, mean_lux), flush=True)


def main():
    args = parse_args()
    minute_ends = [args.start + timedelta(minutes=index) for index in range(1, MINUTES_PER_DAY + 1)]
    mean_lux = sum(light_at(date, args) for date in minute_ends) / MINUTES_PER_DAY
    if not mean_lux:
        raise SystemExit("no daylight in the one-minute log samples")
    if args.live:
        stream_log(args, mean_lux)
    else:
        write_log(args, minute_ends, mean_lux)


if __name__ == "__main__":
    main()
