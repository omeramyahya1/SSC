# src-python/models.py
from datetime import datetime
from sqlalchemy import JSON, CheckConstraint, Column, Float, Integer, LargeBinary, String, DateTime, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
import uuid
import os

# --- 1. Define Base and Mixins ---

# The base class that all your models will inherit from
Base = declarative_base()

class TimestampDirtyMixin:
    """
    Mixin to add created_at, updated_at, and is_dirty columns to a model.
    """
    uuid = Column(String, default=lambda: str(uuid.uuid4()) , unique=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    is_dirty = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime, nullable=True)


# --- 2. Configuration for Local SQLite ---

# Define the local database path relative to the project structure
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE_PATH = os.path.join(BASE_DIR, 'db', 'local_data.db')
SQLITE_URL = f"sqlite:///{DB_FILE_PATH}"

# --- 3. Define Models ---

class Organization(Base, TimestampDirtyMixin):
    __tablename__ = 'organizations'

    organization_id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    plan_type = Column(String)

    # Relationships
    branches = relationship("Branch", back_populates="organization")
    users = relationship("User", back_populates="organization")
    customers = relationship("Customer", back_populates="organization")
    projects = relationship("Project", back_populates="organization")


class Branch(Base, TimestampDirtyMixin):
    __tablename__ = 'branches'

    branch_id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    location = Column(String)
    organization_uuid = Column(String, ForeignKey("organizations.uuid"), nullable=False)

    # Relationships
    organization = relationship("Organization", back_populates="branches")
    users = relationship("User", back_populates="branch")
    customers = relationship("Customer", back_populates="branch")
    projects = relationship("Project", back_populates="branch")


class User(Base, TimestampDirtyMixin):
    __tablename__ = 'user'

    user_id = Column(Integer, primary_key=True) # Local-only primary key
    username = Column(String, nullable=False)
    email = Column(String, nullable=False)
    business_name = Column(String)
    account_type = Column(String, default="standard")
    location = Column(String)
    business_logo = Column(LargeBinary)
    business_email = Column(String)
    status = Column(String)
    organization_uuid = Column(String, ForeignKey("organizations.uuid"), nullable=True)
    branch_uuid = Column(String, ForeignKey("branches.uuid"), nullable=True)
    role = Column(String, nullable=True)
    distributor_id = Column(String, nullable=True)

    __table_args__ = (
        CheckConstraint(account_type.in_(["standard", "enterprise_tier1", "enterprise_tier2"]), name="check_account_type"),
        CheckConstraint(status.in_(["active","expired","grace","trial"]), name="check_user_status"),
    )

    # relationships
    organization = relationship("Organization", back_populates="users")
    branch = relationship("Branch", back_populates="users")
    settings = relationship("ApplicationSettings", back_populates="user", uselist=False)
    customers = relationship("Customer", back_populates="user")
    projects = relationship("Project", back_populates="user")
    invoices = relationship("Invoice", back_populates="user")
    subscriptions = relationship("Subscription", back_populates="user")
    auth = relationship("Authentication", back_populates="user", uselist=False)
    sync_logs = relationship("SyncLog", back_populates="user")


class ApplicationSettings(Base, TimestampDirtyMixin):
    __tablename__ = 'application_settings'

    application_settings_id = Column(Integer, primary_key=True)
    language = Column(String)
    last_saved_path = Column(String)
    other_settings = Column(JSON)
    user_uuid = Column(String, ForeignKey("user.uuid"))

    __table_args__ = (
        CheckConstraint(language.in_(["ar","en"]), name="check_language"),
    )

    user = relationship("User", foreign_keys=[user_uuid], back_populates="settings")


class Customer(Base, TimestampDirtyMixin):
    __tablename__ = 'customers'

    customer_id = Column(Integer, primary_key=True)
    full_name = Column(String, nullable=False)
    phone_number = Column(String, nullable=True)
    email = Column(String, nullable=True)
    organization_uuid = Column(String, ForeignKey("organizations.uuid"), nullable=True)
    branch_uuid = Column(String, ForeignKey("branches.uuid"), nullable=True)
    user_uuid = Column(String, ForeignKey("user.uuid"), nullable=True)

    user = relationship("User", foreign_keys=[user_uuid], back_populates="customers")
    organization = relationship("Organization", foreign_keys=[organization_uuid], back_populates="customers")
    branch = relationship("Branch", foreign_keys=[branch_uuid], back_populates="customers")
    projects = relationship("Project", back_populates="customer")


class SystemConfiguration(Base, TimestampDirtyMixin):
    __tablename__ = 'system_configurations'

    system_config_id = Column(Integer, primary_key=True)
    config_items = Column(JSON)
    total_wattage = Column(Float)

    projects = relationship("Project", back_populates="system_config")


class Project(Base, TimestampDirtyMixin):
    __tablename__ = 'projects'

    project_id = Column(Integer, primary_key=True)
    customer_uuid = Column(String, ForeignKey("customers.uuid"))
    status = Column(String)
    system_config_uuid = Column(String, ForeignKey("system_configurations.uuid"))
    user_uuid = Column(String, ForeignKey("user.uuid"))
    organization_uuid = Column(String, ForeignKey("organizations.uuid"), nullable=True)
    branch_uuid = Column(String, ForeignKey("branches.uuid"), nullable=True)
    project_location = Column(String, nullable=True)

    __table_args__ = (
        CheckConstraint(status.in_(["planning","execution","done","archived"]), name="check_project_status"),
    )

    customer = relationship("Customer", foreign_keys=[customer_uuid], back_populates="projects")
    system_config = relationship("SystemConfiguration", foreign_keys=[system_config_uuid], back_populates="projects")
    user = relationship("User", foreign_keys=[user_uuid], back_populates="projects")
    organization = relationship("Organization", foreign_keys=[organization_uuid], back_populates="projects")
    branch = relationship("Branch", foreign_keys=[branch_uuid], back_populates="projects")
    appliances = relationship("Appliance", back_populates="project")
    invoices = relationship("Invoice", back_populates="project")
    documents = relationship("Document", back_populates="project")


class Appliance(Base, TimestampDirtyMixin):
    __tablename__ = 'appliances'

    appliance_id = Column(Integer, primary_key=True)
    project_uuid = Column(String, ForeignKey("projects.uuid"))
    appliance_name = Column(String)
    type = Column(String)
    qty = Column(Integer)
    use_hours_night = Column(Float)
    wattage = Column(Float)
    energy_consumption = Column(Float)

    project = relationship("Project", foreign_keys=[project_uuid], back_populates="appliances")


class Invoice(Base, TimestampDirtyMixin):
    __tablename__ = 'invoices'

    invoice_id = Column(Integer, primary_key=True)
    project_uuid = Column(String, ForeignKey("projects.uuid"))
    user_uuid = Column(String, ForeignKey("user.uuid"))
    amount = Column(Float)
    status = Column(String)
    issued_at = Column(DateTime)

    __table_args__ = (
        CheckConstraint(status.in_(["paid","pending","partial"]), name="check_invoice_status"),
    )

    project = relationship("Project", foreign_keys=[project_uuid], back_populates="invoices")
    user = relationship("User", foreign_keys=[user_uuid], back_populates="invoices")
    payments = relationship("Payment", back_populates="invoice")


class Payment(Base, TimestampDirtyMixin):
    __tablename__ = 'payments'

    payment_id = Column(Integer, primary_key=True)
    invoice_uuid = Column(String, ForeignKey("invoices.uuid"))
    amount = Column(Float)
    method = Column(String)

    invoice = relationship("Invoice", foreign_keys=[invoice_uuid], back_populates="payments")


class SubscriptionPayment(Base, TimestampDirtyMixin):
    __tablename__ = 'subscription_payments'

    payment_id = Column(Integer, primary_key=True)
    subscription_uuid = Column(String, ForeignKey("subscriptions.uuid"))
    amount = Column(Float)
    payment_method = Column(String)
    trx_no = Column(String, nullable=True)
    trx_screenshot = Column(LargeBinary, nullable=True)
    status = Column(String)

    __table_args__ = (
        CheckConstraint(status.in_(["under_processing","approved","declined"]), name="check_subscription_payment_status"),
    )

    subscription = relationship("Subscription", foreign_keys=[subscription_uuid], back_populates="payments")


class Subscription(Base, TimestampDirtyMixin):
    __tablename__ = 'subscriptions'

    subscription_id = Column(Integer, primary_key=True)
    user_uuid = Column(String, ForeignKey("user.uuid"))
    expiration_date = Column(DateTime)
    grace_period_end = Column(DateTime)
    type = Column(String)
    status = Column(String, default="pending")
    license_code = Column(String)
    tampered = Column(Boolean, default=False, nullable=False)

    __table_args__ = (
        CheckConstraint(type.in_(["trial","monthly","annual","lifetime"]), name="check_subscription_type"),
        CheckConstraint(status.in_(["active", "expired", "trial", "pending"]), name="check_subscription_status"),
    )

    user = relationship("User", foreign_keys=[user_uuid], back_populates="subscriptions")
    payments = relationship("SubscriptionPayment", back_populates="subscription")


class Document(Base, TimestampDirtyMixin):
    __tablename__ = 'documents'

    doc_id = Column(Integer, primary_key=True)
    project_uuid = Column(String, ForeignKey("projects.uuid"))
    doc_type = Column(String)
    file_name = Column(String)
    file_blob = Column(LargeBinary)

    __table_args__ = (
        CheckConstraint(doc_type.in_(["Invoice","Project Breakdown"]), name="check_document_type"),
    )

    project = relationship("Project", foreign_keys=[project_uuid], back_populates="documents")


class Authentication(Base, TimestampDirtyMixin):
    __tablename__ = 'authentications'

    auth_id = Column(Integer, primary_key=True)
    user_uuid = Column(String, ForeignKey("user.uuid"))
    password_hash = Column(String)
    password_salt = Column(String)
    current_jwt = Column(String, nullable=True)
    jwt_issued_at = Column(DateTime)
    device_id = Column(String, nullable=True)
    is_logged_in = Column(Boolean)
    last_active = Column(DateTime)

    user = relationship("User", foreign_keys=[user_uuid], back_populates="auth")


class SyncLog(Base, TimestampDirtyMixin):
    __tablename__ = 'sync_log'

    sync_id = Column(Integer, primary_key=True)
    sync_type = Column(String)
    table_name = Column(String)
    status = Column(String)
    user_uuid = Column(String, ForeignKey("user.uuid"))

    __table_args__ = (
        CheckConstraint(sync_type.in_(["full","incremental"]), name="check_sync_type"),
        CheckConstraint(status.in_(["success","failed"]), name="check_sync_status"),
    )

    user = relationship("User", foreign_keys=[user_uuid], back_populates="sync_logs")
