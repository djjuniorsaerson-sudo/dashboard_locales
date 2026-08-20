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
DEFAULT_ADMIN_PASSWORD = "AdminTemporal2026!"
DEFAULT_ORGANIZATION_NAME = "Empresa Demo"


def create_admin():
    db = SessionLocal()
    try:
        admin_email = os.getenv("ADMIN_EMAIL", DEFAULT_ADMIN_EMAIL).strip().lower()
        admin_password = os.getenv("ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD).strip() or DEFAULT_ADMIN_PASSWORD
        organization_name = os.getenv("ADMIN_ORGANIZATION_NAME", DEFAULT_ORGANIZATION_NAME).strip() or DEFAULT_ORGANIZATION_NAME

        existing_user = db.query(User).filter(User.role == "ADMIN").first()
        if existing_user:
            if existing_user.force_password_change:
                existing_user.password_hash = get_password_hash(admin_password)
                db.commit()
                print(f"Admin user {existing_user.email} pending first setup. Temporary password refreshed.")
            else:
                print(f"Admin user {existing_user.email} already exists. Skipping reset.")
            return

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
            is_active=True,
            force_password_change=True
        )
        db.add(user)
        db.commit()
        print(f"Admin user {admin_email} created successfully.")
    finally:
        db.close()

if __name__ == "__main__":
    create_admin()
