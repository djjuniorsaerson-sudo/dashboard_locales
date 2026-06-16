npx -y create-vite@latest frontend --template react
cd frontend
npm install tailwindcss @tailwindcss/vite
cd ..
mkdir backend
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install fastapi "uvicorn[standard]" sqlalchemy psycopg2-binary alembic pydantic "python-jose[cryptography]" "passlib[bcrypt]" python-multipart
