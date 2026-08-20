import os

def get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value

class Settings:
    PROJECT_NAME: str = "Central Dashboard API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    SECRET_KEY: str = get_required_env("SECRET_KEY")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8
    
    DATABASE_URL: str = get_required_env("DATABASE_URL")
    YUMMY_DB_URL: str = os.getenv("YUMMY_DB_URL", "")

settings = Settings()
