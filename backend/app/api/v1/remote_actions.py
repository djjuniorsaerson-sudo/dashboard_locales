from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api import deps
from app.models.remote_action import RemoteAction, RemoteActionStatus
from app.models.user import User
from app.models.yummy import YummyInstallation

router = APIRouter()


class CreateOrderPayload(BaseModel):
    customer_name: str
    customer_phone: Optional[str] = ""
    customer_address: Optional[str] = ""
    order_type: str
    payment_method: str
    allow_duplicate: bool = False
    payment_breakdown: Optional[dict] = None
    items: list[dict]


def get_installation_for_user(db: Session, installation_id: UUID, current_user: User) -> YummyInstallation:
    installation = db.query(YummyInstallation).filter(
        YummyInstallation.id == installation_id,
        YummyInstallation.organization_id == current_user.organization_id,
    ).first()
    if not installation:
        raise HTTPException(status_code=404, detail="Installation not found")
    return installation


@router.post("/installations/{installation_id}/create-order")
def enqueue_create_order(
    installation_id: UUID,
    payload: CreateOrderPayload,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    installation = get_installation_for_user(db, installation_id, current_user)
    action = RemoteAction(
        installation_id=installation.id,
        created_by_user_id=current_user.id,
        action_type="CREATE_ORDER",
        status=RemoteActionStatus.PENDING,
        payload=payload.model_dump(),
    )
    db.add(action)
    db.commit()
    db.refresh(action)
    return {
        "id": str(action.id),
        "status": action.status.value,
        "installation_id": str(installation.id),
    }


@router.get("/installations/{installation_id}")
def list_remote_actions(
    installation_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    installation = get_installation_for_user(db, installation_id, current_user)
    actions = db.query(RemoteAction).filter(
        RemoteAction.installation_id == installation.id,
    ).order_by(RemoteAction.created_at.desc()).limit(50).all()
    return [
        {
            "id": str(action.id),
            "action_type": action.action_type,
            "status": action.status.value,
            "error_message": action.error_message,
            "created_at": action.created_at,
            "updated_at": action.updated_at,
        }
        for action in actions
    ]
