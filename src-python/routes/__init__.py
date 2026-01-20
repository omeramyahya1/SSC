# For easier import in main.py
import sys 
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from .appliance import appliance_bp
from .application_settings import application_settings_bp
from .authentication import authentication_bp
from .customer import customer_bp
from .document import document_bp
from .invoice import invoice_bp
from .payment import payment_bp 
from .project import project_bp
from .subscription_payment import subscription_payment_bp
from .subscription import subscription_bp
from .sync_log import sync_log_bp
from .system_configuration import system_configuration_bp
from .user import user_bp
from .organization import organization_bp
from .branch import branch_bp
from ble.api import ble_bp

all_blueprints = [
    appliance_bp,
    application_settings_bp,
    authentication_bp,
    customer_bp,
    document_bp,
    invoice_bp,
    payment_bp,
    project_bp,
    subscription_payment_bp,
    subscription_bp,
    sync_log_bp,
    system_configuration_bp,
    user_bp,
    organization_bp,
    branch_bp,
    ble_bp,
]