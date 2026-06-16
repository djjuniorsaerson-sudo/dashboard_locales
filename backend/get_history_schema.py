from sqlalchemy import create_engine, text
from app.core.config import settings
import sys

engine = create_engine(settings.DATABASE_URL)
with engine.connect() as conn:
    res = conn.execute(text("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'repartidor_viajes';"))
    for row in res:
        print(row)
