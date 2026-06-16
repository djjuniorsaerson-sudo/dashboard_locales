from sqlalchemy import create_engine, text
import os

DATABASE_URL = "postgresql://postgres:postgres@localhost/yummy" # Assuming default from previous interactions, or we can import settings

from app.core.config import settings

engine = create_engine(settings.DATABASE_URL)
with engine.connect() as conn:
    print('--- Tables related to devoluciones ---')
    res = conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%devuelt%' OR table_name LIKE '%devol%');"))
    for r in res: print(r)
    
    print('--- Statuses in repartidor_viajes ---')
    res2 = conn.execute(text("SELECT DISTINCT status FROM repartidor_viajes;"))
    for r in res2: print(r)
    
    print('--- Columns in repartidor_viajes ---')
    res3 = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='repartidor_viajes';"))
    for r in res3: print(r)
