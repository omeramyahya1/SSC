from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date

class LoginRequest(BaseModel):
    email: str
    password: str

class LoginResponseAuthentication(BaseModel):
    auth_id: int
    user_id: int
    is_logged_in: bool
    current_jwt: Optional[str] = None
    jwt_issued_at: Optional[datetime] = None
    device_id: Optional[str] = None
    last_active: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

class LoginResponseUser(BaseModel):
    user_id: int
    username: str
    email: str
    business_name: Optional[str] = None
    account_type: Optional[str] = None
    location: Optional[str] = None
    business_email: Optional[str] = None
    status: Optional[str] = None
    org_id: Optional[int] = None
    org_name: Optional[str] = None
    branch_id: Optional[int] = None
    branch_location: Optional[str] = None
    role: Optional[str] = None
    registration_date: datetime


class LoginResponse(BaseModel):
    user: LoginResponseUser
    authentication: LoginResponseAuthentication

