from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from sqlalchemy.orm import joinedload
from datetime import datetime
from utils import get_db
from models import Project, Customer, User, Authentication, SystemConfiguration, Appliance, Invoice, Payment, Document
from schemas import ProjectCreate, ProjectUpdate, ProjectWithCustomerCreate, ProjectDetailsUpdate, ProjectStatusUpdate
from serializer import model_to_dict

project_bp = Blueprint('project_bp', __name__, url_prefix='/projects')

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
            # 1. Create Customer
            new_customer = Customer(
                full_name=data.customer_name,
                phone_number=data.phone_number,
                email=data.email,
                user_uuid=current_user.uuid,
                organization_uuid=current_user.organization_uuid,
                branch_uuid=current_user.branch_uuid,
                is_dirty=True
            )
            db.add(new_customer)
            db.flush()

            # 2. Create Project and link to Customer
            new_project = Project(
                customer_uuid=new_customer.uuid,
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

@project_bp.route('/<int:item_id>', methods=['PUT'])
def update_project(item_id):
    with get_db() as db:
        item = db.query(Project).filter(Project.project_id == item_id).first()
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
        items = db.query(Project).options(joinedload(Project.customer)).order_by(Project.created_at.desc()).all()
        results = []
        for p in items:
            project_dict = model_to_dict(p)
            if p.customer:
                project_dict['customer'] = model_to_dict(p.customer)
            else:
                project_dict['customer'] = None
            results.append(project_dict)
        return jsonify(results)

@project_bp.route('/<int:item_id>', methods=['GET'])
def get_project(item_id):
    with get_db() as db:
        item = db.query(Project).filter(Project.project_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@project_bp.route('/<string:project_uuid>', methods=['DELETE'])
def delete_project(project_uuid):
    with get_db() as db:
        project = db.query(Project).filter(Project.uuid == project_uuid).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        project.deleted_at = datetime.utcnow()
        project.is_dirty = True
        try:
            db.commit()
            return jsonify({"message": "Project moved to trash", "deleted_at": project.deleted_at.isoformat()}), 200
        except Exception as e:
            db.rollback()
            return jsonify({"error": f"Database error: {str(e)}"}), 500

@project_bp.route('/<string:project_uuid>/recover', methods=['PATCH'])
def recover_project(project_uuid):
    with get_db() as db:
        project = db.query(Project).filter(Project.uuid == project_uuid).first()
        if not project.deleted_at:
            return jsonify({"message": "Project is not deleted"}), 400

        project.deleted_at = None
        project.is_dirty = True
        try:
            db.commit()
            return jsonify({"message": "Project recovered successfully"}), 200
        except Exception as e:
            db.rollback()
            return jsonify({"error": f"Database error: {str(e)}"}), 500

@project_bp.route('/<string:project_uuid>/permanent', methods=['DELETE'])
def delete_project_permanently(project_uuid):
    with get_db() as db:
        try:
            # 1. Find the project and eager load its children
            project = db.query(Project).options(
                joinedload(Project.invoices).joinedload(Invoice.payments),
                joinedload(Project.appliances),
                joinedload(Project.documents),
                joinedload(Project.system_config)
            ).filter(Project.uuid == project_uuid).first()

            if not project:
                return jsonify({"error": "Project not found"}), 404

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
            logging.exception(f"Error during permanent deletion of project {project_uuid}")
            return jsonify({"error": f"An internal error occurred: {str(e)}"}), 500

@project_bp.route('/<string:project_uuid>', methods=['PATCH'])
def patch_project_details(project_uuid):
    with get_db() as db:
        # 1. Fetch the project with its customer
        project = db.query(Project).options(joinedload(Project.customer)).filter(Project.uuid == project_uuid).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404
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

@project_bp.route('/<string:project_uuid>/status', methods=['PATCH'])
def patch_project_status(project_uuid):
    with get_db() as db:
        # 1. Validate incoming data
        try:
            validated_data = ProjectStatusUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        # 2. Fetch the project
        project = db.query(Project).filter(Project.uuid == project_uuid).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

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
