import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import SessionLocal
import app.db.base  # Import base to ensure all models are registered
from app.models.user import User
from app.models.organization import Organization
from app.core.security import get_password_hash
import uuid

DEFAULT_ADMIN_EMAIL = "admin@empresa.com"
DEFAULT_ORGANIZATION_NAME = "Empresa Demo"


def get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def create_admin():
    db = SessionLocal()
    try:
        admin_email = os.getenv("ADMIN_EMAIL", DEFAULT_ADMIN_EMAIL).strip().lower()
        organization_name = os.getenv("ADMIN_ORGANIZATION_NAME", DEFAULT_ORGANIZATION_NAME).strip() or DEFAULT_ORGANIZATION_NAME

        existing_user = db.query(User).filter(User.email == admin_email).first()
        if existing_user:
            print(f"Admin user {admin_email} already exists. Skipping reset.")
            return

        admin_password = get_required_env("ADMIN_PASSWORD")

        org = db.query(Organization).first()
        if not org:
            org = Organization(id=uuid.uuid4(), name=organization_name)
            db.add(org)
            db.commit()
            db.refresh(org)

        user = User(
            id=uuid.uuid4(),
            email=admin_email,
            password_hash=get_password_hash(admin_password),
            role="ADMIN",
            organization_id=org.id,
            is_active=True
        )
        db.add(user)
        db.commit()
        print(f"Admin user {admin_email} created successfully.")
    finally:
        db.close()

if __name__ == "__main__":
    create_admin()
