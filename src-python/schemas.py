from pydantic import BaseModel
from typing import Optional, Any, List
from datetime import datetime

class ProjectWithCustomerCreate(BaseModel):
    customer_name: str
    phone_number: Optional[str] = None
    email: Optional[str] = None
    project_location: str

class ApplianceCreate(BaseModel):
    project_uuid: Optional[str] = None
    appliance_name: Optional[str] = None
    type: Optional[str] = None
    qty: Optional[int] = None
    use_hours_night: Optional[float] = None
    wattage: Optional[float] = None
    energy_consumption: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None

class ApplianceBatchCreate(BaseModel):
    project_id: int
    appliances: List[ApplianceCreate]

class ApplianceUpdate(BaseModel):
    project_id: Optional[int] = None
    appliance_name: Optional[str] = None
    type: Optional[str] = None
    qty: Optional[int] = None
    use_hours_night: Optional[float] = None
    wattage: Optional[float] = None
    energy_consumption: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None


class ApplicationSettingsCreate(BaseModel):
    language: Optional[str] = None
    last_saved_path: Optional[str] = None
    other_settings: Optional[Any] = None
    user_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None

class ApplicationSettingsUpdate(BaseModel):
    language: Optional[str] = None
    last_saved_path: Optional[str] = None
    other_settings: Optional[Any] = None
    user_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None


class AuthenticationCreate(BaseModel):
    user_id: Optional[int] = None
    password_hash: Optional[str] = None
    password_salt: Optional[str] = None
    current_jwt: Optional[str] = None
    jwt_issued_at: Optional[datetime] = None
    device_id: Optional[str] = None
    is_logged_in: Optional[bool] = None
    last_active: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None

class AuthenticationUpdate(BaseModel):
    user_id: Optional[int] = None
    password_hash: Optional[str] = None
    password_salt: Optional[str] = None
    current_jwt: Optional[str] = None
    jwt_issued_at: Optional[datetime] = None
    device_id: Optional[str] = None
    is_logged_in: Optional[bool] = None
    last_active: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None


class CustomerCreate(BaseModel):
    full_name: str
    phone_number: Optional[str] = None
    email: Optional[str] = None
    org_id: Optional[int] = None
    user_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None

class CustomerUpdate(BaseModel):
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    org_id: Optional[int] = None
    user_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None


class DocumentCreate(BaseModel):
    project_id: Optional[int] = None
    doc_type: Optional[str] = None
    file_name: Optional[str] = None
    file_blob: Optional[Any] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None

class DocumentUpdate(BaseModel):
    project_id: Optional[int] = None
    doc_type: Optional[str] = None
    file_name: Optional[str] = None
    file_blob: Optional[Any] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None


class InvoiceCreate(BaseModel):
    project_id: Optional[int] = None
    user_id: Optional[int] = None
    amount: Optional[float] = None
    status: Optional[str] = None
    issued_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None

class InvoiceUpdate(BaseModel):
    project_id: Optional[int] = None
    user_id: Optional[int] = None
    amount: Optional[float] = None
    status: Optional[str] = None
    issued_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None


class PaymentCreate(BaseModel):
    invoice_id: Optional[int] = None
    amount: Optional[float] = None
    method: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None

class PaymentUpdate(BaseModel):
    invoice_id: Optional[int] = None
    amount: Optional[float] = None
    method: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None


class ProjectDetailsUpdate(BaseModel):
    project_location: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None


class ProjectCreate(BaseModel):
    customer_id: Optional[int] = None
    status: Optional[str] = None
    system_config_id: Optional[int] = None
    user_id: Optional[int] = None
    org_id: Optional[int] = None
    project_location: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None

class ProjectUpdate(BaseModel):
    customer_id: Optional[int] = None
    status: Optional[str] = None
    system_config_id: Optional[int] = None
    user_id: Optional[int] = None
    org_id: Optional[int] = None
    project_location: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None


class SubscriptionCreate(BaseModel):
    user_id: Optional[int] = None
    expiration_date: Optional[datetime] = None
    grace_period_end: Optional[datetime] = None
    type: Optional[str] = None
    status: Optional[str] = None
    license_code: Optional[str] = None
    tampered: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None

class SubscriptionUpdate(BaseModel):
    user_id: Optional[int] = None
    expiration_date: Optional[datetime] = None
    grace_period_end: Optional[datetime] = None
    type: Optional[str] = None
    status: Optional[str] = None
    license_code: Optional[str] = None
    tampered: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None


class SubscriptionPaymentCreate(BaseModel):
    subscription_id: Optional[int] = None
    amount: Optional[float] = None
    payment_method: Optional[str] = None
    trx_no: Optional[str] = None
    trx_screenshot: Optional[Any] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None

class SubscriptionPaymentUpdate(BaseModel):
    subscription_id: Optional[int] = None
    amount: Optional[float] = None
    payment_method: Optional[str] = None
    trx_no: Optional[str] = None
    trx_screenshot: Optional[Any] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None


class SyncLogCreate(BaseModel):
    sync_type: Optional[str] = None
    table_name: Optional[str] = None
    status: Optional[str] = None
    user_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None

class SyncLogUpdate(BaseModel):
    sync_type: Optional[str] = None
    table_name: Optional[str] = None
    status: Optional[str] = None
    user_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None


class SystemConfigurationCreate(BaseModel):
    config_items: Optional[Any] = None
    total_wattage: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None

class SystemConfigurationUpdate(BaseModel):
    config_items: Optional[Any] = None
    total_wattage: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None


class UserCreate(BaseModel):
    username: str
    email: str
    business_name: Optional[str] = None
    account_type: Optional[str] = None
    location: Optional[str] = None
    business_logo: Optional[Any] = None
    business_email: Optional[str] = None
    status: Optional[str] = None
    org_id: Optional[int] = None
    org_name: Optional[str] = None
    branch_id: Optional[int] = None
    branch_location: Optional[str] = None
    role: Optional[str] = None
    distributor_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    business_name: Optional[str] = None
    account_type: Optional[str] = None
    location: Optional[str] = None
    business_logo: Optional[Any] = None
    business_email: Optional[str] = None
    status: Optional[str] = None
    org_id: Optional[int] = None
    org_name: Optional[str] = None
    branch_id: Optional[int] = None
    branch_location: Optional[str] = None
    role: Optional[str] = None
    distributor_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None


class OrganizationCreate(BaseModel):
    name: str
    plan_type: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None

class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    plan_type: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None

class BranchCreate(BaseModel):
    name: str
    location: Optional[str] = None
    organization_uuid: str # Assuming this is required when creating a branch
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None

class BranchUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    organization_uuid: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_dirty: Optional[bool] = None
