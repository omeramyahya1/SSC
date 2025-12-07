from .appliance import appliance_bp
from .application_setting import application_setting_bp
from .authentication import authentication_bp
from .branch import branch_bp
from .customer import customer_bp
from .license import license_bp
from .license_audit import license_audit_bp
from .organization import organization_bp
from .organization_user import organization_user_bp
from .payment import payment_bp
from .project import project_bp
from .project_item import project_item_bp
from .solar_system_config import solar_system_config_bp
from .subscription import subscription_bp
from .sync_log import sync_log_bp
from .user import user_bp

# For easier import in main.py
all_blueprints = [
    appliance_bp,
    application_setting_bp,
    authentication_bp,
    branch_bp,
    customer_bp,
    license_bp,
    license_audit_bp,
    organization_bp,
    organization_user_bp,
    payment_bp,
    project_bp,
    project_item_bp,
    solar_system_config_bp,
    subscription_bp,
    sync_log_bp,
    user_bp
]
