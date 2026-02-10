from pathlib import Path

from pydantic_settings import BaseSettings

DATA_PATH = Path(__file__).parent / "data"


class Settings(BaseSettings):
    INTERVALS_API_KEY: str
    INTERVALS_ATHLETE_ID: str
    HETZNER_ACCESS_KEY: str
    HETZNER_SECRET_KEY: str
    HETZNER_URL: str
    HETZNER_BUCKET_NAME: str = "z-sports-history"

    class Config:
        env_file = ".env"


settings = Settings()
