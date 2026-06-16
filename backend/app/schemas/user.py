from pydantic import BaseModel, EmailStr
from typing import Optional
from uuid import UUID

class UserBase(BaseModel):
    email: EmailStr
    role: Optional[str] = "VIEWER"

class UserCreate(UserBase):
    password: str
    organization_id: UUID

class UserResponse(UserBase):
    id: UUID
    organization_id: UUID
    is_active: bool

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    role: Optional[str] = None
    org_id: Optional[str] = None
