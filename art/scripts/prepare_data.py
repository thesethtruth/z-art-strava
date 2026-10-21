"""Produce the artwork's daily hours from the joined result; no source mutations."""

import ast
from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict
import csv
from datetime import date
import hashlib
import json
import math
from pathlib import Path

ART = Path(__file__).resolve().parents[1]
ROOT = ART.parent
SOURCE = ROOT / "data/consolidated_trainings.json"
SPORTS = ["Rowing", "Weight training", "Cycling", "Running"]
START = "2016-01-01"
END = "2025-12-31"
STRAVA = ROOT / "data/strava_trainings.csv"
# Physiology from the Polar profile snapshots in the export (2016–2022): maximum HR
# 196–200, resting HR 45, anaerobic threshold 180, FTP 294–300 W. Strava's own
# Intensity field implies the same ~300 W FTP for 2024. One constant set keeps
# sessions from different years and sources comparable.
FTP_WATTS = 300
HR_EASY, HR_THRESHOLD = 105, 178


def source_colors():
    # Read the existing palette without importing plotfunctions (which starts an S3 client).
    tree = ast.parse((ROOT / "plotfunctions.py").read_text())
    palette = next(
        ast.literal_eval(node.value)
        for node in tree.body
        if isinstance(node, ast.Assign)
        and any(isinstance(t, ast.Name) and t.id == "SITE_PRISM_SLATE" for t in node.targets)
    )
    definition = next(
        node.value for node in tree.body
        if isinstance(node, ast.Assign)
        and any(isinstance(t, ast.Name) and t.id == "SPORT_COLORS" for t in node.targets)
    )
    colors = {}
    for key, value in zip(definition.keys, definition.values):
        sport = ast.literal_eval(key)
        if sport in SPORTS:
            colors[sport] = palette[ast.literal_eval(value.slice)]
    return colors


def clamp(value):
    return max(0.0, min(1.0, value))


def number(value):
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return value if math.isfinite(value) else None


def strava_extras():
    # source_row is the pandas index of strava_trainings.csv: its unnamed first column.
    with STRAVA.open(newline="") as handle:
        return {
            int(row[""]): {
                "np": number(row["Weighted Average Power"]),
                "elevation": number(row["Elevation Gain"]),
            }
            for row in csv.DictReader(handle)
        }


def session_signals(row, extra):
    """Absolute 0–1 effort and variability for one session, or None without a signal."""
    hours = float(row["duration"])
    avg_hr, max_hr = number(row.get("avg_hr")), number(row.get("max_hr"))
    if max_hr is not None and max_hr > 215:
        max_hr = None  # Optical HR spikes above any plausible maximum.
    np_watts = extra.get("np")
    avg_watts = number(row.get("avg_watts"))
    kcal = number(row.get("kcalories"))
    effort = intensity_factor = None
    if row["sport"] == "Cycling" and np_watts:
        intensity_factor = np_watts / FTP_WATTS
        effort = clamp((intensity_factor - 0.55) / (1.02 - 0.55))
    elif avg_hr:
        effort = clamp((avg_hr - HR_EASY) / (HR_THRESHOLD - HR_EASY))
    elif kcal and hours > 0:
        effort = clamp((kcal / hours - 300) / 700)
    variability = None
    if np_watts and avg_watts and avg_watts > 40:
        variability = clamp((np_watts / avg_watts - 1.0) / 0.25)  # Variability index.
    elif avg_hr and max_hr and max_hr >= avg_hr:
        variability = clamp((max_hr - avg_hr - 15) / 45)
    elevation = extra.get("elevation")
    climb = elevation / hours if elevation is not None and hours > 0 and row["sport"] in ("Cycling", "Running") else None
    return {"effort": effort, "if": intensity_factor, "hr": avg_hr, "variability": variability, "climb": climb}


def percentile_ranks(daily, key):
    """Mid-rank percentile within each sport, so every sport spans calm to fierce."""
    for sport in SPORTS:
        values = sorted(d[key] for d in daily if d["sport"] == sport and d[key] is not None)
        for d in daily:
            if d["sport"] == sport and d[key] is not None:
                below, through = bisect_left(values, d[key]), bisect_right(values, d[key])
                d[key] = round((below + through) / 2 / len(values), 4)


def main():
    rows = json.loads(SOURCE.read_text())
    extras = strava_extras()
    groups = defaultdict(lambda: {"hours": 0, "activities": 0, "signals": []})
    excluded = []
    outside = Counter()
    for row in rows:
        day = row["date"][:10]  # Already local wall dates in the joined result.
        if not START <= day <= END:
            outside["outside_date_range"] += 1
            continue
        if row["sport"] not in SPORTS:
            outside["other_sports"] += 1
            continue
        hours = row["duration"]
        reason = None
        if hours is None or not math.isfinite(float(hours)) or float(hours) <= 0:
            reason = "Non-positive or invalid duration has no area to draw"
        elif row["sport"] == "Rowing" and float(hours) > 4:
            reason = "Rowing session longer than 4 hours excluded at the user's request"
        elif (row["sport"], row["source"], row["date"]) == (
            "Cycling", "Polar", "2017-01-07T17:07:21.000"
        ):
            reason = "Erroneous 23.46-hour cycling session on 7 January 2017 excluded at the user's request"
        if reason:
            excluded.append({k: row[k] for k in ["date", "sport", "duration", "source", "source_row"]} | {"reason": reason})
            continue
        group = groups[(day, row["sport"])]
        group["hours"] += float(hours)
        group["activities"] += 1
        extra = extras.get(row["source_row"], {}) if row["source"] == "Strava" else {}
        group["signals"].append((float(hours), session_signals(row, extra)))

    def weighted(signals, key, digits):
        # Duration-weighted mean across that day's sessions that report the signal.
        pairs = [(hours, s[key]) for hours, s in signals if s[key] is not None]
        total = sum(hours for hours, _ in pairs)
        return round(sum(hours * value for hours, value in pairs) / total, digits) if total > 0 else None

    daily = [
        {"date": day, "sport": sport, "hours": round(value["hours"], 10), "activities": value["activities"],
         "effort": weighted(value["signals"], "effort", 6),
         "variability": weighted(value["signals"], "variability", 6),
         "climb": weighted(value["signals"], "climb", 1),
         "if": weighted(value["signals"], "if", 3),
         "hr": weighted(value["signals"], "hr", 1)}
        for (day, sport), value in sorted(groups.items())
    ]
    percentile_ranks(daily, "effort")
    percentile_ranks(daily, "variability")
    for item in daily:
        date.fromisoformat(item["date"])
        assert item["hours"] > 0
    totals = {sport: round(sum(d["hours"] for d in daily if d["sport"] == sport), 6) for sport in SPORTS}
    result = {
        "meta": {
            "source": "data/consolidated_trainings.json",
            "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
            "start": START, "end": END, "years": list(range(int(START[:4]), int(END[:4]) + 1)),
            "calendar": "Calendar year columns; Monday-start weeks, clipped at year boundaries",
            "unit": "hours", "colors": source_colors(),
            "activities": sum(d["activities"] for d in daily),
            "activeDays": len({d["date"] for d in daily}),
            "hours": round(sum(totals.values()), 6), "hoursBySport": totals,
            "firstActivity": daily[0]["date"], "lastActivity": daily[-1]["date"],
            "excluded": excluded, "filtered": dict(outside),
            "sessionSignals": {
                "effort": f"Percentile within sport of the duration-weighted session effort. Rides with normalized power use IF = NP / {FTP_WATTS} W (0.55 to 1.02 maps to 0 to 1); other sessions use average HR ({HR_EASY} to {HR_THRESHOLD} bpm), then kcal per hour (300 to 1000).",
                "variability": "Percentile within sport. Variability index NP / average power (1.00 to 1.25) where power exists, otherwise max minus average HR (15 to 60 bpm).",
                "climb": "Strava elevation gain per hour for cycling and running, in meters.",
                "if": "Duration-weighted intensity factor for rides with normalized power.",
                "hr": "Duration-weighted average heart rate in bpm.",
                "coverage": {key: sum(1 for d in daily if d[key] is not None) for key in ["effort", "variability", "climb", "if", "hr"]},
            },
        },
        "daily": daily,
    }
    target = ART / "data/daily-activities.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, separators=(",", ":")) + "\n")
    print(json.dumps(result["meta"], indent=2))
    print(f"Wrote {len(daily)} daily sport totals to {target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
