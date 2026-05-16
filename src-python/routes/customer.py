from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db, get_by_id_or_uuid
from models import Customer, Project
from .authentication import get_latest_authentication
from schemas import CustomerCreate, CustomerUpdate
from serializer import model_to_dict
from sqlalchemy import func
from datetime import datetime
import json
from authz import get_current_user

customer_bp = Blueprint('customer_bp', __name__, url_prefix='/customers')


def _can_view_customer(ctx, customer: Customer) -> tuple[bool, str]:
    if not ctx.org_uuid:
        return (customer.user_uuid == ctx.user_uuid, "full")

    if customer.organization_uuid != ctx.org_uuid:
        return (False, "hidden")

    if ctx.is_admin:
        if customer.branch_uuid == ctx.branch_uuid:
            return (True, "full")
        return (True, "view")

    # Employee / normal org users are branch-scoped.
    if customer.branch_uuid != ctx.branch_uuid:
        return (False, "hidden")
    if customer.user_uuid == ctx.user_uuid:
        return (True, "full")
    return (True, "view")


def _can_mutate_customer(ctx, customer: Customer) -> bool:
    if not ctx.org_uuid:
        return customer.user_uuid == ctx.user_uuid
    if customer.organization_uuid != ctx.org_uuid:
        return False
    if ctx.is_admin:
        return customer.branch_uuid == ctx.branch_uuid
    return customer.user_uuid == ctx.user_uuid

def get_customer_with_stats(db, customer):
    customer_dict = model_to_dict(customer)
    # Fetch project counts grouped by status for this specific customer
    stats = db.query(Project.status, func.count(Project.project_id))\
              .filter(Project.customer_uuid == customer.uuid)\
              .filter(Project.deleted_at.is_(None))\
              .group_by(Project.status).all()
    customer_dict['project_stats'] = {status: count for status, count in stats}
    return customer_dict

@customer_bp.route('/', methods=['POST'])
def create_customer():
    try:
        # Validate request data using the Pydantic schema
        validated_data = CustomerCreate(**request.json)
    except ValidationError as e:
        # Return a 400 Bad Request with validation errors
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        ctx, error_response = get_current_user(db)
        if error_response:
            return error_response

        # Create the SQLAlchemy model from validated data
        create_data = validated_data.dict(exclude_unset=True)
        # Ensure ownership is always the authenticated user.
        create_data["user_uuid"] = ctx.user_uuid
        create_data["organization_uuid"] = ctx.org_uuid
        create_data["branch_uuid"] = ctx.branch_uuid
        new_item = Customer(**create_data)
        new_item.is_dirty = True
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        payload = get_customer_with_stats(db, new_item)
        payload["access"] = {"mode": "full"}
        return jsonify(payload), 201

@customer_bp.route('/<string:item_id>', methods=['PUT'])
def update_customer(item_id):
    with get_db() as db:
        ctx, error_response = get_current_user(db)
        if error_response:
            return error_response

        item = get_by_id_or_uuid(db, Customer, Customer.customer_id, Customer.uuid, item_id)
        if not item or item.deleted_at is not None:
            return jsonify({"error": "Not found"}), 404
        if not _can_mutate_customer(ctx, item):
            return jsonify({"error": "Forbidden"}), 403

        try:
            # Validate request data
            validated_data = CustomerUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        # Use exclude_unset=True to only update fields that were actually provided
        update_data = validated_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)

        item.is_dirty = True
        db.commit()
        db.refresh(item)
        payload = get_customer_with_stats(db, item)
        payload["access"] = {"mode": "full"}
        return jsonify(payload)

@customer_bp.route('/', methods=['GET'])
def get_all_customer():
    # Keep list minimal as requested: only the authenticated user's customers.
    auth = get_latest_authentication()
    if not auth or not auth.data:
        return jsonify({"error": "Not authenticated"}), 401
    try:
        user_uuid = json.loads(auth.data)['user_uuid']
    except (json.JSONDecodeError, KeyError):
        return jsonify({"error": "Invalid authentication data"}), 401
    with get_db() as db:
        items = db.query(Customer).filter(Customer.deleted_at.is_(None), Customer.user_uuid == user_uuid).all()
        results = []
        for i in items:
            payload = get_customer_with_stats(db, i)
            payload["access"] = {"mode": "full"}
            results.append(payload)
        return jsonify(results)

@customer_bp.route('/<string:item_id>', methods=['GET'])
def get_customer(item_id):
    with get_db() as db:
        ctx, error_response = get_current_user(db)
        if error_response:
            return error_response

        item = get_by_id_or_uuid(db, Customer, Customer.customer_id, Customer.uuid, item_id)
        if not item or item.deleted_at is not None:
            return jsonify({"error": "Not found"}), 404
        can_view, mode = _can_view_customer(ctx, item)
        if not can_view:
            return jsonify({"error": "Not found"}), 404
        payload = get_customer_with_stats(db, item)
        payload["access"] = {"mode": mode}
        return jsonify(payload)

@customer_bp.route('/<string:item_id>', methods=['DELETE'])
def delete_customer(item_id):
    with get_db() as db:
        ctx, error_response = get_current_user(db)
        if error_response:
            return error_response

        item = get_by_id_or_uuid(db, Customer, Customer.customer_id, Customer.uuid, item_id)
        if not item or item.deleted_at is not None:
            return jsonify({"error": "Not found"}), 404
        if not _can_mutate_customer(ctx, item):
            return jsonify({"error": "Forbidden"}), 403

        # Soft delete: set deleted_at instead of db.delete(item)
        item.deleted_at = datetime.utcnow()
        item.is_dirty = True
        db.commit()
        return jsonify({"message": "Deleted successfully"}), 200
