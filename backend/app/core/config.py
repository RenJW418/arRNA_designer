from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    api_prefix: str = "/api/v1"
    task_retention_hours: int = 24
    max_sequence_length: int = 200_000
    max_upload_mb: int = 10


settings = Settings()
