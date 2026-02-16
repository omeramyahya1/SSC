from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from sqlalchemy.orm import joinedload
from utils import get_db
from models import Project, Customer, User, Authentication
from schemas import ProjectCreate, ProjectUpdate, ProjectWithCustomerCreate, ProjectDetailsUpdate
from serializer import model_to_dict

project_bp = Blueprint('project_bp', __name__, url_prefix='/projects')

@project_bp.route('/create_with_customer', methods=['POST'])
def create_project_with_customer():
    with get_db() as db:
        # 1. Get the current logged-in user
        auth_record = db.query(Authentication).filter(Authentication.is_logged_in == True).order_by(Authentication.last_active.desc()).first()
        if not auth_record:
            return jsonify({"error": "No authenticated user found. Please log in."}), 401

        current_user = db.query(User).filter(User.uuid == auth_record.user_uuid).first()
        if not current_user:
            return jsonify({"error": "Authenticated user not found in user table."}), 404

        # 2. Validate the incoming payload
        try:
            data = ProjectWithCustomerCreate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        # 3. Create Customer and Project in a transaction
        try:
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
            db.flush()  # Use flush to get the generated UUID for the customer

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
            db.commit() # Commit both customer and project

            # 4. Prepare and return the response
            db.refresh(new_project)
            db.refresh(new_customer)

            project_dict = model_to_dict(new_project)
            project_dict['customer'] = model_to_dict(new_customer)

            return jsonify(project_dict), 201

        except Exception as e:
            db.rollback()
            return jsonify({"error": f"An error occurred during project creation: {str(e)}"}), 500


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

@project_bp.route('/<int:item_id>', methods=['DELETE'])
def delete_project(item_id):

    with get_db() as db:

        item = db.query(Project).filter(Project.project_id == item_id).first()

        if not item:

            return jsonify({"error": "Not found"}), 404

        db.delete(item)

        db.commit()

        return jsonify({"message": "Deleted successfully"}), 200

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
        project = db.query(Project).options(joinedload(Project.customer)).filter(Project.uuid == project_uuid).first()
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
