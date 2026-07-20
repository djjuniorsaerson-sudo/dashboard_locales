from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

yummy_engine = create_engine(settings.YUMMY_DB_URL, pool_pre_ping=True)
YummySessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=yummy_engine)
