from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db, get_by_id_or_uuid, generate_salt, hash_password, generate_temp_password, require_internet, verify_password
from models import User, Authentication, ApplicationSettings, Subscription, SubscriptionPayment, Organization, Branch, SyncLog
from schemas import UserCreate, UserUpdate
from auth_schemas import RegistrationPayload
from serializer import model_to_dict
from routes.sync_log import sync, upload_blob, trigger_immediate_sync, map_user_to_payload, generic_mapper
import base64
import uuid
from datetime import datetime, timedelta, timezone
from supabase_client import get_anon_client, get_service_role_client, get_user_client

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

@user_bp.route('/distributor-info', methods=['POST'])
def get_distributor_info():
    """
    Fetches distributor info by distributor_id from Supabase.
    """
    data = request.get_json()
    if not data or 'distributor_id' not in data:
        return jsonify({"error": "Distributor ID is required"}), 400

    distributor_id = data['distributor_id']

    # Validate UUID format:
    try:
        uuid.UUID(distributor_id)
    except (ValueError, AttributeError):
        return jsonify({"error": "Invalid distributor ID format"}), 400

    try:
        supabase = get_service_role_client()
        response = (
            supabase.table('distributors')
            .select('id, discount_percent')
            .eq('id', distributor_id)
            .execute()
        )

        if not hasattr(response, 'data') or not response.data:
            return jsonify({"error": "Distributor not found."}), 404

        distributor_data = response.data[0]

        return jsonify({
            "distributorId": str(distributor_data['id']),
            "discountPercent": distributor_data['discount_percent']
        }), 200

    except Exception as e:
        print(f"Error fetching distributor info: {e}")
        return jsonify({"error": "Failed to fetch distributor info"}), 500

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
        if payload.stage3 and payload.stage3.employees is not None:
            emp_count = payload.stage3.employees
        elif 'enterprise' in payload.account_type:
            # Unlimited for enterprise if not specified
            emp_count = 0
        else:
            emp_count = 1

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
        normalized_email = stage1.email.strip().lower()
        try:
            print("--- Calling register_user RPC ---")
            service_client = get_service_role_client()
            service_client.rpc('register_user', {
                'p_user_uuid': new_user_uuid, 'p_username': stage1.username, 'p_email': normalized_email,
                'p_auth_uuid': new_auth_uuid, 'p_password_hash': hashed_pw, 'p_password_salt': salt,
                'p_device_id': new_device_uuid, 'p_distributor_id': payload.distributor_id
            }).execute()
            print("--- register_user RPC Completed ---")
        except Exception as e:
            print(f"Error calling register_user RPC: {str(e)}")
            return jsonify({"error": "Failed to create user in the cloud using RPC."}), 500

        # Create local records
        new_user = User(
            uuid=new_user_uuid, username=stage1.username, email=normalized_email,
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

@user_bp.route("/<string:user_id_or_uuid>", methods=['GET'])
def get_user(user_id_or_uuid):
    with get_db() as db:
        item = get_by_id_or_uuid(db, User, User.user_id, User.uuid, user_id_or_uuid)
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))


@user_bp.route("/", methods=['GET'])
def get_all_users():
    with get_db() as db:
        auth_record = (
            db.query(Authentication)
            .filter(Authentication.is_logged_in == True)
            .order_by(Authentication.last_active.desc())
            .first()
        )
        if not auth_record:
            return jsonify({"error": "No authenticated user found. Please log in."}), 401

        current_user = db.query(User).filter(User.uuid == auth_record.user_uuid).first()
        if not current_user:
            return jsonify({"error": "Authenticated user not found in user table."}), 404

        if current_user.organization_uuid:
            items = (
                db.query(User)
                .filter(
                    User.organization_uuid == current_user.organization_uuid,
                    User.deleted_at == None
                )
                .all()
            )
            return jsonify([model_to_dict(i) for i in items])

        # Non-org users can only see themselves
        return jsonify([model_to_dict(current_user)])

@user_bp.route('/employee', methods=['POST'])
def create_employee():
    data = request.json

    with get_db() as db:
        # Resolve current user from active session
        auth_record = (
            db.query(Authentication)
            .filter(Authentication.is_logged_in == True)
            .order_by(Authentication.last_active.desc())
            .first()
        )
        if not auth_record:
            return jsonify({"error": "No authenticated user found. Please log in."}), 401

        current_user = db.query(User).filter(User.uuid == auth_record.user_uuid).first()
        if not current_user:
            return jsonify({"error": "Authenticated user not found in user table."}), 404

        if current_user.role != 'admin':
            return jsonify({"error": "Admin privileges required."}), 403

        org_uuid = current_user.organization_uuid
        if not org_uuid:
            return jsonify({"error": "Organization not found for current user."}), 404

        # Check employee count
        org = db.query(Organization).filter(Organization.uuid == org_uuid).first()
        if not org:
            return jsonify({"error": "Organization not found"}), 404

        current_emp_count = db.query(User).filter(User.organization_uuid == org_uuid, User.deleted_at is None).count()
        if org.emp_count and org.emp_count > 0 and current_emp_count >= org.emp_count:
            return jsonify({"error": "Employee limit reached for this organization"}), 400

        branch_uuid = data.get('branch_uuid')
        if branch_uuid:
            branch = db.query(Branch).filter(Branch.uuid == branch_uuid).first()
            if not branch or branch.organization_uuid != org_uuid or branch.deleted_at is not None:
                return jsonify({"error": "Invalid branch for this organization."}), 400

        role = data.get('role', 'employee')
        if role not in ['employee']:
            return jsonify({"error": "Invalid role."}), 400

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
                'p_branch_id': branch_uuid,
                'p_role': role,
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
            role=role,
            organization_uuid=org_uuid,
            branch_uuid=branch_uuid,
            status='trial', # Initial status before first login
            account_type=org.plan_type,
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

@user_bp.route('/<string:user_id_or_uuid>', methods=['PUT'])
def update_user(user_id_or_uuid):
    err, code = require_internet()
    if err:
        return err, code

    with get_db() as db:
            active_auth = (
                db.query(Authentication)
                .filter(Authentication.is_logged_in.is_(True))
                .order_by(Authentication.created_at.desc())
                .first()
            )
            if not active_auth:
                return jsonify({"error": "No active session found"}), 401

            actor_user = db.query(User).filter(User.uuid == active_auth.user_uuid).first()
            if not actor_user:
                return jsonify({"error": "User not found"}), 404


            item = get_by_id_or_uuid(db, User, User.user_id, User.uuid, user_id_or_uuid)
            if not item:
                return jsonify({"error": "Not found"}), 404

            if active_auth.user_uuid != item.uuid and actor_user.role != "admin":
                return jsonify({"error": "Forbidden"}), 403

            try:
                validated_data = UserUpdate(**request.json)
            except ValidationError as e:
                return jsonify({"errors": e.errors()}), 400

            update_data = validated_data.dict(exclude_unset=True)
            for key, value in update_data.items():
                setattr(item, key, value)

            # --- Supabase Direct Sync ---
            try:
                payload = map_user_to_payload(item)
                payload['is_dirty'] = False

                supabase = get_user_client()
                supabase.table('users').upsert(payload).execute()

                item.is_dirty = False
                db.commit()
                db.refresh(item)
                return(jsonify(model_to_dict(item)))
            except Exception as e:
                db.rollback()
                print(f"Error syncing user to Supabase: {str(e)}")
                return jsonify({"error": "Failed to sync changes to cloud."}), 500

@user_bp.route('/<string:user_id_or_uuid>', methods=['DELETE'])
def delete_user(user_id_or_uuid):
    data = request.get_json(silent=True) or {}
    password = (
        data.get('password')
        or data.get('current_password')
        or data.get('currentPassword')
    )
    if not password:
        return jsonify({"error": "password is required"}), 400

    with get_db() as db:
        active_auth = (
            db.query(Authentication)
            .filter(Authentication.is_logged_in.is_(True))
            .order_by(Authentication.created_at.desc())
            .first()
        )
        if not active_auth:
            return jsonify({"error": "No active session found"}), 401

        actor_user = db.query(User).filter(User.uuid == active_auth.user_uuid).first()
        if not actor_user:
            return jsonify({"error": "User not found"}), 404

        user = get_by_id_or_uuid(db, User, User.user_id, User.uuid, user_id_or_uuid)
        if not user:
            return jsonify({"error": "Not found"}), 404

        same_org_admin = (
            actor_user.role == "admin"
            and actor_user.organization_uuid is not None
            and actor_user.organization_uuid == user.organization_uuid
        )
        if active_auth.user_uuid != user.uuid and not same_org_admin:
            return jsonify({"error": "Forbidden"}), 403

        latest_auth = (
            db.query(Authentication)
            .filter(Authentication.user_uuid == active_auth.user_uuid)
            .order_by(Authentication.created_at.desc())
            .first()
        )
        if not latest_auth or not verify_password(password, latest_auth.password_salt, latest_auth.password_hash):
            return jsonify({"error": "Invalid password"}), 400

        now = datetime.utcnow()

        # Collect IDs for tables that don't have user_id columns in Supabase
        from models import (
            Customer,
            Project,
            Invoice,
            Payment,
            Document,
            ProjectComponent,
            StockAdjustment,
            InventoryItem,
            InventoryCategory,
            Appliance,
            SystemConfiguration,
        )

        project_uuids = [row[0] for row in db.query(Project.uuid).filter(Project.user_uuid == user.uuid).all()]
        invoice_uuids = [row[0] for row in db.query(Invoice.uuid).filter(Invoice.user_uuid == user.uuid).all()]
        subscription_uuids = [row[0] for row in db.query(Subscription.uuid).filter(Subscription.user_uuid == user.uuid).all()]
        system_config_uuids = [
            row[0]
            for row in db.query(Project.system_config_uuid)
            .filter(Project.user_uuid == user.uuid, Project.system_config_uuid.isnot(None))
            .distinct()
            .all()
        ]

        org_uuid = user.organization_uuid if user.organization_uuid and user.role == "admin" else None
        org_branch_uuids = []
        org_employee_uuids = []
        if org_uuid:
            org_branch_uuids = [
                row[0] for row in db.query(Branch.uuid).filter(Branch.organization_uuid == org_uuid).all()
            ]
            org_employee_uuids = [
                row[0]
                for row in db.query(User.uuid)
                .filter(
                    User.organization_uuid == org_uuid,
                    User.role == "employee",
                    User.uuid != user.uuid,
                )
                .all()
            ]

        # --- Local soft delete cascade (mark dirty for sync) ---
        user.deleted_at = now
        user.is_dirty = True

        if org_uuid:
            db.query(Organization).filter(Organization.uuid == org_uuid).update(
                {Organization.deleted_at: now, Organization.is_dirty: True},
                synchronize_session=False,
            )
            db.query(Branch).filter(Branch.organization_uuid == org_uuid).update(
                {Branch.deleted_at: now, Branch.is_dirty: True},
                synchronize_session=False,
            )

            if org_employee_uuids:
                employee_project_uuids = [
                    row[0] for row in db.query(Project.uuid).filter(Project.user_uuid.in_(org_employee_uuids)).all()
                ]
                employee_invoice_uuids = [
                    row[0] for row in db.query(Invoice.uuid).filter(Invoice.user_uuid.in_(org_employee_uuids)).all()
                ]
                employee_subscription_uuids = [
                    row[0]
                    for row in db.query(Subscription.uuid)
                    .filter(Subscription.user_uuid.in_(org_employee_uuids))
                    .all()
                ]
                employee_system_config_uuids = [
                    row[0]
                    for row in db.query(Project.system_config_uuid)
                    .filter(Project.user_uuid.in_(org_employee_uuids), Project.system_config_uuid.isnot(None))
                    .distinct()
                    .all()
                ]

                db.query(User).filter(User.uuid.in_(org_employee_uuids)).update(
                    {User.deleted_at: now, User.is_dirty: True},
                    synchronize_session=False,
                )
                db.query(Authentication).filter(Authentication.user_uuid.in_(org_employee_uuids)).update(
                    {
                        Authentication.deleted_at: now,
                        Authentication.is_logged_in: False,
                        Authentication.current_jwt: None,
                        Authentication.jwt_issued_at: None,
                        Authentication.is_dirty: True,
                    },
                    synchronize_session=False,
                )
                db.query(ApplicationSettings).filter(ApplicationSettings.user_uuid.in_(org_employee_uuids)).update(
                    {ApplicationSettings.deleted_at: now, ApplicationSettings.is_dirty: True},
                    synchronize_session=False,
                )
                db.query(SyncLog).filter(SyncLog.user_uuid.in_(org_employee_uuids)).update(
                    {SyncLog.deleted_at: now, SyncLog.is_dirty: True},
                    synchronize_session=False,
                )

                db.query(Customer).filter(Customer.user_uuid.in_(org_employee_uuids)).update(
                    {Customer.deleted_at: now, Customer.is_dirty: True},
                    synchronize_session=False,
                )
                db.query(Project).filter(Project.user_uuid.in_(org_employee_uuids)).update(
                    {Project.deleted_at: now, Project.is_dirty: True},
                    synchronize_session=False,
                )
                db.query(Invoice).filter(Invoice.user_uuid.in_(org_employee_uuids)).update(
                    {Invoice.deleted_at: now, Invoice.is_dirty: True},
                    synchronize_session=False,
                )
                db.query(Subscription).filter(Subscription.user_uuid.in_(org_employee_uuids)).update(
                    {Subscription.deleted_at: now, Subscription.is_dirty: True},
                    synchronize_session=False,
                )
                db.query(InventoryCategory).filter(InventoryCategory.user_uuid.in_(org_employee_uuids)).update(
                    {InventoryCategory.deleted_at: now, InventoryCategory.is_dirty: True},
                    synchronize_session=False,
                )
                db.query(InventoryItem).filter(InventoryItem.user_uuid.in_(org_employee_uuids)).update(
                    {InventoryItem.deleted_at: now, InventoryItem.is_dirty: True},
                    synchronize_session=False,
                )
                db.query(StockAdjustment).filter(StockAdjustment.user_uuid.in_(org_employee_uuids)).update(
                    {StockAdjustment.deleted_at: now, StockAdjustment.is_dirty: True},
                    synchronize_session=False,
                )

                if employee_project_uuids:
                    db.query(Appliance).filter(Appliance.project_uuid.in_(employee_project_uuids)).update(
                        {Appliance.deleted_at: now, Appliance.is_dirty: True},
                        synchronize_session=False,
                    )
                    db.query(Document).filter(Document.project_uuid.in_(employee_project_uuids)).update(
                        {Document.deleted_at: now, Document.is_dirty: True},
                        synchronize_session=False,
                    )
                    db.query(ProjectComponent).filter(ProjectComponent.project_uuid.in_(employee_project_uuids)).update(
                        {ProjectComponent.deleted_at: now, ProjectComponent.is_dirty: True},
                        synchronize_session=False,
                    )
                if employee_invoice_uuids:
                    db.query(Payment).filter(Payment.invoice_uuid.in_(employee_invoice_uuids)).update(
                        {Payment.deleted_at: now, Payment.is_dirty: True},
                        synchronize_session=False,
                    )
                if employee_subscription_uuids:
                    db.query(SubscriptionPayment).filter(
                        SubscriptionPayment.subscription_uuid.in_(employee_subscription_uuids)
                    ).update(
                        {SubscriptionPayment.deleted_at: now, SubscriptionPayment.is_dirty: True},
                        synchronize_session=False,
                    )
                if employee_system_config_uuids:
                    db.query(SystemConfiguration).filter(SystemConfiguration.uuid.in_(employee_system_config_uuids)).update(
                        {SystemConfiguration.deleted_at: now, SystemConfiguration.is_dirty: True},
                        synchronize_session=False,
                    )

            if org_branch_uuids:
                db.query(Customer).filter(Customer.branch_uuid.in_(org_branch_uuids)).update(
                    {Customer.deleted_at: now, Customer.is_dirty: True},
                    synchronize_session=False,
                )
                db.query(Project).filter(Project.branch_uuid.in_(org_branch_uuids)).update(
                    {Project.deleted_at: now, Project.is_dirty: True},
                    synchronize_session=False,
                )
                db.query(InventoryItem).filter(InventoryItem.branch_uuid.in_(org_branch_uuids)).update(
                    {InventoryItem.deleted_at: now, InventoryItem.is_dirty: True},
                    synchronize_session=False,
                )
                db.query(StockAdjustment).filter(StockAdjustment.branch_uuid.in_(org_branch_uuids)).update(
                    {StockAdjustment.deleted_at: now, StockAdjustment.is_dirty: True},
                    synchronize_session=False,
                )

        db.query(Authentication).filter(Authentication.user_uuid == user.uuid).update(
            {
                Authentication.deleted_at: now,
                Authentication.is_logged_in: False,
                Authentication.current_jwt: None,
                Authentication.jwt_issued_at: None,
                Authentication.is_dirty: True,
            },
            synchronize_session=False,
        )
        db.query(ApplicationSettings).filter(ApplicationSettings.user_uuid == user.uuid).update(
            {ApplicationSettings.deleted_at: now, ApplicationSettings.is_dirty: True},
            synchronize_session=False,
        )
        db.query(SyncLog).filter(SyncLog.user_uuid == user.uuid).update(
            {SyncLog.deleted_at: now, SyncLog.is_dirty: True},
            synchronize_session=False,
        )

        db.query(Customer).filter(Customer.user_uuid == user.uuid).update(
            {Customer.deleted_at: now, Customer.is_dirty: True},
            synchronize_session=False,
        )
        db.query(Project).filter(Project.user_uuid == user.uuid).update(
            {Project.deleted_at: now, Project.is_dirty: True},
            synchronize_session=False,
        )
        db.query(Invoice).filter(Invoice.user_uuid == user.uuid).update(
            {Invoice.deleted_at: now, Invoice.is_dirty: True},
            synchronize_session=False,
        )
        db.query(Subscription).filter(Subscription.user_uuid == user.uuid).update(
            {Subscription.deleted_at: now, Subscription.is_dirty: True},
            synchronize_session=False,
        )

        db.query(InventoryCategory).filter(InventoryCategory.user_uuid == user.uuid).update(
            {InventoryCategory.deleted_at: now, InventoryCategory.is_dirty: True},
            synchronize_session=False,
        )
        db.query(InventoryItem).filter(InventoryItem.user_uuid == user.uuid).update(
            {InventoryItem.deleted_at: now, InventoryItem.is_dirty: True},
            synchronize_session=False,
        )
        db.query(StockAdjustment).filter(StockAdjustment.user_uuid == user.uuid).update(
            {StockAdjustment.deleted_at: now, StockAdjustment.is_dirty: True},
            synchronize_session=False,
        )

        # Indirect relations
        if project_uuids:
            db.query(Appliance).filter(Appliance.project_uuid.in_(project_uuids)).update(
                {Appliance.deleted_at: now, Appliance.is_dirty: True},
                synchronize_session=False,
            )
            db.query(Document).filter(Document.project_uuid.in_(project_uuids)).update(
                {Document.deleted_at: now, Document.is_dirty: True},
                synchronize_session=False,
            )
            db.query(ProjectComponent).filter(ProjectComponent.project_uuid.in_(project_uuids)).update(
                {ProjectComponent.deleted_at: now, ProjectComponent.is_dirty: True},
                synchronize_session=False,
            )
        if invoice_uuids:
            db.query(Payment).filter(Payment.invoice_uuid.in_(invoice_uuids)).update(
                {Payment.deleted_at: now, Payment.is_dirty: True},
                synchronize_session=False,
            )
        if subscription_uuids:
            db.query(SubscriptionPayment).filter(SubscriptionPayment.subscription_uuid.in_(subscription_uuids)).update(
                {SubscriptionPayment.deleted_at: now, SubscriptionPayment.is_dirty: True},
                synchronize_session=False,
            )
        if system_config_uuids:
            db.query(SystemConfiguration).filter(SystemConfiguration.uuid.in_(system_config_uuids)).update(
                {SystemConfiguration.deleted_at: now, SystemConfiguration.is_dirty: True},
                synchronize_session=False,
            )

        # Commit local changes first; remote syncing is handled by the existing sync pipeline.
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"Error deactivating user locally: {str(e)}")
            return jsonify({"error": "Failed to deactivate user."}), 500

        # Collect user and organization details for the RPC call (notifications only).
        organization_name_if_exists = None
        if user.organization_uuid:
            org = db.query(Organization).filter(Organization.uuid == user.organization_uuid).first()
            if org:
                organization_name_if_exists = org.name

        # Call the Supabase RPC for notifications (best-effort).
        supabase_service_client = get_service_role_client()  # Use service client for RPC
        try:
            supabase_service_client.rpc(
                'deactivate_account',
                {
                    'p_user_id': user.uuid,
                    'p_actor_user_id': actor_user.uuid,
                    'p_user_email': user.email,
                    'p_username': user.username,
                    'p_account_type': user.account_type,
                    'p_role': user.role,
                    'p_organization_id': user.organization_uuid,
                    'p_organization_name': organization_name_if_exists,
                    'p_distributor_id': user.distributor_id,
                },
            ).execute()
        except Exception as e:
            print(f"Warning: Failed to create deactivation notification job in Supabase: {e}")
            # Log error but do not prevent user deactivation from completing.

        return jsonify({"message": "User deactivated successfully"}), 200
