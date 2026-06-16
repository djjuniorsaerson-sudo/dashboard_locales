import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import sys

try:
    print("Trying to connect to default database 'postgres'...")
    conn = psycopg2.connect('host=localhost user=yummy_app password=YummyDb2026! dbname=postgres')
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()
    print("Connection successful. Checking if central_db exists...")
    cur.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'central_db'")
    exists = cur.fetchone()
    if not exists:
        print("Creating database central_db...")
        cur.execute('CREATE DATABASE central_db')
        print("Created successfully!")
    else:
        print("Database already exists.")
    cur.close()
    conn.close()
except Exception as e:
    print("Failed to connect to postgres database!")
    import traceback
    traceback.print_exc()

try:
    print("Trying to connect to default database 'yummy'...")
    conn = psycopg2.connect('host=localhost user=yummy_app password=YummyDb2026! dbname=yummy')
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()
    print("Connection successful. Creating central_db...")
    cur.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'central_db'")
    exists = cur.fetchone()
    if not exists:
        cur.execute('CREATE DATABASE central_db')
        print("Created successfully!")
    cur.close()
    conn.close()
except Exception as e:
    pass
