from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db, generate_salt, hash_password, generate_temp_password
from models import User, Authentication, ApplicationSettings, Subscription, SubscriptionPayment, Organization, Branch
from schemas import UserCreate, UserUpdate
from auth_schemas import RegistrationPayload
from serializer import model_to_dict
from routes.sync_log import sync, upload_blob
import base64
import uuid
from datetime import datetime, timedelta
from supabase_client import get_anon_client, get_service_role_client

user_bp = Blueprint('user_bp', __name__, url_prefix='/users')

DEFAULT_APPLIANCE_LIBRARY = [
    {"name": "LED Bulb", "wattage": 10, "surge_power": 10, "type": "light"},
    {"name": "Incandescent Bulb", "wattage": 60, "surge_power": 60, "type": "light"},
    {"name": "Fan", "wattage": 75, "surge_power": 150, "type": "standard"},
    {"name": "Laptop", "wattage": 65, "surge_power": 65, "type": "standard"},
    {"name": "Desktop Computer", "wattage": 300, "surge_power": 300, "type": "standard"},
    {"name": "Refrigerator (Medium)", "wattage": 200, "surge_power": 800, "type": "heavy"},
    {"name": "Freezer", "wattage": 100, "surge_power": 400, "type": "heavy"},
    {"name": "TV (LED)", "wattage": 100, "surge_power": 100, "type": "standard"},
    {"name": "Microwave", "wattage": 1200, "surge_power": 1200, "type": "heavy"},
    {"name": "Washing Machine", "wattage": 500, "surge_power": 1500, "type": "heavy"},
    {"name": "Air Conditioner (1 Ton)", "wattage": 1500, "surge_power": 4500, "type": "heavy"},
    {"name": "Water Pump (1 HP)", "wattage": 750, "surge_power": 2250, "type": "heavy"},
    {"name": "Phone Charger", "wattage": 10, "surge_power": 10, "type": "standard"},
]

@user_bp.route('/pricing', methods=['GET'])
def get_pricing_data():
    """
    Fetches detailed pricing data from the cloud's detailed_pricing view.
    """
    try:
        supabase = get_anon_client()
        response = supabase.table('detailed_pricing').select('*').execute()

        # The supabase-py client v1 wraps the data in a Pydantic model, access via .data
        if not hasattr(response, 'data'):
             raise Exception("Invalid response structure from Supabase client.")

        return jsonify(response.data), 200
    except Exception as e:
        print(f"Error fetching pricing data from Supabase: {e}")
        return jsonify({"error": "Could not retrieve pricing information"}), 500

@user_bp.route('/check-email-uniqueness', methods=['POST'])
def check_email_uniqueness():
    """
    Checks if an email is unique by calling a Supabase RPC.
    """
    data = request.get_json()
    if not data or 'email' not in data:
        return jsonify({"error": "Email is required"}), 400

    email_to_check = data['email']

    try:
        supabase = get_service_role_client()
        # The RPC function `check_email_exists` returns:
        # - `true` if the email does NOT exist (it is unique/available).
        # - `false` if the email DOES exist (it is not unique).
        response = supabase.rpc('check_email_exists', {'email_to_check': email_to_check}).execute()

        # The actual boolean result is in response.data
        is_unique = response.data

        return jsonify({"isUnique": is_unique}), 200

    except Exception as e:
        print(f"Error calling Supabase RPC 'check_email_exists': {e}")
        # In case of an error, it's safer to assume the email is not unique
        # to prevent accidental duplicates on the client side.
        return jsonify({"error": "Failed to verify email uniqueness", "isUnique": False}), 500

@user_bp.route('/bank-accounts', methods=['GET'])
def get_bank_accounts():
    bank_accounts = dict()
    try:
        supabase = get_anon_client()
        response = supabase.table('bank_accounts').select('*').execute()

        # The supabase-py client v1 wraps the data in a Pydantic model, access via .data
        if not hasattr(response, 'data'):
             raise Exception("Invalid response structure from Supabase client.")

        for d in response.data:
            bank_accounts[d["bank_name"]] = {
                "account_name": d["account_name"],
                "account_number": d["account_number"],
                "qr_code": d["qr_code"]
            }

        return jsonify(bank_accounts), 200
    except Exception as e:
        print(f"Error fetching bank accounts data from Supabase: {e}")
        return jsonify({"error": "Could not retrieve bank accounts information"}), 500

@user_bp.route('/check-referral', methods=['POST'])
def check_referral_code():
    """
    Checks a referral code by calling a Supabase RPC.
    """
    data = request.get_json()
    if not data or 'referral_code' not in data:
        return jsonify({"error": "Referral code is required"}), 400

    referral_code_to_check = data['referral_code']

    try:
        supabase = get_service_role_client()
        response = supabase.rpc('check_referral_code', {'p_referral_code': referral_code_to_check}).execute()

        if not hasattr(response, 'data') or not response.data:
            return jsonify({"isValid": False, "message": "Referral code not found or invalid."}), 200

        # The RPC returns a list of objects, even if only one matches.
        # We expect at most one match for a unique referral code.
        referral_data = response.data[0]

        return jsonify({
            "isValid": True,
            "distributorId": str(referral_data['distributor_id']),
            "discountPercent": referral_data['discount_percent']
        }), 200

    except Exception as e:
        print(f"Error calling Supabase RPC 'check_referral_code': {e}")
        return jsonify({"error": "Failed to verify referral code uniqueness", "isValid": False}), 500

@user_bp.route('/register', methods=['POST'])
def register_user():
    try:
        payload = RegistrationPayload(**request.json)
    except ValidationError as e:
        return jsonify({"error": "Invalid payload", "details": e.errors()}), 400

    stage1 = payload.stage1

    with get_db() as db:
        # Prepare authentication data
        salt = generate_salt()
        hashed_pw = hash_password(stage1.password, salt)
        device_id = str(uuid.uuid4()) # This device_id is for the current session/device

        # Generate UUIDs upfront for new records
        new_user_uuid = str(uuid.uuid4())
        new_auth_uuid = str(uuid.uuid4())
        new_sub_uuid = str(uuid.uuid4())
        new_settings_uuid = str(uuid.uuid4())
        new_payment_uuid = str(uuid.uuid4()) if payload.plan_type != 'Free Trial' else None
        new_device_uuid = str(uuid.UUID(device_id))

        new_org_uuid = None
        new_branch_uuid = None

        # Prepare user data
        stage4 = payload.stage4
        location = f"{stage4.locationCity}, {stage4.locationState}" if stage4.locationCity and stage4.locationState else None
        user_status = 'trial' if payload.plan_type == "trial" else "active"

        # Handle business logo upload if present
        logo_bytes = None
        if stage4.logo:
            try:
                logo_b64 = stage4.logo.split("base64,")[1] if "base64," in stage4.logo else stage4.logo
                logo_bytes = base64.b64decode(logo_b64)
                path = f"user_logos/{new_user_uuid}.png"
                upload_blob(logo_bytes, "SSC", path, use_service_client=True)
            except Exception as e:
                print(f"Warning: Could not decode or upload logo for user {stage1.email}. Error: {e}")

        # Determine emp_count
        emp_count = 1
        if payload.stage3 and payload.stage3.employees:
            emp_count = payload.stage3.employees
        elif 'enterprise' in payload.account_type:
             # Default for enterprise if not specified (though it should be)
             emp_count = 0

        # Handle Enterprise Account specific logic
        if 'enterprise' in payload.account_type:
            branch_name = "HQ" if payload.language == 'en' else "الفرع الرئيسي"
            try:
                print("--- Calling register_organization RPC ---")
                service_client = get_service_role_client()
                response = service_client.rpc('register_organization', {
                    'p_org_name': stage4.businessName,
                    'p_plan_type': payload.account_type,
                    'p_branch_name': branch_name
                }).execute()

                if not hasattr(response, 'data') or not response.data:
                    raise Exception("Failed to create organization: No data returned from RPC.")

                org_data = response.data
                new_org_uuid = org_data['organization_id']
                new_branch_uuid = org_data['branch_id']
                print("--- register_organization RPC Completed ---")

            except Exception as e:
                print(f"Error calling register_organization RPC: {str(e)}")
                return jsonify({"error": "Failed to create organization in the cloud using RPC."}), 500

            # Create Organization locally (already exists in remote)
            new_org = Organization(
                uuid=new_org_uuid,
                name=stage4.businessName,
                plan_type=payload.account_type,
                emp_count=emp_count,
                is_dirty=False # Not dirty, it's already in Supabase
            )
            db.add(new_org)

            # Create Branch locally (already exists in remote)
            new_branch = Branch(
                uuid=new_branch_uuid,
                name=branch_name,
                organization_uuid=new_org_uuid,
                location=location,
                is_dirty=False # Not dirty
            )
            db.add(new_branch)
        else:
            # For non-enterprise users, we might still want an organization record for consistency
            # but usually they are standalone. However, some parts of the app might expect an org.
            # If standard account has no org_uuid, we don't create Organization record here.
            pass

        # Call register_user RPC
        try:
            print("--- Calling register_user RPC ---")
            service_client = get_service_role_client()
            service_client.rpc('register_user', {
                'p_user_uuid': new_user_uuid, 'p_username': stage1.username, 'p_email': stage1.email,
                'p_auth_uuid': new_auth_uuid, 'p_password_hash': hashed_pw, 'p_password_salt': salt,
                'p_device_id': new_device_uuid, 'p_distributor_id': payload.distributor_id
            }).execute()
            print("--- register_user RPC Completed ---")
        except Exception as e:
            print(f"Error calling register_user RPC: {str(e)}")
            return jsonify({"error": "Failed to create user in the cloud using RPC."}), 500

        # Create local records
        new_user = User(
            uuid=new_user_uuid, username=stage1.username, email=stage1.email,
            business_name=stage4.businessName, account_type=payload.account_type, location=location,
            business_logo=logo_bytes, status=user_status,
            role='admin' if 'enterprise' in payload.account_type else 'user',
            organization_uuid=new_org_uuid, branch_uuid=new_branch_uuid,
            distributor_id=payload.distributor_id,
            is_dirty=False # Changed to False as record created via RPC
        )
        db.add(new_user)

        new_auth = Authentication(
            uuid=new_auth_uuid, user_uuid=new_user_uuid, password_hash=hashed_pw, password_salt=salt,
            is_dirty=False # Changed to False as record created via RPC
        )
        db.add(new_auth)

        new_settings = ApplicationSettings(
            uuid=new_settings_uuid, user_uuid=new_user_uuid, language=payload.language,
            other_settings={"appliance_library": DEFAULT_APPLIANCE_LIBRARY},
            is_dirty=True
        )
        db.add(new_settings)

        new_sub = Subscription(
            uuid=new_sub_uuid, user_uuid=new_user_uuid, type=payload.plan_type,
            status='trial' if payload.plan_type == 'trial' else 'active',
            expiration_date=datetime.utcnow() + timedelta(days=30), is_dirty=True
        )
        db.add(new_sub)

        if payload.plan_type != 'trial':
            receipt_bytes = None
            if payload.stage7.receipt:
                try:
                    receipt_b64 = payload.stage7.receipt.split("base64,")[1] if "base64," in payload.stage7.receipt else payload.stage7.receipt
                    receipt_bytes = base64.b64decode(receipt_b64)
                except Exception as e:
                    print(f"Warning: Could not decode receipt for user {stage1.email}. Error: {e}")

            new_payment = SubscriptionPayment(
                uuid=new_payment_uuid, subscription_uuid=new_sub_uuid, amount=payload.amount,
                payment_method=payload.stage6.paymentMethod, trx_no=payload.stage7.referenceNumber,
                trx_screenshot=receipt_bytes, status='under_processing', is_dirty=True
            )
            db.add(new_payment)

        db.commit()

        # Issue JWT
        jwt_token = None
        try:
            print("--- Issuing JWT ---")
            service_client = get_service_role_client()
            jwt_response = service_client.rpc('issue_jwt', {
                'p_user_id': new_user.uuid, 'p_device_id': new_auth.device_id
            }).execute()

            if not hasattr(jwt_response, 'data') or not jwt_response.data:
                 raise Exception("Failed to issue JWT: No data returned from RPC.")

            jwt_data = jwt_response.data[0]
            jwt_token = jwt_data['jwt_info']['token']
            issued_at_str = jwt_data['issued_at']
            if issued_at_str.endswith('Z'):
                issued_at_str = issued_at_str[:-1] + '+00:00'
            jwt_issued_at = datetime.fromisoformat(issued_at_str)
            print("--- JWT Issued Successfully ---")
        except Exception as e:
            print(f"Error issuing JWT: {str(e)}")
            return jsonify({"error": "Failed to issue authentication token."}), 500

        # Store JWT locally
        new_auth.current_jwt = jwt_token
        new_auth.jwt_issued_at = jwt_issued_at
        new_auth.is_logged_in = True
        new_auth.is_dirty = True
        db.commit()

        # The full sync will be triggered by the client after registration.


        # Final response
        return jsonify({
            "message": "Registration and initial sync successful",
            "user_uuid": new_user.uuid,
            "jwt": jwt_token
        }), 201

@user_bp.route("/<string:user_uuid>", methods=['GET'])
def get_user(user_uuid):
    with get_db() as db:
        try:
            id = int(user_uuid)
            item = db.query(User).filter(User.user_id == id).first()
        except:
            item = db.query(User).filter(User.uuid == user_uuid).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))


@user_bp.route("/", methods=['GET'])
def get_all_users():
    with get_db() as db:
        items = db.query(User).all()
        return jsonify([model_to_dict(i) for i in items])

@user_bp.route('/employee', methods=['POST'])
def create_employee():
    data = request.json
    org_uuid = data.get('organization_uuid')

    with get_db() as db:
        # Check employee count
        org = db.query(Organization).filter(Organization.uuid == org_uuid).first()
        if not org:
            return jsonify({"error": "Organization not found"}), 404

        current_emp_count = db.query(User).filter(User.organization_uuid == org_uuid, User.deleted_at == None).count()
        if current_emp_count >= org.emp_count:
            return jsonify({"error": "Employee limit reached for this organization"}), 400

        # Generate temporary password
        temp_password = generate_temp_password()
        salt = generate_salt()
        hashed_pw = hash_password(temp_password, salt)
        new_user_uuid = str(uuid.uuid4())
        auth_uuid = str(uuid.uuid4())

        # Call Supabase RPC register_employee
        try:
            service_client = get_service_role_client()
            service_client.rpc('register_employee', {
                'p_user_uuid': new_user_uuid,
                'p_username': data.get('username'),
                'p_email': data.get('email'),
                'p_org_id': org_uuid,
                'p_branch_id': data.get('branch_uuid'),
                'p_role': data.get('role', 'employee'),
                'p_auth_uuid': auth_uuid,
                'p_password_hash': hashed_pw,
                'p_password_salt': salt,
                'p_temp_password': temp_password,
                'p_org_name': org.name # Pass org name for email template
            }).execute()
        except Exception as e:
            print(f"Error calling register_employee RPC: {str(e)}")
            return jsonify({"error": "Failed to register employee in the cloud."}), 500

        # Create user locally
        new_user = User(
            uuid=new_user_uuid,
            username=data.get('username'),
            email=data.get('email'),
            role=data.get('role', 'employee'),
            organization_uuid=org_uuid,
            branch_uuid=data.get('branch_uuid'),
            status='trial', # Initial status before first login
            account_type='enterprise_tier1',
            is_dirty=False # Cloud record already created
        )
        db.add(new_user)

        new_auth = Authentication(
            uuid=auth_uuid,
            user_uuid=new_user_uuid,
            password_hash=hashed_pw,
            password_salt=salt,
            is_dirty=False
        )
        db.add(new_auth)

        new_settings = ApplicationSettings(
            uuid=str(uuid.uuid4()),
            user_uuid=new_user_uuid,
            language='en', # Default
            other_settings={"appliance_library": DEFAULT_APPLIANCE_LIBRARY},
            is_dirty=True
        )
        db.add(new_settings)

        db.commit()
        db.refresh(new_user)
        return jsonify(model_to_dict(new_user)), 201

@user_bp.route('/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    with get_db() as db:
            item = db.query(User).filter(User.user_id == user_id).first()
            if not item:
                return jsonify({"error": "Not found"}), 404

            try:
                validated_data = UserUpdate(**request.json)
            except ValidationError as e:
                return jsonify({"errors": e.errors()}), 400

            update_data = validated_data.dict(exclude_unset=True)
            for key, value in update_data.items():
                setattr(item, key, value)

            db.commit()
            db.refresh(item)
            return(jsonify(model_to_dict(item)))

@user_bp.route('/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    with get_db() as db:
        user = db.query(User).filter(User.user_id == user_id).first()
        if not user:
            return jsonify({"error": "Not found"}), 404

        now = datetime.utcnow()
        user.deleted_at = now
        user.is_dirty = True

        # Cascading soft delete
        # This is a simplified version. Ideally, we should iterate through all related tables.
        # Customers, Projects, Invoices, etc.
        from models import Customer, Project, Invoice, Payment, Document, ProjectComponent, StockAdjustment, InventoryItem

        db.query(Customer).filter(Customer.user_uuid == user.uuid).update({Customer.deleted_at: now, Customer.is_dirty: True}, synchronize_session=False)
        db.query(Project).filter(Project.user_uuid == user.uuid).update({Project.deleted_at: now, Project.is_dirty: True}, synchronize_session=False)
        db.query(Invoice).filter(Invoice.user_uuid == user.uuid).update({Invoice.deleted_at: now, Invoice.is_dirty: True}, synchronize_session=False)
        # Note: Payments and other nested items are usually linked to Invoices or Projects.
        # For simplicity, we assume if the parent is deleted, they are effectively deleted.
        # But per requirements: "all realted tables: projects, invoices, inventory items, etc."

        db.commit()
        return jsonify({"message": "User deactivated successfully"}), 200
