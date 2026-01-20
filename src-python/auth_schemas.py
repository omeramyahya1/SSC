from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime

# --- Pydantic Schemas for Registration Payload ---

class Stage1Payload(BaseModel):
    username: str
    email: str
    password: str
    confirmPassword: str

class Stage4Payload(BaseModel):
    businessName: Optional[str] = None
    locationState: Optional[str] = None
    locationCity: Optional[str] = None
    latitude: Optional[str] = None
    longitude: Optional[str] = None
    logo: Optional[str] = None # Base64

class Stage6Payload(BaseModel):
    paymentMethod: Optional[str] = None
    referralCode: Optional[str] = None
    discountApplied: bool
    confirmedTransfer: bool

class Stage7Payload(BaseModel):
    referenceNumber: Optional[str] = None
    receipt: Optional[str] = None # Base64

class RegistrationPayload(BaseModel):
    stage1: Stage1Payload
    account_type: str
    plan_type: str
    amount: float
    language: str
    stage4: Stage4Payload
    stage6: Stage6Payload
    stage7: Stage7Payload
    distributor_id: Optional[str] = None

# --- Pydantic Schemas for Login ---

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
    is_dirty: bool

class LoginResponseUser(BaseModel):
    user_id: int
    username: str
    email: str
    business_name: Optional[str] = None
    account_type: Optional[str] = None
    location: Optional[str] = None
    business_email: Optional[str] = None
    status: Optional[str] = None
    organization_uuid: Optional[str] = None
    branch_uuid: Optional[str] = None
    role: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    is_dirty: bool



class LoginResponse(BaseModel):
    user: LoginResponseUser
    authentication: LoginResponseAuthentication