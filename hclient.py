import boto3
from config import settings
from mypy_boto3_s3 import S3Client


client: S3Client = boto3.client(
    "s3",
    endpoint_url=settings.HETZNER_URL,
    aws_access_key_id=settings.HETZNER_ACCESS_KEY,
    aws_secret_access_key=settings.HETZNER_SECRET_KEY,
)
