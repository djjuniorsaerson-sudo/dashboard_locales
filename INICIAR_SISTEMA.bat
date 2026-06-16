@echo off
echo ========================================================
echo Iniciando el Panel Central (Backend y Frontend)...
echo ========================================================

echo 1. Iniciando el servidor de Datos (Backend)...
start "Backend - Panel Central" cmd /k "cd backend & call venv\Scripts\activate.bat & python create_db.py & python create_admin.py & uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo 2. Iniciando la Interfaz Web (Frontend)...
start "Frontend - Panel Central" cmd /k "cd frontend && npm run dev"

echo 3. Esperando 5 segundos a que carguen los servidores...
timeout /t 5 /nobreak >nul

echo 4. Abriendo el navegador web...
start http://localhost:5173

echo.
echo ========================================================
echo LISTO. 
echo Se abrieron dos ventanas negras extras (Frontend y Backend).
echo MIENTRAS USES EL SISTEMA, DEBES DEJAR ESAS 2 VENTANAS ABIERTAS Y MINIMIZADAS.
echo ========================================================
pause
