from sqlalchemy import create_engine, text
from app.core.config import settings

engine = create_engine(settings.DATABASE_URL)
with engine.connect() as conn:
    tables = conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).fetchall()
    print("Tables:", [t[0] for t in tables])
    
    for t in tables:
        name = t[0]
        if 'caja' in name or 'repartidor' in name:
            cols = conn.execute(text(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{name}'")).fetchall()
            print(f"\\n--- {name} ---")
            for c in cols:
                print(f"{c[0]}: {c[1]}")
