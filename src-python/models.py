# src-python/models.py
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Enum, Numeric, Date, DateTime, Boolean, BigInteger, DECIMAL, ForeignKey, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.schema import UniqueConstraint
import os

# --- 1. Define Base and Configuration ---

# The base class that all your models will inherit from
Base = declarative_base()

# --- 2. Configuration for Local SQLite ---

# Define the local database path relative to the project structure
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE_PATH = os.path.join(BASE_DIR, 'db', 'local_data.db')
SQLITE_URL = f"sqlite:///{DB_FILE_PATH}"

# --- 3. SQL-Python Models Schema translation ---

# ---------------------------------------------------------
# Organizations
# ---------------------------------------------------------
class Organization(Base):
    __tablename__ = "Organizations"

    organization_id = Column(Integer, primary_key=True, autoincrement=True)
    organization_name = Column(String(255), nullable=False, unique=True)
    legal_email = Column(String(255))
    registration_date = Column(Date)
    status = Column(Enum('active', 'suspended', 'pending'), default='active', nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    updated_at = Column(DateTime, nullable=False, default=datetime.now, onupdate=datetime.now)

    branches = relationship("Branch", back_populates="organization")
    users = relationship("OrganizationUser", back_populates="organization")
    customers = relationship("Customer", back_populates="organization")
    settings = relationship("ApplicationSetting", back_populates="organization")
    projects = relationship("Project", back_populates="organization")
    licenses = relationship("License", back_populates="issued_for_org")


# ---------------------------------------------------------
# Branches
# ---------------------------------------------------------
class Branch(Base):
    __tablename__ = "Branches"

    branch_id = Column(Integer, primary_key=True, autoincrement=True)
    organization_id = Column(Integer, ForeignKey("Organizations.organization_id"), nullable=False)
    branch_name = Column(String(255), nullable=False)
    branch_location = Column(String(255))
    contact_email = Column(String(255))
    contact_phone = Column(String(255))
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    updated_at = Column(DateTime, nullable=False, default=datetime.now, onupdate=datetime.now)

    organization = relationship("Organization", back_populates="branches")
    users = relationship("OrganizationUser", back_populates="branch")
    customers = relationship("Customer", back_populates="branch")
    projects = relationship("Project", back_populates="branch")


# ---------------------------------------------------------
# Users (Core)
# ---------------------------------------------------------
class User(Base):
    __tablename__ = "Users"

    user_id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(255), nullable=False, unique=True)
    business_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    phone_number = Column(String(255), nullable=False)
    location = Column(String(255), nullable=False)
    logo_path = Column(Text, nullable=False)
    business_email = Column(String(255), nullable=False)
    business_phone = Column(String(255), nullable=False)
    registration_date = Column(Date, nullable=False)
    status = Column(Enum('active', 'expired', 'trial', 'grace'), default='trial', nullable=False)
    language = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    updated_at = Column(DateTime, nullable=False, default=datetime.now, onupdate=datetime.now)

    auth = relationship("Authentication", back_populates="user", uselist=False)
    subscriptions = relationship("Subscription", back_populates="user")
    payments = relationship("Payment", back_populates="user")
    org_links = relationship("OrganizationUser", back_populates="user")
    settings = relationship("ApplicationSetting", back_populates="updated_by")
    projects = relationship("Project", back_populates="user")
    sync_logs = relationship("SyncLog", back_populates="user")
    licenses = relationship("License", back_populates="issued_for_user")


# ---------------------------------------------------------
# OrganizationUsers (mapping table)
# ---------------------------------------------------------
class OrganizationUser(Base):
    __tablename__ = "OrganizationUsers"

    org_user_id = Column(Integer, primary_key=True, autoincrement=True)
    organization_id = Column(Integer, ForeignKey("Organizations.organization_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("Branches.branch_id"))
    user_id = Column(Integer, ForeignKey("Users.user_id"), nullable=False)
    role = Column(Enum('admin', 'manager', 'user'), default='user', nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.now)

    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", "branch_id", name="org_user_unique"),
    )

    organization = relationship("Organization", back_populates="users")
    branch = relationship("Branch", back_populates="users")
    user = relationship("User", back_populates="org_links")


# ---------------------------------------------------------
# Authentication
# ---------------------------------------------------------
class Authentication(Base):
    __tablename__ = "Authentication"

    auth_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("Users.user_id"), unique=True, nullable=False)
    password_hash = Column(String(512), nullable=False)
    password_salt = Column(String(255))
    current_jwt = Column(Text)
    jwt_issued_at = Column(DateTime)
    device_id = Column(String(255))
    is_logged_in = Column(Boolean, default=False)
    last_active = Column(DateTime)
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    updated_at = Column(DateTime, nullable=False, default=datetime.now, onupdate=datetime.now)

    user = relationship("User", back_populates="auth")


# ---------------------------------------------------------
# Customers
# ---------------------------------------------------------
class Customer(Base):
    __tablename__ = "Customers"

    customer_id = Column(Integer, primary_key=True, autoincrement=True)
    organization_id = Column(Integer, ForeignKey("Organizations.organization_id"))
    branch_id = Column(Integer, ForeignKey("Branches.branch_id"))
    name = Column(String(255), nullable=False)
    contact_email = Column(String(255))
    contact_phone = Column(String(255))
    address = Column(Text)
    tax_id = Column(String(255))
    notes = Column(Text)
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    updated_at = Column(DateTime, nullable=False, default=datetime.now, onupdate=datetime.now)

    organization = relationship("Organization", back_populates="customers")
    branch = relationship("Branch", back_populates="customers")
    projects = relationship("Project", back_populates="customer")


# ---------------------------------------------------------
# Licenses
# ---------------------------------------------------------
class License(Base):
    __tablename__ = "Licenses"

    license_id = Column(Integer, primary_key=True, autoincrement=True)
    license_code = Column(String(255), nullable=False, unique=True)
    license_plan = Column(Enum('monthly', 'annual', 'lifetime'), nullable=False)
    issued_for_org_id = Column(Integer, ForeignKey("Organizations.organization_id"))
    issued_for_user_id = Column(Integer, ForeignKey("Users.user_id"))
    issued_at = Column(DateTime, nullable=False)
    expires_at = Column(DateTime)
    max_seats = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    updated_at = Column(DateTime, nullable=False, default=datetime.now, onupdate=datetime.now)

    issued_for_org = relationship("Organization", back_populates="licenses")
    issued_for_user = relationship("User", back_populates="licenses")
    audits = relationship("LicenseAudit", back_populates="license")
    subscriptions = relationship("Subscription", back_populates="license")


# ---------------------------------------------------------
# Payments
# ---------------------------------------------------------
class Payment(Base):
    __tablename__ = "Payments"

    payment_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("Users.user_id"), nullable=False)
    paymed_date = Column(DateTime, nullable=False)
    payment_method = Column(Enum('bankak','fawry','bnmb','ocash','mycashi','bravo','bede','other'), nullable=False)
    amount = Column(Integer, nullable=False)
    transaction_ref = Column(String(255), nullable=False)
    verified_by = Column(String(255))
    verification_date = Column(Date)
    status = Column(Enum('pending','verified','rejected'), default='pending', nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    updated_at = Column(DateTime, nullable=False, default=datetime.now, onupdate=datetime.now)

    user = relationship("User", back_populates="payments")
    subscriptions = relationship("Subscription", back_populates="payment")


# ---------------------------------------------------------
# Subscriptions
# ---------------------------------------------------------
class Subscription(Base):
    __tablename__ = "Subscriptions"

    subscription_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("Users.user_id"), nullable=False)
    license_code = Column(String(255), ForeignKey("Licenses.license_code"), nullable=False)
    plan_type = Column(Enum('trial','monthly','annual','lifetime'), default='trial', nullable=False)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime)
    grace_period_end = Column(DateTime)
    is_active = Column(Boolean, default=True)
    verification_status = Column(Enum('pending','verified','revoked'), default='pending', nullable=False)
    issued_by = Column(String(255))
    payment_id = Column(Integer, ForeignKey("Payments.payment_id"))
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    updated_at = Column(DateTime, nullable=False, default=datetime.now, onupdate=datetime.now)

    user = relationship("User", back_populates="subscriptions")
    license = relationship("License", back_populates="subscriptions")
    payment = relationship("Payment", back_populates="subscriptions")


# ---------------------------------------------------------
# License Audit
# ---------------------------------------------------------
class LicenseAudit(Base):
    __tablename__ = "LicenseAudit"

    audit_id = Column(Integer, primary_key=True, autoincrement=True)
    license_code = Column(String(255), ForeignKey("Licenses.license_code"), nullable=False)
    checked_at_local = Column(DateTime, nullable=False)
    server_time = Column(DateTime)
    server_signature = Column(String(1024))
    verification_result = Column(Enum('ok','tampered','expired','unknown'), nullable=False)
    notes = Column(Text)
    created_at = Column(DateTime, nullable=False, default=datetime.now)

    license = relationship("License", back_populates="audits")


# ---------------------------------------------------------
# Application Settings
# ---------------------------------------------------------
class ApplicationSetting(Base):
    __tablename__ = "ApplicationSettings"

    setting_id = Column(Integer, primary_key=True, autoincrement=True)
    organization_id = Column(Integer, ForeignKey("Organizations.organization_id"))
    key_name = Column(String(255), nullable=False)
    value = Column(Text)
    value_type = Column(Enum('string','number','boolean','json'), default='string')
    updated_by_user = Column(Integer, ForeignKey("Users.user_id"))
    updated_at = Column(DateTime, nullable=False, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (
        UniqueConstraint("organization_id", "key_name"),
    )

    organization = relationship("Organization", back_populates="settings")
    updated_by = relationship("User", back_populates="settings")


# ---------------------------------------------------------
# Projects
# ---------------------------------------------------------
class Project(Base):
    __tablename__ = "Projects"

    project_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("Users.user_id"), nullable=False)
    organization_id = Column(Integer, ForeignKey("Organizations.organization_id"))
    branch_id = Column(Integer, ForeignKey("Branches.branch_id"))
    customer_id = Column(Integer, ForeignKey("Customers.customer_id"))
    client_name = Column(String(255), nullable=False)
    project_status = Column(Enum('under evaluation','under execution','executed','canceled','other'), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    updated_at = Column(DateTime, nullable=False, default=datetime.now, onupdate=datetime.now)
    total_cost = Column(Integer)
    proposal_path = Column(Text)
    loads_breakdown_path = Column(Text)

    user = relationship("User", back_populates="projects")
    organization = relationship("Organization", back_populates="projects")
    branch = relationship("Branch", back_populates="projects")
    customer = relationship("Customer", back_populates="projects")
    appliances = relationship("Appliance", back_populates="project")
    config = relationship("SolarSystemConfig", back_populates="project")
    items = relationship("ProjectItem", back_populates="project")


# ---------------------------------------------------------
# Appliances
# ---------------------------------------------------------
class Appliance(Base):
    __tablename__ = "Appliances"

    appliance_id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("Projects.project_id"), nullable=False)
    appliance_name = Column(Text, nullable=False)
    wattage = Column(Numeric(8,2), nullable=False)
    quantiy = Column(Integer, nullable=False)
    user_time_hours = Column(Numeric(8,2), nullable=False)
    energy_consumption = Column(Numeric(12,4), nullable=False)

    project = relationship("Project", back_populates="appliances")


# ---------------------------------------------------------
# Solar System Config
# ---------------------------------------------------------
class SolarSystemConfig(Base):
    __tablename__ = "SolarSystemConfig"

    config_id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("Projects.project_id"), nullable=False)
    panel_brand = Column(String(255), nullable=False)
    panel_type = Column(String(255), nullable=False)
    panel_wattage = Column(Numeric(8,2), nullable=False)
    panel_connection = Column(Enum('series','parallel','mixed'), nullable=False)
    inverter_brand = Column(String(255), nullable=False)
    inverter_capacity = Column(Numeric(8,2), nullable=False)
    battery_brand = Column(String(255), nullable=False)
    battery_type = Column(Enum('liquid','dry','lithium','mixed'), nullable=False)
    battery_connection = Column(Enum('series','parallel','mixed'), nullable=False)
    total_system_cost = Column(Integer, nullable=False)

    project = relationship("Project", back_populates="config")


# ---------------------------------------------------------
# Project Items
# ---------------------------------------------------------
class ProjectItem(Base):
    __tablename__ = "ProjectItems"

    item_id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("Projects.project_id"), nullable=False)
    item_category = Column(Enum('panel','inverter','battery','accessory'), nullable=False)
    item_name = Column(String(255), nullable=False)
    unit_price = Column(Integer, nullable=False)
    quantity = Column(Integer, nullable=False)
    total_price = Column(Integer, nullable=False)

    project = relationship("Project", back_populates="items")


# ---------------------------------------------------------
# Sync Log
# ---------------------------------------------------------
class SyncLog(Base):
    __tablename__ = "SyncLog"

    sync_id = Column(Integer, primary_key=True, autoincrement=True)
    sync_date = Column(DateTime, nullable=False)
    user_id = Column(Integer, ForeignKey("Users.user_id"), nullable=False)
    sync_type = Column(Enum('download','upload'), nullable=False)
    data_type = Column(Enum('projects','proposals','sales','settings'), nullable=False)
    status = Column(Enum('success','failed'), nullable=False)
    notes = Column(Text)

    user = relationship("User", back_populates="sync_logs")
