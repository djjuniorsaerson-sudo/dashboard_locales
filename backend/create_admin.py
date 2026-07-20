import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import SessionLocal
import app.db.base  # Import base to ensure all models are registered
from app.models.user import User
from app.models.organization import Organization
from app.core.security import get_password_hash
import uuid

def create_admin():
    db = SessionLocal()
    
    # Ver si ya existe
    existing_user = db.query(User).filter(User.email == "admin@empresa.com").first()
    if existing_user:
        print("Admin user already exists! Forcing password reset to 'admin'")
        existing_user.password_hash = get_password_hash("admin")
        db.commit()
        db.close()
        return

    # Crear organizacion
    org = Organization(id=uuid.uuid4(), name="Empresa Demo")
    db.add(org)
    db.commit()
    db.refresh(org)

    # Crear usuario admin
    user = User(
        id=uuid.uuid4(),
        email="admin@empresa.com",
        password_hash=get_password_hash("admin"),
        role="ADMIN",
        organization_id=org.id,
        is_active=True
    )
    db.add(user)
    db.commit()
    print("User admin@empresa.com created successfully with password: admin")
    db.close()

if __name__ == "__main__":
    create_admin()
