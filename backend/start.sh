#!/bin/bash
set -e

echo "Inicializando base de datos del Panel Central..."
python create_db.py

echo "Creando usuario admin si no existe..."
python create_admin.py

echo "Iniciando servidor FastAPI..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
