import os

class Settings:
    PROJECT_NAME: str = "Central Dashboard API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    SECRET_KEY: str = os.getenv("SECRET_KEY", "super_secret_change_me_in_production_1234567890")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8
    
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://yummy_app:YummyDb2026!@localhost:5432/yummy")

settings = Settings()
