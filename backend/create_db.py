import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import engine
from app.db.base import Base

import time
from sqlalchemy.exc import OperationalError

def init_db():
    print("Creating all database tables...")
    retries = 5
    while retries > 0:
        try:
            Base.metadata.create_all(bind=engine)
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
