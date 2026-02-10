from pathlib import Path
import json


def write_to_json_file(data, filename: Path):
    with open(filename, "w") as f:
        json.dump(data, f)
