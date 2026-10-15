"""Produce the artwork's daily hours from the joined result; no source mutations."""

import ast
from collections import Counter, defaultdict
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


def main():
    rows = json.loads(SOURCE.read_text())
    groups = defaultdict(lambda: {"hours": 0, "activities": 0})
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

    daily = [
        {"date": day, "sport": sport, "hours": round(value["hours"], 10), "activities": value["activities"]}
        for (day, sport), value in sorted(groups.items())
    ]
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
