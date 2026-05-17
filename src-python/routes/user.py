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
    normalized_email = stage1.email.strip().lower()

    with get_db() as db:
        # --- 1. RESUME CHECK ---
        # Check if user already exists locally
        existing_user = db.query(User).filter(User.email == normalized_email).first()
        existing_auth = db.query(Authentication).filter(Authentication.user_uuid == existing_user.uuid).first() if existing_user else None

        # If they exist and have a JWT, they are already fully registered
        if existing_auth and existing_auth.current_jwt:
            return jsonify({
                "message": "User already registered",
                "user_uuid": existing_user.uuid,
                "jwt": existing_auth.current_jwt
            }), 200

        # --- 2. IDEMPOTENT UUID GENERATION ---
        # If resuming, use existing UUIDs. If new, generate them.
        new_user_uuid = existing_user.uuid if existing_user else str(uuid.uuid4())
        new_auth_uuid = existing_auth.uuid if existing_auth else str(uuid.uuid4())

        # Salt and Hashing (Only if new or needing reset)
        # Reuse existing credentials on resume; generate fresh ones for new registrations.
        if existing_auth:
            salt = existing_auth.password_salt
            hashed_pw = existing_auth.password_hash
        else:
            salt = generate_salt()
            hashed_pw = hash_password(stage1.password, salt)
        device_id = str(uuid.uuid4())

        # --- 3. CLOUD ORG REGISTRATION (IDEMPOTENT) ---
        new_org_uuid = existing_user.organization_uuid if existing_user else None
        new_branch_uuid = existing_user.branch_uuid if existing_user else None

        if 'enterprise' in payload.account_type and not new_org_uuid:
            branch_name = "HQ" if payload.language == 'en' else "الفرع الرئيسي"
            try:
                service_client = get_service_role_client()
                response = service_client.rpc('register_organization', {
                    'p_org_name': payload.stage4.businessName,
                    'p_plan_type': payload.account_type,
                    'p_branch_name': branch_name
                }).execute()

                org_data = response.data
                new_org_uuid = org_data['organization_id']
                new_branch_uuid = org_data['branch_id']
            except Exception as e:
                # If error contains "already exists", fetch the existing IDs
                if "already exists" in str(e).lower():
                    try:
                        supabase = get_service_role_client()
                        o_response = (
                            supabase.table('organizations')
                            .select('id')
                            .eq('name', payload.stage4.businessName)
                            .execute()
                            )

                        if not hasattr(o_response, 'data'):
                            raise Exception("Invalid response structure from Supabase client.")

                        if not o_response.data:
                            raise Exception("Organization not found.")
                        new_org_uuid = o_response.data[0]['id']

                        b_response = (
                            supabase.table('branches')
                            .select('id')
                            .eq('organization_id', new_org_uuid)
                            .execute()
                            )

                        if not hasattr(b_response, 'data'):
                            raise Exception("Invalid response structure from Supabase client.")

                        if not b_response.data:
                            raise Exception("Branch not found.")
                        new_branch_uuid = b_response.data[0]['id']



                    except Exception as e:
                        return jsonify({"error": "Cloud Org creation failed"}), 500

                return jsonify({"error": "Cloud Org creation failed"}), 500

        # --- 4. CLOUD USER REGISTRATION (IDEMPOTENT) ---
        try:
            service_client = get_service_role_client()
            service_client.rpc('register_user', {
                'p_user_uuid': new_user_uuid, 'p_username': stage1.username, 'p_email': normalized_email,
                'p_auth_uuid': new_auth_uuid, 'p_password_hash': hashed_pw, 'p_password_salt': salt,
                'p_device_id': device_id, 'p_distributor_id': payload.distributor_id
            }).execute()
        except Exception as e:
            # If the cloud says user exists, we proceed. If it's a different error, we stop.
            if "already exists" not in str(e).lower():
                print(f"Cloud Reg Error: {e}")
                return jsonify({"error": "Cloud User creation failed"}), 500

        # --- 5. LOCAL RECORD SYNC ---
        # Use merge() instead of add() to update existing partial records without crashing
        user_status = 'trial' if payload.plan_type == "trial" else "active"

        new_user = User(
            uuid=new_user_uuid, username=stage1.username, email=normalized_email,
            business_name=payload.stage4.businessName, account_type=payload.account_type,
            organization_uuid=new_org_uuid, branch_uuid=new_branch_uuid,
            status=user_status, is_dirty=False
        )
        db.merge(new_user)

        new_auth = Authentication(
            uuid=new_auth_uuid, user_uuid=new_user_uuid, password_hash=hashed_pw,
            password_salt=salt, is_dirty=False
        )
        db.merge(new_auth)

        # ... (Merge Subscription and Settings similarly) ...
        db.commit()

        # --- 6. JWT ISSUANCE (ALWAYS RETRYABLE) ---
        try:
            service_client = get_service_role_client()
            jwt_response = service_client.rpc('issue_jwt', {
                'p_user_id': new_user_uuid, 'p_device_id': device_id
            }).execute()

            jwt_data = jwt_response.data[0]
            jwt_token = jwt_data['jwt_info']['token']

            # Finalize the specific auth row we just persisted.
            local_auth = db.query(Authentication).filter(Authentication.uuid == new_auth_uuid).first()
            if local_auth is None:
                return jsonify({"error": "Local auth record missing after registration."}), 500
            local_auth.current_jwt = jwt_token
            local_auth.is_logged_in = True
            db.commit()
        except Exception as e:
            return jsonify({"error": "Failed to issue token. Please try again."}), 500

        return jsonify({
            "message": "Registration successful",
            "user_uuid": new_user_uuid,
            "jwt": jwt_token
        }), 201

@user_bp.route('/check-tc-status', methods=['POST'])
def check_tc_status():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid request body"}), 400
    user_id = data.get('user_uuid')

    if not user_id:
        return jsonify({"error": "user_id is required"}), 400

    with get_db() as db:
        auth_record = db.query(Authentication).filter(Authentication.is_logged_in == True).order_by(Authentication.last_active.desc()).first()
        if not auth_record:
            return jsonify({"error": "Unauthorized"}), 401

        elif user_id != auth_record.user_uuid:
            return jsonify({"error": "Unauthorized"}), 401

    try:
        service_client = get_service_role_client()
        response = service_client.rpc('check_user_tc_status', {'p_user_id': user_id}).execute()

        if not response.data:
            return jsonify({"error": "Failed to fetch TC status"}), 500

        # RPC returns a list of one object
        result = response.data[0]
        return jsonify(result), 200
    except Exception as e:
        print(f"Error checking TC status")
        return jsonify({"error": str(e)}), 500

@user_bp.route('/record-tc-agreement', methods=['POST'])
def record_tc_agreement():
    data = request.get_json()
    tc_id = data.get('tc_id')
    if not tc_id:
        return jsonify({"error": "tc_id is required"}), 400

    with get_db() as db:
        auth_record = db.query(Authentication).filter(Authentication.is_logged_in == True).order_by(Authentication.last_active.desc()).first()
        if not auth_record:
            return jsonify({"error": "Unauthorized"}), 401

        user_uuid = auth_record.user_uuid

        try:
            service_client = get_service_role_client()
            service_client.table('user_tc_agreements').upsert({
                'user_id': user_uuid,
                'tc_id': tc_id,
                'agreed_at': datetime.now(timezone.utc).isoformat()
            }).execute()

            return jsonify({"message": "Agreement recorded"}), 200
        except Exception as e:
            print(f"Error recording TC agreement: {e}")
            return jsonify({"error": str(e)}), 500

@user_bp.route('/contact-sales', methods=['POST'])
def contact_sales():
    err, code = require_internet()
    if err:
        return err, code

    data = request.get_json() or {}
    enterprise_name = data.get('enterprise_name' or '').strip()
    location = data.get('location')
    email = data.get('email' or '').strip().lower()
    phone = data.get('phone' or '').strip()
    meeting_preference = data.get('meeting_preference')
    body = data.get('body')

    if not enterprise_name or not email or not phone:
        return jsonify({"error": "Enterprise name, email, and phone are required"}), 400

    try:
        service_client = get_service_role_client()
        service_client.rpc('tier2_ticket', {
            'p_enterprise_name': enterprise_name,
            'p_location': location,
            'p_email': email,
            'p_phone': phone,
            'p_meeting_preference': meeting_preference,
            'p_body': body
        }).execute()

        return jsonify({"message": "Sales request submitted successfully"}), 200
    except Exception as e:
        print(f"Error submitting sales request: {e}")
        if "required" in str(e).lower():
            return jsonify({"error": e}), 400
        return jsonify({"error": "Failed to submit sales request. Please try again later."}), 500


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

        if current_user.status in ['trial', 'grace', 'expired']:
            return jsonify({"error": f"Action restricted for {current_user.status} accounts. Please renew your subscription."}), 403

        if current_user.role != 'admin':
            return jsonify({"error": "Admin privileges required."}), 403

        org_uuid = current_user.organization_uuid
        if not org_uuid:
            return jsonify({"error": "Organization not found for current user."}), 404

        # Check employee count
        org = db.query(Organization).filter(Organization.uuid == org_uuid).first()
        if not org:
            return jsonify({"error": "Organization not found"}), 404

        current_emp_count = db.query(User).filter(User.organization_uuid == org_uuid, User.deleted_at.is_(None)).count()
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

        # Call Supabase RPC register_employee
        try:
            service_client = get_service_role_client()
            rpc_res = service_client.rpc('register_employee', {
                'p_user_uuid': new_user_uuid,
                'p_username': data.get('username'),
                'p_email': data.get('email'),
                'p_org_id': org_uuid,
                'p_branch_id': branch_uuid,
                'p_role': role,
                'p_password_hash': hashed_pw,
                'p_password_salt': salt,
                'p_temp_password': temp_password,
                'p_org_name': org.name # Pass org name for email template
            }).execute()

            # register_employee now returns: { user_id, auth_created, auth_id }
            result = getattr(rpc_res, "data", None)
            if not isinstance(result, dict) or result.get("user_id") != new_user_uuid:
                raise Exception(f"Unexpected register_employee response: {result}")
            if result.get("auth_created") is not True or not result.get("auth_id"):
                raise Exception(f"Employee auth record not created: {result}")
        except Exception as e:
            print(f"Error calling register_employee RPC: {str(e)}")
            return jsonify({"error": "Failed to register employee in the cloud."}), 500

        return jsonify({"status": "Success", "user_id": new_user_uuid}), 201

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

            # 1. Use model_dump for Pydantic v2 (or keep .dict() if strictly on v1)
            update_data = validated_data.model_dump(exclude_unset=True)

            # 2. Map string keys to actual SQLAlchemy column objects using getattr
            update_payload = {
                getattr(User, key): value for key, value in update_data.items()
            }

            # 3. Execute the bulk update safely
            db.query(User).filter(User.uuid == item.uuid).update(
                update_payload,
                synchronize_session=False,
            )

            db.flush()
            db.refresh(item)

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
