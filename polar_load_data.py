import pandas as pd
import geopandas as gpd
from pathlib import Path
import json
from pydantic import BaseModel
from typing import Optional
from enum import Enum
from shapely.geometry.linestring import LineString
import logging
import contextily as cx


logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


POLAR_TRAINING_FOLDER = Path(__file__).parent / "data" / "polar"
DATA_FOLDER = POLAR_TRAINING_FOLDER.parent
training_files = list(POLAR_TRAINING_FOLDER.glob("training-*.json"))


def parse_duration_h(duration_str: str) -> float:
    duration_s = float(duration_str.replace("PT", "").replace("S", ""))
    return duration_s / 3600.0


def convert_distance_km(distance_m: float) -> float:
    if distance_m is None:
        return 0.0
    return distance_m / 1000.0


def parse_date(date_str: str) -> pd.Timestamp:
    return pd.to_datetime(date_str)


def extract_activity_shape(
    data: dict, filename: str, distance: float, sport: SportEnum
) -> Optional[LineString]:
    try:
        points = data["exercises"][0]["samples"]["recordedRoute"]
    except KeyError:
        logger.warning(
            f"No recorded route found ({sport.value}: {distance} km) for {POLAR_TRAINING_FOLDER / filename}, setting activity_shape to None"
        )
        points = []
    activity_shape = LineString(
        [(point["longitude"], point["latitude"]) for point in points]
    )
    return activity_shape


class SportEnum(Enum):
    RUNNING = "RUNNING"
    CYCLING = "CYCLING"
    SWIMMING = "SWIMMING"
    ROWING = "ROWING"
    INDOOR_ROWING = "INDOOR_ROWING"
    INDOOR_CYCLING = "INDOOR_CYCLING"
    WEIGHT_TRAINING = "WEIGHT_TRAINING"
    OTHER = "OTHER"
    OTHER_INDOOR = "OTHER_INDOOR"
    STRENGTH_TRAINING = "STRENGTH_TRAINING"
    OTHER_OUTDOOR = "OTHER_OUTDOOR"
    HIKING = "HIKING"


class PolarTraining(BaseModel, arbitrary_types_allowed=True):
    filename: str
    date: pd.Timestamp
    name: str
    sport: SportEnum
    duration: float
    distance: float = 0.0
    kilo_calories: float
    average_heart_rate: Optional[float] = None
    max_heart_rate: Optional[float] = None
    activity_shape: Optional[LineString] = None

    def from_json(data: dict, filename: str):
        sport = SportEnum(data.get("exercises", [{}])[0].get("sport"))
        distance = convert_distance_km(data.get("distance"))

        activity_shape = None
        if (
            sport
            in [
                SportEnum.ROWING,
                SportEnum.CYCLING,
                SportEnum.OTHER_OUTDOOR,
                SportEnum.RUNNING,
            ]
            and distance > 0.5
        ):
            activity_shape = extract_activity_shape(data, filename, distance, sport)
        return PolarTraining(
            filename=filename,
            date=parse_date(data.get("startTime")),
            name=data.get("name"),
            sport=sport,
            duration=parse_duration_h(data.get("duration")),
            distance=distance,
            kilo_calories=data.get("kiloCalories"),
            average_heart_rate=data.get("averageHeartRate"),
            max_heart_rate=data.get("maximumHeartRate"),
            activity_shape=activity_shape,
        )


activities_count = len(list(POLAR_TRAINING_FOLDER.glob("activity-*.json")))
training_count = len(list(POLAR_TRAINING_FOLDER.glob("training-*.json")))
other_count = (
    len(list(POLAR_TRAINING_FOLDER.glob("*.json"))) - activities_count - training_count
)
print(f"Activities: {activities_count}")
print(f"Training: {training_count}")
print(f"Other: {other_count}")


parsed_trainings = []

for training in training_files:
    with open(training) as f:
        data = json.load(f)
        try:
            parsed_trainings.append(
                PolarTraining.from_json(data, filename=training.name)
            )
        except Exception as e:
            print(f"Error parsing {training}: {e}")

# %%
gdf_trainings = gpd.GeoDataFrame(
    [t.model_dump(mode="python") | {"sport": t.sport.value} for t in parsed_trainings]
)
gdf_trainings.set_geometry("activity_shape", inplace=True)
gdf_trainings.set_crs(epsg=4326, inplace=True)

# %%
# plot all activities with a shape as heatmap
import matplotlib.pyplot as plt

plt.figure(figsize=(10, 10))
ax = gdf_trainings.dropna(subset=["activity_shape"]).plot(
    column="sport",
    categorical=True,
    legend=True,
    markersize=1,
    alpha=0.5,
)
cx.add_basemap(
    ax,
    crs=gdf_trainings.crs.to_string(),
)
ax.set_xlim(3, 8)
ax.set_ylim(51, 53)
plt.title("Polar Training Activities with Shapes")
plt.xlabel("Longitude")
plt.ylabel("Latitude")
plt.grid()
plt.show()

gdf_trainings.to_file(DATA_FOLDER / "polar_trainings.geojson", driver="GeoJSON")
df_trainings = gdf_trainings.drop(columns="activity_shape")
df_trainings.to_csv(DATA_FOLDER / "polar_trainings.csv", index=False)
