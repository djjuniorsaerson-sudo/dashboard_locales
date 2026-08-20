import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import engine
from app.db.base import Base

import time
from sqlalchemy.exc import OperationalError
from sqlalchemy import inspect, text


def ensure_users_security_columns():
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    if "users" not in tables:
        return

    columns = {column["name"] for column in inspector.get_columns("users")}
    with engine.begin() as connection:
        if "force_password_change" not in columns:
            connection.execute(
                text("ALTER TABLE users ADD COLUMN force_password_change BOOLEAN NOT NULL DEFAULT FALSE")
            )
            connection.execute(
                text("UPDATE users SET force_password_change = TRUE WHERE email = 'admin@empresa.com'")
            )
            print("Added users.force_password_change column and flagged default admin for password change.")

def init_db():
    print("Creating all database tables...")
    retries = 5
    while retries > 0:
        try:
            Base.metadata.create_all(bind=engine)
            ensure_users_security_columns()
            print("Tables created successfully.")
            break
        except OperationalError as e:
            retries -= 1
            print(f"Database not ready, waiting 5 seconds... ({retries} retries left)")
            time.sleep(5)
            if retries == 0:
                print("Could not connect to database after multiple retries.")
                raise e

if __name__ == "__main__":
    init_db()
