# src-python/models.py
from datetime import datetime
from sqlalchemy import JSON, CheckConstraint, Column, Float, Integer, LargeBinary, String, DateTime, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
import os

# --- 1. Define Base and Configuration ---

# The base class that all your models will inherit from
Base = declarative_base()

# --- 2. Configuration for Local SQLite ---

# Define the local database path relative to the project structure
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE_PATH = os.path.join(BASE_DIR, 'db', 'local_data.db')
SQLITE_URL = f"sqlite:///{DB_FILE_PATH}"

# --- 3. Define Models ---

class User(Base):
    __tablename__ = 'user'

    user_id = Column(Integer, primary_key=True)
    username = Column(String, nullable=False)
    registration_date = Column(DateTime, default=datetime.utcnow)
    email = Column(String, nullable=False)
    business_name = Column(String)
    account_type = Column(String, default="standard")
    location = Column(String)
    business_logo = Column(LargeBinary)
    business_email = Column(String)
    status = Column(String)
    org_id = Column(Integer, nullable=True)
    org_name = Column(String, nullable=True)
    branch_id = Column(Integer, nullable=True)
    branch_location = Column(String, nullable=True)
    role = Column(String, nullable=True)

    __table_args__ = (
        CheckConstraint(account_type.in_(["standard", "enterprise_tier1", "enterprise_tier2"]), name="check_account_type"),
        CheckConstraint(status.in_(["active","expired","grace","trial"]), name="check_user_status"),
    )

    # relationships
    settings = relationship("ApplicationSettings", back_populates="user", uselist=False)
    customers = relationship("Customer", back_populates="user")
    projects = relationship("Project", back_populates="user")
    invoices = relationship("Invoice", back_populates="user")
    subscriptions = relationship("Subscription", back_populates="user")
    auth = relationship("Authentication", back_populates="user", uselist=False)
    sync_logs = relationship("SyncLog", back_populates="user")


class ApplicationSettings(Base):
    __tablename__ = 'application_settings'

    id = Column(Integer, primary_key=True)
    language = Column(String)
    last_saved_path = Column(String)
    other_settings = Column(JSON)
    user_id = Column(Integer, ForeignKey("user.user_id"))

    __table_args__ = (
        CheckConstraint(language.in_(["ar","en"]), name="check_language"),
    )

    user = relationship("User", back_populates="settings")


class Customer(Base):
    __tablename__ = 'customers'

    customer_id = Column(Integer, primary_key=True)
    full_name = Column(String, nullable=False)
    date_created = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    phone_number = Column(String, nullable=True)
    email = Column(String, nullable=True)
    org_id = Column(Integer, nullable=True)
    user_id = Column(Integer, ForeignKey("user.user_id"), nullable=True)

    user = relationship("User", back_populates="customers")
    projects = relationship("Project", back_populates="customer")


class SystemConfiguration(Base):
    __tablename__ = 'system_configurations'

    system_config_id = Column(Integer, primary_key=True)
    config_items = Column(JSON)
    total_wattage = Column(Float)

    projects = relationship("Project", back_populates="system_config")


class Project(Base):
    __tablename__ = 'projects'

    project_id = Column(Integer, primary_key=True)
    date_created = Column(DateTime, default=datetime.utcnow)
    last_edited_date = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    customer_id = Column(Integer, ForeignKey("customers.customer_id"))
    status = Column(String)
    system_config_id = Column(Integer, ForeignKey("system_configurations.system_config_id"))
    user_id = Column(Integer, ForeignKey("user.user_id"))
    org_id = Column(Integer, nullable=True)
    project_location = Column(String, nullable=True)

    __table_args__ = (
        CheckConstraint(status.in_(["planning","execution","done","archived"]), name="check_project_status"),
    )

    customer = relationship("Customer", back_populates="projects")
    system_config = relationship("SystemConfiguration", back_populates="projects")
    user = relationship("User", back_populates="projects")
    appliances = relationship("Appliance", back_populates="project")
    invoices = relationship("Invoice", back_populates="project")
    documents = relationship("Document", back_populates="project")


class Appliance(Base):
    __tablename__ = 'appliances'

    appliance_id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.project_id"))
    appliance_name = Column(String)
    type = Column(String)
    qty = Column(Integer)
    use_hours_night = Column(Float)
    wattage = Column(Float)
    energy_consumption = Column(Float)

    project = relationship("Project", back_populates="appliances")


class Invoice(Base):
    __tablename__ = 'invoices'

    invoice_id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.project_id"))
    user_id = Column(Integer, ForeignKey("user.user_id"))
    amount = Column(Float)
    status = Column(String)
    issued_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        CheckConstraint(status.in_(["paid","pending","partial"]), name="check_invoice_status"),
    )

    project = relationship("Project", back_populates="invoices")
    user = relationship("User", back_populates="invoices")
    payments = relationship("Payment", back_populates="invoice")


class Payment(Base):
    __tablename__ = 'payments'

    payment_id = Column(Integer, primary_key=True)
    invoice_id = Column(Integer, ForeignKey("invoices.invoice_id"))
    date_created = Column(DateTime, default=datetime.utcnow)
    last_edited_date = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    amount = Column(Float)
    method = Column(String)

    invoice = relationship("Invoice", back_populates="payments")


class SubscriptionPayment(Base):
    __tablename__ = 'subscription_payments'

    payment_id = Column(Integer, primary_key=True)
    amount = Column(Float)
    payment_method = Column(String)
    payment_date = Column(DateTime, default=datetime.utcnow)
    transaction_reference = Column(LargeBinary)
    status = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        CheckConstraint(status.in_(["under_processing","approved","declined"]), name="check_subscription_payment_status"),
    )

    subscriptions = relationship("Subscription", back_populates="payment")


class Subscription(Base):
    __tablename__ = 'subscriptions'

    subscription_id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("user.user_id"))
    payment_id = Column(Integer, ForeignKey("subscription_payments.payment_id"))
    date_created = Column(DateTime, default=datetime.utcnow)
    expiration_date = Column(DateTime)
    grace_period_end = Column(DateTime)
    type = Column(String)
    status = Column(String)
    license_code = Column(String)

    __table_args__ = (
        CheckConstraint(type.in_(["trial","monthly","annual","lifetime"]), name="check_subscription_type"),
        CheckConstraint(status.in_(["active","expired","trial","pending"]), name="check_subscription_status"),
    )

    user = relationship("User", back_populates="subscriptions")
    payment = relationship("SubscriptionPayment", back_populates="subscriptions")


class Document(Base):
    __tablename__ = 'documents'

    doc_id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.project_id"))
    date_created = Column(DateTime, default=datetime.utcnow)
    last_edited_date = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    doc_type = Column(String)
    file_name = Column(String)
    file_blob = Column(LargeBinary)

    __table_args__ = (
        CheckConstraint(doc_type.in_(["Invoice","Project Breakdown"]), name="check_document_type"),
    )

    project = relationship("Project", back_populates="documents")


class Authentication(Base):
    __tablename__ = 'authentication'

    auth_id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("user.user_id"))
    password_hash = Column(String)
    password_salt = Column(String)
    current_jwt = Column(String, nullable=True)
    jwt_issued_at = Column(DateTime)
    device_id = Column(String, nullable=True)
    is_logged_in = Column(Boolean)
    last_active = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="auth")


class SyncLog(Base):
    __tablename__ = 'sync_log'

    sync_id = Column(Integer, primary_key=True)
    sync_date = Column(DateTime, default=datetime.utcnow)
    sync_type = Column(String)
    data_type = Column(String)
    status = Column(String)
    user_id = Column(Integer, ForeignKey("user.user_id"))

    __table_args__ = (
        CheckConstraint(sync_type.in_(["full","incremental"]), name="check_sync_type"),
        CheckConstraint(data_type.in_(["projects","proposals","sales","settings"]), name="check_data_type"),
        CheckConstraint(status.in_(["success","failed"]), name="check_sync_status"),
    )

    user = relationship("User", back_populates="sync_logs")
