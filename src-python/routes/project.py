from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from sqlalchemy.orm import joinedload
from sqlalchemy import or_
from datetime import datetime
from utils import get_db, get_by_id_or_uuid
from models import Project, Customer, User, Authentication, SystemConfiguration, Appliance, Invoice, Payment, Document
from schemas import ProjectCreate, ProjectUpdate, ProjectWithCustomerCreate, ProjectDetailsUpdate, ProjectStatusUpdate
from serializer import model_to_dict
from authz import get_current_user

project_bp = Blueprint('project_bp', __name__, url_prefix='/projects')


def _get_project_invoice(db, project_uuid: str) -> Invoice | None:
    # Invoice.project_uuid is unique, so at most one.
    return (
        db.query(Invoice)
        .filter(Invoice.project_uuid == project_uuid, Invoice.deleted_at.is_(None))
        .first()
    )


def _can_view_project(ctx, project: Project, invoice: Invoice | None) -> tuple[bool, str]:
    """
    Returns (can_view, mode) where mode is "full" or "view".
    """
    if not ctx.org_uuid:
        return (project.user_uuid == ctx.user_uuid, "full")

    if project.organization_uuid != ctx.org_uuid:
        return (False, "hidden")

    inv_issued = bool(invoice and invoice.issued_at)

    if ctx.is_admin:
        if project.branch_uuid == ctx.branch_uuid:
            return (True, "full")
        return (inv_issued, "view" if inv_issued else "hidden")

    # Employee / normal org users are branch-scoped.
    if project.branch_uuid != ctx.branch_uuid:
        return (False, "hidden")
    if project.user_uuid == ctx.user_uuid:
        return (True, "full")
    return (inv_issued, "view" if inv_issued else "hidden")


def _can_mutate_project(ctx, project: Project) -> bool:
    if not ctx.org_uuid:
        return project.user_uuid == ctx.user_uuid

    if project.organization_uuid != ctx.org_uuid:
        return False
    if ctx.is_admin:
        return project.branch_uuid == ctx.branch_uuid
    return project.user_uuid == ctx.user_uuid

@project_bp.route('/create_with_customer', methods=['POST'])
def create_project_with_customer():
    with get_db() as db:
        auth_record = db.query(Authentication).filter(Authentication.is_logged_in == True).order_by(Authentication.last_active.desc()).first()
        if not auth_record:
            return jsonify({"error": "No authenticated user found. Please log in."}), 401

        current_user = db.query(User).filter(User.uuid == auth_record.user_uuid).first()
        if not current_user:
            return jsonify({"error": "Authenticated user not found in user table."}), 404

        try:
            data = ProjectWithCustomerCreate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        try:

            if not data.customer_uuid:
                # 1. Create Customer
                customer = Customer(
                    full_name=data.customer_name,
                    phone_number=data.phone_number,
                    email=data.email,
                    user_uuid=current_user.uuid,
                    organization_uuid=current_user.organization_uuid,
                    branch_uuid=current_user.branch_uuid,
                    is_dirty=True
                )
                db.add(customer)
                db.flush()

            else:
                customer_q = db.query(Customer).filter(Customer.uuid == data.customer_uuid)
                if current_user.organization_uuid:
                    customer_q = customer_q.filter(
                        Customer.organization_uuid == current_user.organization_uuid
                    )
                else:
                    customer_q = customer_q.filter(Customer.user_uuid == current_user.uuid)
                customer = customer_q.first()
                if not customer:
                    return jsonify({"error": "Customer not found or not accessible"}), 404

            # 2. Create Project and link to Customer
            new_project = Project(
                customer_uuid=customer.uuid,
                status='planning',
                project_location=data.project_location,
                user_uuid=current_user.uuid,
                organization_uuid=current_user.organization_uuid,
                branch_uuid=current_user.branch_uuid,
                is_dirty=True
            )
            db.add(new_project)
            db.flush()

            # 3. Create SystemConfiguration if provided
            if data.system_config:
                from models import SystemConfiguration
                new_config = SystemConfiguration(
                    config_items=data.system_config,
                    total_wattage=data.system_config.get("metadata", {}).get("total_peak_power_w", 0),
                    is_dirty=True
                )
                db.add(new_config)
                db.flush()
                new_project.system_config_uuid = new_config.uuid

            # 4. Create Appliances if provided
            if data.appliances:
                from models import Appliance
                for app_data in data.appliances:
                    new_appliance = Appliance(
                        project_uuid=new_project.uuid,
                        appliance_name=app_data.get('appliance_name'),
                        wattage=app_data.get('wattage'),
                        qty=app_data.get('qty'),
                        use_hours_night=app_data.get('use_hours_night'),
                        type=app_data.get('type'),
                        is_dirty=True
                    )
                    db.add(new_appliance)

            db.commit()

            # 5. Re-fetch the project with all relationships loaded for a complete response
            final_project = db.query(Project).options(
                joinedload(Project.customer),
                joinedload(Project.system_config),
                joinedload(Project.appliances)
            ).filter(Project.uuid == new_project.uuid).one()

            # 6. Serialize the complete project object to a dictionary
            project_dict = model_to_dict(final_project)
            if final_project.customer:
                project_dict['customer'] = model_to_dict(final_project.customer)
            if final_project.system_config:
                project_dict['system_config'] = model_to_dict(final_project.system_config)
            if final_project.appliances:
                project_dict['appliances'] = [model_to_dict(app) for app in final_project.appliances]

            return jsonify(project_dict), 201

        except Exception as e:
            db.rollback()
            import logging
            logging.exception("Error during project creation with customer")
            return jsonify({"error": f"An internal error occurred: {str(e)}"}), 500


@project_bp.route('/', methods=['POST'])
def create_project():
    try:
        # Validate request data using the Pydantic schema
        validated_data = ProjectCreate(**request.json)
    except ValidationError as e:
        # Return a 400 Bad Request with validation errors
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        # Create the SQLAlchemy model from validated data
        new_item = Project(**validated_data.dict())
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return jsonify(model_to_dict(new_item)), 201

@project_bp.route('/<string:item_id>', methods=['PUT'])
def update_project(item_id):
    with get_db() as db:
        item = get_by_id_or_uuid(db, Project, Project.project_id, Project.uuid, item_id)
        if not item:
            return jsonify({"error": "Not found"}), 404

        try:
            # Validate request data
            validated_data = ProjectUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        # Use exclude_unset=True to only update fields that were actually provided
        update_data = validated_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)

        db.commit()
        db.refresh(item)
        return jsonify(model_to_dict(item))

@project_bp.route('/', methods=['GET'])
def get_all_project():
    with get_db() as db:
        ctx, error_response = get_current_user(db)
        if error_response:
            return error_response

        # Build query to include branch peer projects only when invoice is issued.
        q = (
            db.query(Project)
            .options(joinedload(Project.customer), joinedload(Project.user), joinedload(Project.invoices))
            .outerjoin(Invoice, Invoice.project_uuid == Project.uuid)
        )

        if ctx.org_uuid:
            q = q.filter(Project.organization_uuid == ctx.org_uuid)

            if ctx.is_admin:
                # Same-branch: full; other branches: only issued-invoice projects.
                q = q.filter(
                    or_(Project.branch_uuid == ctx.branch_uuid, Invoice.issued_at.isnot(None))
                )
            else:
                # Employee: branch-only, include others only if invoice is issued.
                q = q.filter(Project.branch_uuid == ctx.branch_uuid).filter(
                    or_(Project.user_uuid == ctx.user_uuid, Invoice.issued_at.isnot(None))
                )
        else:
            q = q.filter(Project.user_uuid == ctx.user_uuid)

        items = q.order_by(Project.created_at.desc()).all()
        results = []
        for p in items:
            project_dict = model_to_dict(p)
            if p.customer:
                project_dict['customer'] = model_to_dict(p.customer)
            else:
                project_dict['customer'] = None

            # Attach invoice-issued info and access mode for UI guards.
            inv = next((x for x in (p.invoices or []) if x.deleted_at is None), None)
            issued_at = inv.issued_at.isoformat() if inv and inv.issued_at else None
            project_dict["invoice_issued_at"] = issued_at

            # Determine mode: view-only when not owned and invoice is issued.
            mode = "full"
            if ctx.org_uuid:
                if ctx.is_admin:
                    if p.branch_uuid != ctx.branch_uuid:
                        mode = "view"
                else:
                    if p.user_uuid != ctx.user_uuid:
                        mode = "view"
            project_dict["access"] = {"mode": mode}
            project_dict["owner_username"] = p.user.username if getattr(p, "user", None) else None
            results.append(project_dict)
        return jsonify(results)

@project_bp.route('/uuid/<string:uuid>', methods=['GET'])
def get_project_by_uuid(uuid):
    with get_db() as db:
        ctx, error_response = get_current_user(db)
        if error_response:
            return error_response

        item = db.query(Project).options(joinedload(Project.customer), joinedload(Project.user)).filter(Project.uuid == uuid, Project.deleted_at.is_(None)).first()
        if not item:
            return jsonify({"error": "Not found"}), 404

        invoice = _get_project_invoice(db, item.uuid)
        can_view, mode = _can_view_project(ctx, item, invoice)
        if not can_view:
            return jsonify({"error": "Not found"}), 404

        d = model_to_dict(item)
        d["customer"] = model_to_dict(item.customer) if item.customer else None
        d["invoice_issued_at"] = invoice.issued_at.isoformat() if invoice and invoice.issued_at else None
        d["access"] = {"mode": mode}
        d["owner_username"] = item.user.username if item.user else None
        return jsonify(d)

@project_bp.route('/<string:item_id>', methods=['GET'])
def get_project(item_id):
    with get_db() as db:
        ctx, error_response = get_current_user(db)
        if error_response:
            return error_response

        item = get_by_id_or_uuid(db, Project, Project.project_id, Project.uuid, item_id)
        if not item:
            return jsonify({"error": "Not found"}), 404

        invoice = _get_project_invoice(db, item.uuid)
        can_view, mode = _can_view_project(ctx, item, invoice)
        if not can_view:
            return jsonify({"error": "Not found"}), 404

        d = model_to_dict(item)
        d["customer"] = model_to_dict(item.customer) if item.customer else None
        d["invoice_issued_at"] = invoice.issued_at.isoformat() if invoice and invoice.issued_at else None
        d["access"] = {"mode": mode}
        d["owner_username"] = item.user.username if item.user else None
        return jsonify(d)

@project_bp.route('/<string:project_id_or_uuid>', methods=['DELETE'])
def delete_project(project_id_or_uuid):
    with get_db() as db:
        ctx, error_response = get_current_user(db)
        if error_response:
            return error_response

        project = get_by_id_or_uuid(db, Project, Project.project_id, Project.uuid, project_id_or_uuid)
        if not project:
            return jsonify({"error": "Project not found"}), 404
        if not _can_mutate_project(ctx, project):
            return jsonify({"error": "Forbidden"}), 403

        project.deleted_at = datetime.utcnow()
        project.is_dirty = True
        try:
            db.commit()
            return jsonify({"message": "Project moved to trash", "deleted_at": project.deleted_at.isoformat()}), 200
        except Exception as e:
            db.rollback()
            return jsonify({"error": f"Database error: {str(e)}"}), 500

@project_bp.route('/<string:project_id_or_uuid>/recover', methods=['PATCH'])
def recover_project(project_id_or_uuid):
    with get_db() as db:
        ctx, error_response = get_current_user(db)
        if error_response:
            return error_response

        project = get_by_id_or_uuid(db, Project, Project.project_id, Project.uuid, project_id_or_uuid)
        if not project:
            return jsonify({"message": "Project is not found"}), 404
        if not _can_mutate_project(ctx, project):
            return jsonify({"error": "Forbidden"}), 403

        project.deleted_at = None
        project.is_dirty = True
        try:
            db.commit()
            return jsonify({"message": "Project recovered successfully"}), 200
        except Exception as e:
            db.rollback()
            return jsonify({"error": f"Database error: {str(e)}"}), 500

@project_bp.route('/<string:project_id_or_uuid>/permanent', methods=['DELETE'])
def delete_project_permanently(project_id_or_uuid):
    with get_db() as db:
        try:
            ctx, error_response = get_current_user(db)
            if error_response:
                return error_response

            # 1. Find the project and eager load its children
            try:
                numeric_id = int(project_id_or_uuid)
                project_filter = Project.project_id == numeric_id
            except (TypeError, ValueError):
                project_filter = Project.uuid == project_id_or_uuid

            project = db.query(Project).options(
                joinedload(Project.invoices).joinedload(Invoice.payments),
                joinedload(Project.appliances),
                joinedload(Project.documents),
                joinedload(Project.system_config)
            ).filter(project_filter).first()

            if not project:
                return jsonify({"error": "Project not found"}), 404
            if not _can_mutate_project(ctx, project):
                return jsonify({"error": "Forbidden"}), 403

            # 2. Delete related objects manually as cascades are not defined in the model
            for invoice in project.invoices:
                for payment in invoice.payments:
                    db.delete(payment)
                db.delete(invoice)

            for appliance in project.appliances:
                db.delete(appliance)

            for document in project.documents:
                db.delete(document)

            if project.system_config:
                db.delete(project.system_config)

            # 3. Delete the project itself
            db.delete(project)

            db.commit()

            return jsonify({"message": "Project and its related data have been permanently deleted."}), 200

        except Exception as e:
            db.rollback()
            import logging
            logging.exception(f"Error during permanent deletion of project {project_id_or_uuid}")
            return jsonify({"error": f"An internal error occurred: {str(e)}"}), 500

@project_bp.route('/<string:project_id_or_uuid>', methods=['PATCH'])
def patch_project_details(project_id_or_uuid):
    with get_db() as db:
        ctx, error_response = get_current_user(db)
        if error_response:
            return error_response

        # 1. Fetch the project with its customer
        project = get_by_id_or_uuid(db, Project, Project.project_id, Project.uuid, project_id_or_uuid)
        if not project:
            return jsonify({"error": "Project not found"}), 404
        if not _can_mutate_project(ctx, project):
            return jsonify({"error": "Forbidden"}), 403
        # Validate incoming data with Pydantic schema
        try:
            validated_data = ProjectDetailsUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400
        update_data = validated_data.dict(exclude_unset=True) # Only get fields that were actually sent
        project_updated = False
        customer_updated = False
        # 2. Update Project fields
        if 'project_location' in update_data and update_data['project_location'] != project.project_location:
            project.project_location = update_data['project_location']
            project_updated = True
       # 3. Update Customer fields
        customer = project.customer
        if not customer:
            return jsonify({"error": "Associated customer not found"}), 404
        if 'full_name' in update_data and update_data['full_name'] != customer.full_name:
            customer.full_name = update_data['full_name']
            customer_updated = True
        if 'email' in update_data and update_data['email'] != customer.email:
            customer.email = update_data['email']
            customer_updated = True
        if 'phone_number' in update_data and update_data['phone_number'] != customer.phone_number:
            customer.phone_number = update_data['phone_number']
            customer_updated = True
        # 4. Commit changes if any were made
        if project_updated or customer_updated:
            try:
                if project_updated:
                    project.is_dirty = True
                if customer_updated:
                    customer.is_dirty = True
                db.commit()
                db.refresh(project)
                # Ensure customer is refreshed as well
                db.refresh(customer)
                # 5. Construct and return response
                project_dict = model_to_dict(project)
                project_dict['customer'] = model_to_dict(customer)
                return jsonify(project_dict), 200
            except Exception as e:
                db.rollback()
                return jsonify({"error": f"An error occurred during update: {str(e)}"}), 500
        else:
            # Nothing to update, return original data
            project_dict = model_to_dict(project)
            project_dict['customer'] = model_to_dict(customer)
            return jsonify(project_dict), 200

@project_bp.route('/<string:project_id_or_uuid>/status', methods=['PATCH'])
def patch_project_status(project_id_or_uuid):
    with get_db() as db:
        ctx, error_response = get_current_user(db)
        if error_response:
            return error_response

        # 1. Validate incoming data
        try:
            validated_data = ProjectStatusUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        # 2. Fetch the project
        project = get_by_id_or_uuid(db, Project, Project.project_id, Project.uuid, project_id_or_uuid)
        if not project:
            return jsonify({"error": "Project not found"}), 404
        if not _can_mutate_project(ctx, project):
            return jsonify({"error": "Forbidden"}), 403

        # 3. Update status
        if project.status != validated_data.status:
            project.status = validated_data.status
            project.is_dirty = True
            try:
                db.commit()
                db.refresh(project)
                # We need to refresh customer separately if it's loaded
                if project.customer:
                    db.refresh(project.customer)
            except Exception as e:
                db.rollback()
                return jsonify({"error": f"Database error: {str(e)}"}), 500

        # 4. Return the full, updated project object
        project_dict = model_to_dict(project)
        if project.customer:
            project_dict['customer'] = model_to_dict(project.customer)
        else:
            project_dict['customer'] = None

        return jsonify(project_dict), 200

@project_bp.route('/quick-calc-id', methods=['POST'])
def get_or_create_quick_calc_project_id():
    with get_db() as db:
        auth_record = db.query(Authentication).filter(Authentication.is_logged_in == True).order_by(Authentication.last_active.desc()).first()
        if not auth_record:
            return jsonify({"error": "No authenticated user found. Please log in."}), 401

        current_user = db.query(User).filter(User.uuid == auth_record.user_uuid).first()
        if not current_user:
            return jsonify({"error": "Authenticated user not found in user table."}), 404

        # Define a unique identifier for the quick calc customer and project
        quick_calc_customer_name = "QuickCalcCustomer"

        # Try to find the QuickCalcCustomer for the current user
        quick_calc_customer = db.query(Customer).filter(
            Customer.full_name == quick_calc_customer_name,
            Customer.user_uuid == current_user.uuid
        ).first()

        # If not found, create it
        if not quick_calc_customer:
            quick_calc_customer = Customer(
                full_name=quick_calc_customer_name,
                user_uuid=current_user.uuid,
                organization_uuid=current_user.organization_uuid,
                branch_uuid=current_user.branch_uuid,
                is_dirty=True
            )
            db.add(quick_calc_customer)
            db.flush() # Flush to get the uuid for the new customer

        # Try to find the QuickCalcProject for this customer and user
        quick_calc_project = db.query(Project).filter(
            Project.customer_uuid == quick_calc_customer.uuid,
            Project.user_uuid == current_user.uuid,
            Project.status == 'planning' # Assuming quick-calc projects start as planning
        ).first()

        # If not found, create it
        if not quick_calc_project:
            quick_calc_project = Project(
                customer_uuid=quick_calc_customer.uuid,
                status='planning',
                project_location="Khartoum, Khartoum", # Default location
                user_uuid=current_user.uuid,
                organization_uuid=current_user.organization_uuid,
                branch_uuid=current_user.branch_uuid,
                is_dirty=True
            )
            db.add(quick_calc_project)
            db.flush() # Flush to get the uuid for the new project

        db.commit() # Commit any changes (new customer or project)
        db.refresh(quick_calc_project)

        return jsonify({"quick_calc_project_uuid": quick_calc_project.uuid}), 200

@project_bp.route('/quick-calc-init', methods=['POST'])
def get_or_create_quick_calc_project():
    with get_db() as db:
        auth_record = db.query(Authentication).filter(Authentication.is_logged_in == True).order_by(Authentication.last_active.desc()).first()
        if not auth_record:
            return jsonify({"error": "No authenticated user found. Please log in."}), 401

        current_user = db.query(User).filter(User.uuid == auth_record.user_uuid).first()
        if not current_user:
            return jsonify({"error": "Authenticated user not found in user table."}), 404

        # Define a unique identifier for the quick calc customer and project
        quick_calc_customer_name = "QuickCalcCustomer"
        quick_calc_project_name = "QuickCalcProject" # This is a placeholder for frontend display, not a DB column

        # Try to find the QuickCalcCustomer for the current user
        quick_calc_customer = db.query(Customer).filter(
            Customer.full_name == quick_calc_customer_name,
            Customer.user_uuid == current_user.uuid
        ).first()

        # If not found, create it
        if not quick_calc_customer:
            quick_calc_customer = Customer(
                full_name=quick_calc_customer_name,
                user_uuid=current_user.uuid,
                organization_uuid=current_user.organization_uuid,
                branch_uuid=current_user.branch_uuid,
                is_dirty=True
            )
            db.add(quick_calc_customer)
            db.flush()

        # Try to find the QuickCalcProject for this customer
        quick_calc_project = db.query(Project).filter(
            Project.customer_uuid == quick_calc_customer.uuid,
            Project.user_uuid == current_user.uuid,
            Project.status == 'planning' # Assuming quick-calc projects start as planning
        ).first()

        # If not found, create it
        if not quick_calc_project:
            quick_calc_project = Project(
                customer_uuid=quick_calc_customer.uuid,
                status='planning',
                project_location="Khartoum, Khartoum", # Default location
                user_uuid=current_user.uuid,
                organization_uuid=current_user.organization_uuid,
                branch_uuid=current_user.branch_uuid,
                is_dirty=True
            )
            db.add(quick_calc_project)
            db.flush()

        db.commit() # Commit any changes (new customer or project)
        db.refresh(quick_calc_customer)
        db.refresh(quick_calc_project)

        return jsonify(model_to_dict(quick_calc_project)), 200

@project_bp.route('/trash/empty', methods=['DELETE'])
def empty_trash():
    with get_db() as db:
        try:
            # 1. Find all soft-deleted projects and eager load children
            projects_to_delete = db.query(Project).options(
                joinedload(Project.invoices).joinedload(Invoice.payments),
                joinedload(Project.appliances),
                joinedload(Project.documents),
                joinedload(Project.system_config)
            ).filter(Project.deleted_at != None).all()

            if not projects_to_delete:
                return jsonify({"message": "Trash is already empty."}), 200

            num_deleted = len(projects_to_delete)

            # 2. Iterate and delete related objects and the project itself
            for project in projects_to_delete:
                for invoice in project.invoices:
                    for payment in invoice.payments:
                        db.delete(payment)
                    db.delete(invoice)

                for appliance in project.appliances:
                    db.delete(appliance)

                for document in project.documents:
                    db.delete(document)

                if project.system_config:
                    db.delete(project.system_config)

                db.delete(project)

            db.commit()

            return jsonify({"message": f"{num_deleted} projects and their related data have been permanently deleted."}), 200

        except Exception as e:
            db.rollback()
            import logging
            logging.exception("Error during empty trash operation")
            return jsonify({"error": f"An internal error occurred: {str(e)}"}), 500
