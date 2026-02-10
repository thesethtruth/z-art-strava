import base64
from datetime import datetime
import httpx

from config import DATA_PATH, settings
from util import write_to_json_file


class IntervalsClient:
    def __init__(self):
        self.api_key = settings.INTERVALS_API_KEY
        self.base_url = "https://intervals.icu/api/v1"
        self.athlete_id = settings.INTERVALS_ATHLETE_ID
        self.data_path = DATA_PATH / str(self.athlete_id)

        self.data_path.mkdir(parents=True, exist_ok=True)

    @property
    def headers(self):
        credentials = f"API_KEY:{self.api_key}".encode("utf-8")
        basic_token = base64.b64encode(credentials).decode("ascii")
        return {"Authorization": f"Basic {basic_token}"}

    @property
    def workouts(self):
        try:
            with open(self.data_path / "workouts.json", "r") as f:
                return f.read()
        except FileNotFoundError:
            workouts = self.get_athlete_workouts()
            return workouts

    @property
    def activities(self):
        try:
            with open(self.data_path / "activities.json", "r") as f:
                return f.read()
        except FileNotFoundError:
            activities = self.get_athlete_activities()
            return activities

    def get_athlete_workouts(self):
        url = f"{self.base_url}/athlete/{self.athlete_id}/workouts"
        response = httpx.get(url, headers=self.headers)
        response.raise_for_status()

        write_to_json_file(response.json(), self.data_path / "workouts.json")
        return response.json()

    def get_athlete_activities(self, oldest: datetime = None, newest: datetime = None):
        """
        query parameters:
            oldest::string
            Local ISO-8601 date or date and time e.g. 2019-07-22T16:18:49 or 2019-07-22

            newest::string
            Local ISO-8601 date or date and time, defaults to now
        """
        url = f"{self.base_url}/athlete/{self.athlete_id}/activities"
        response = httpx.get(
            url,
            headers=self.headers,
            params={"oldest": oldest, "newest": newest},
        )
        response.raise_for_status()

        write_to_json_file(response.json(), self.data_path / "activities.json")
        return response.json()

    def get_activities_as_csv(self):
        url = f"{self.base_url}/athlete/{self.athlete_id}/activities.csv"
        response = httpx.get(url, headers=self.headers)
        response.raise_for_status()

        with open(self.data_path / "activities.csv", "w") as f:
            f.write(response.text)

        return response.text


client = IntervalsClient()

client.get_activities_as_csv()
