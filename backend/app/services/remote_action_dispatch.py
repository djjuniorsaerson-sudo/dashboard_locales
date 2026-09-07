from uuid import uuid4

import requests
from fastapi import HTTPException
from fastapi.responses import JSONResponse

from app.models.remote_action import RemoteAction, RemoteActionStatus
from app.services.yummy_client import YummyIntegrationClient


def dispatch_remote_action(db, installation, user, action_type, payload, path, *, online, message, extra_response=None):
    action_id = uuid4()
    action_payload = {**payload, "_operation_id": str(action_id)}
    action = RemoteAction(
        id=action_id, installation_id=installation.id, created_by_user_id=user.id,
        action_type=action_type, status=RemoteActionStatus.PENDING, payload=action_payload,
        result_payload={"_retry_count": 0, "_queued": True},
    )
    db.add(action)
    db.commit()
    if online:
        client = YummyIntegrationClient(installation.base_url, installation.api_key)
        try:
            result = client.request("POST", path, payload=action_payload)
            if not isinstance(result, dict) or result.get("ok") is not True:
                raise requests.RequestException("Yummy no confirmó la operación")
        except requests.HTTPError as exc:
            status = getattr(exc.response, "status_code", 502)
            if 400 <= status < 500:
                db.refresh(action, with_for_update=True)
                if action.status != RemoteActionStatus.COMPLETED:
                    action.status = RemoteActionStatus.FAILED
                    action.error_message = f"Yummy rechazó la operación (HTTP {status})"
                    db.commit()
                    raise HTTPException(status_code=status, detail=action.error_message)
                db.commit()
                saved = action.result_payload or {}
                return saved.get("body", saved)
            db.rollback()
        except requests.RequestException:
            db.rollback()
        else:
            db.refresh(action, with_for_update=True)
            action.status = RemoteActionStatus.COMPLETED
            action.result_payload = result
            action.error_message = None
            db.commit()
            return result
    return JSONResponse(status_code=202, content={
        **(extra_response or {}), "id": str(action.id), "status": "QUEUED",
        "installation_id": str(installation.id), "queued": True,
        "message": message, "retry_count": 0,
    })
