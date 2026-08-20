import os

class Settings:
    PROJECT_NAME: str = "Central Dashboard API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    SECRET_KEY: str = os.getenv("SECRET_KEY", "panel_secret_temporal_2026_cambiar_despues")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8
    
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://central_admin:central_password_123@central-db:5432/central_db")
    YUMMY_DB_URL: str = os.getenv("YUMMY_DB_URL", "")

settings = Settings()
