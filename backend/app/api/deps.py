from typing import Generator
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from fastapi.security.api_key import APIKeyHeader
from jose import jwt, JWTError
from pydantic import ValidationError
from sqlalchemy.orm import Session
from app.db.session import SessionLocal, YummySessionLocal
from app.core.config import settings
from app.core.security import ALGORITHM
from app.core.security import verify_password
from app.schemas.user import TokenPayload
from app.models.user import User

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login"
)
connector_api_key_header = APIKeyHeader(name="X-Connector-Token", auto_error=True)

def get_db() -> Generator:
    try:
        db = SessionLocal()
        yield db
    finally:
        db.close()

class RemoteResult:
    def __init__(self, data):
        self.data = data
        if isinstance(data, dict):
            self.rows = data.get("rows", [])
        elif isinstance(data, list):
            # Fallback for older yummy instances that return list of dicts directly
            self.rows = [list(r.values()) if isinstance(r, dict) else list(r) for r in data]
        else:
            self.rows = []
    def fetchall(self):
        return [tuple(r) for r in self.rows]
    def fetchone(self):
        if self.rows and len(self.rows) > 0:
            return tuple(self.rows[0])
        return None
    def scalar(self):
        row = self.fetchone()
        return row[0] if row else None
    @property
    def lastrowid(self):
        if isinstance(self.data, dict):
            return self.data.get("lastrowid")
        return None

class RemoteSession:
    def __init__(self, client):
        self.client = client
    def execute(self, query, params=None):
        import re
        sql = str(query)
        if hasattr(query, "text"):
            sql = query.text
        
        p = params or {}
        if not isinstance(p, dict) and hasattr(p, '__dict__'):
            p = p.__dict__
            
        if isinstance(p, dict) and p:
            new_p = []
            def replace_param(match):
                key = match.group(1)
                new_p.append(p.get(key))
                return '?'
            sql = re.sub(r'(?<!:):([a-zA-Z0-9_]+)', replace_param, sql)
            p = new_p
            
        res = self.client.execute_sql(sql, p)
        if isinstance(res, dict) and "error" in res:
            raise Exception(res["error"])
        return RemoteResult(res)
    def commit(self): pass
    def rollback(self): pass
    def close(self): pass

def get_yummy_db() -> Generator:
    from app.models.yummy import YummyInstallation
    from app.services.yummy_client import YummyIntegrationClient
    
    db = SessionLocal()
    try:
        install = db.query(YummyInstallation).filter(
            YummyInstallation.connection_status == "ONLINE"
        ).order_by(YummyInstallation.last_health_check.desc()).first()
        
        if install:
            client = YummyIntegrationClient(install.base_url, install.api_key)
            yield RemoteSession(client)
        else:
            raise HTTPException(status_code=503, detail="Yummy is not ONLINE")
    finally:
        db.close()

def get_current_user(
    db: Session = Depends(get_db), token: str = Depends(reusable_oauth2)
) -> User:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (JWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    user = db.query(User).filter(User.id == token_data.sub).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def get_connector_installation(
    installation_id: str,
    db: Session = Depends(get_db),
    connector_token: str = Depends(connector_api_key_header),
):
    from app.models.yummy import YummyInstallation

    install = db.query(YummyInstallation).filter(YummyInstallation.id == installation_id).first()
    if not install or not install.connector_token_hash:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Installation not found")
    if not verify_password(connector_token, install.connector_token_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid connector token")
    return install
