import sqlalchemy
from sqlalchemy import text

db_url = "postgresql://yummy_app:YummyDb2026!@localhost:5432/yummy"
engine = sqlalchemy.create_engine(db_url)

with engine.connect() as conn:
    print("--- EMPLEADOS ---")
    empleados = conn.execute(text("SELECT id, name, salary_base FROM empleados LIMIT 5")).fetchall()
    for e in empleados:
        print(dict(e._mapping))

    print("\n--- EMPLEADO NOVEDADES ---")
    novedades = conn.execute(text("SELECT id, employee_id, event_type, amount, notes FROM empleado_novedades LIMIT 10")).fetchall()
    for n in novedades:
        print(dict(n._mapping))
