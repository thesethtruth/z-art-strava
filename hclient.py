from pathlib import Path
import boto3
from config import settings
from mypy_boto3_s3 import S3Client


class HetznerS3Client:

    def __init__(self, bucket_name: str = None, data_path: Path = None):
        self.client: S3Client = boto3.client(
            "s3",
            endpoint_url=settings.HETZNER_URL,
            aws_access_key_id=settings.HETZNER_ACCESS_KEY,
            aws_secret_access_key=settings.HETZNER_SECRET_KEY,
        )
        self.target_bucket = bucket_name
        self.data_path = data_path

    def set_target_bucket(self, bucket_name: str):
        self.target_bucket = bucket_name

    def upload_file(
        self, file_path: Path, bucket_name: str = None, object_name: str = None
    ):
        if bucket_name is None:
            if self.target_bucket is None:
                raise ValueError(
                    "Bucket name must be provided either as an argument or set as target bucket."
                )
            bucket_name = self.target_bucket

        if object_name is None:
            object_name = file_path.name

        self.client.upload_file(str(file_path), bucket_name, object_name)

    def download_file(
        self, object_name: str, bucket_name: str = None, file_path: Path = None
    ):
        if bucket_name is None:
            if self.target_bucket is None:
                raise ValueError(
                    "Bucket name must be provided either as an argument or set as target bucket."
                )
            bucket_name = self.target_bucket

        if file_path is None:
            file_path = self.data_path / object_name
            if self.data_path is None:
                raise ValueError(
                    "File path must be provided either as an argument or set as data path."
                )

        self.client.download_file(bucket_name, object_name, str(file_path))

    def set_cors(
        self,
        allowed_origins: list[str],
        allowed_methods: list[str],
        bucket_name: str = None,
        allowed_headers: list[str] = ["*"],
    ):
        if bucket_name is None:
            if self.target_bucket is None:
                raise ValueError("Target bucket must be set to configure CORS.")
            bucket_name = self.target_bucket

        cors_configuration = {
            "CORSRules": [
                {
                    "AllowedOrigins": allowed_origins,
                    "AllowedMethods": allowed_methods,
                    "AllowedHeaders": allowed_headers,
                    "ExposeHeaders": ["ETag"],
                    "MaxAgeSeconds": 3000,
                }
            ],
        }

        self.client.put_bucket_cors(
            Bucket=self.target_bucket, CORSConfiguration=cors_configuration
        )

    def get_cors(self, bucket_name: str = None):
        if bucket_name is None:
            if self.target_bucket is None:
                raise ValueError(
                    "Bucket name must be provided either as an argument or set as target bucket."
                )
            bucket_name = self.target_bucket

        return self.client.get_bucket_cors(Bucket=bucket_name)


client = HetznerS3Client(bucket_name="public-plots")
client.set_cors(
    allowed_methods=["GET", "HEAD"],
    allowed_origins=[
        "https://sethvanwieringen.eu",
        "http://localhost:4321",
        "http://127.0.0.1:4321",
    ],
)

client.get_cors()
