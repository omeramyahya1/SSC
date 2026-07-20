from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db
from models import InventoryCategory, InventoryItem, StockAdjustment, ProjectComponent, User, Authentication, Branch
from inventory_categories import (
    canonical_inventory_categories,
    canonical_inventory_category_uuids,
    ensure_inventory_categories,
)
from schemas import (
    InventoryItemCreate, InventoryItemUpdate,
    StockAdjustmentCreate, ProjectComponentCreate
)
from serializer import model_to_dict
import logging

inventory_bp = Blueprint('inventory_bp', __name__, url_prefix='/inventory')

def _get_current_user(db):
    auth_record = (
        db.query(Authentication)
        .filter(Authentication.is_logged_in == True)
        .order_by(Authentication.last_active.desc())
        .first()
    )
    if not auth_record:
        return None, (jsonify({"error": "No authenticated user found. Please log in."}), 401)

    current_user = db.query(User).filter(User.uuid == auth_record.user_uuid).first()
    if not current_user:
        return None, (jsonify({"error": "Authenticated user not found in user table."}), 404)

    return current_user, None

def _get_inventory_scope(user):
    if user.organization_uuid:
        if user.role == 'admin':
            return {"level": "org", "org_uuid": user.organization_uuid, "branch_uuid": None, "user_uuid": None}
        return {"level": "branch", "org_uuid": user.organization_uuid, "branch_uuid": user.branch_uuid, "user_uuid": None}
    return {"level": "user", "org_uuid": None, "branch_uuid": None, "user_uuid": user.uuid}

def _apply_item_scope(query, scope):
    query = query.filter(InventoryItem.deleted_at.is_(None))
    if scope["org_uuid"]:
        query = query.filter(InventoryItem.organization_uuid == scope["org_uuid"])
        if scope["branch_uuid"]:
            query = query.filter(InventoryItem.branch_uuid == scope["branch_uuid"])
        return query
    return query.filter(InventoryItem.user_uuid == scope["user_uuid"])

def _get_scoped_category(db, scope, category_uuid):
    ensure_inventory_categories(db)
    return (
        db.query(InventoryCategory)
        .filter(
            InventoryCategory.uuid == category_uuid,
            InventoryCategory.deleted_at.is_(None),
        )
        .first()
    )

def _get_scoped_item(db, scope, item_uuid):
    query = db.query(InventoryItem).filter(
        InventoryItem.uuid == item_uuid,
        InventoryItem.deleted_at.is_(None),
    )
    return _apply_item_scope(query, scope).first()

@inventory_bp.route('/categories', methods=['POST'])
def create_category():
    return jsonify({"error": "Category creation is disabled in this version."}), 403

@inventory_bp.route('/categories/update', methods=['POST'])
def update_categories():
    return jsonify({
        "message": "Inventory categories are managed globally and cannot be updated from the app."
    }), 403

@inventory_bp.route('/categories', methods=['GET'])
def get_categories():
    with get_db() as db:
        _current_user, error_response = _get_current_user(db)
        if error_response:
            return error_response
        ensure_inventory_categories(db)
        categories_by_uuid = {
            category.uuid: category
            for category in db.query(InventoryCategory)
            .filter(InventoryCategory.uuid.in_(list(canonical_inventory_category_uuids())))
            .all()
        }
        ordered_categories = [
            categories_by_uuid[entry["uuid"]]
            for entry in canonical_inventory_categories()
            if entry["uuid"] in categories_by_uuid
        ]
        return jsonify([model_to_dict(i) for i in ordered_categories])

@inventory_bp.route('/categories/<string:uuid>', methods=['GET'])
def get_category(uuid):
    with get_db() as db:
        _current_user, error_response = _get_current_user(db)
        if error_response:
            return error_response
        ensure_inventory_categories(db)
        item = (
            db.query(InventoryCategory)
            .filter(
                InventoryCategory.uuid == uuid,
                InventoryCategory.deleted_at.is_(None),
            )
            .first()
        )
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@inventory_bp.route('/categories/<string:uuid>', methods=['PUT'])
def update_category(uuid):
    return jsonify({"error": "Category updates are disabled in this version."}), 403

@inventory_bp.route('/categories/<string:uuid>', methods=['DELETE'])
def delete_category(uuid):
    return jsonify({"error": "Category deletion is disabled in this version."}), 403

# --- Items ---

def validate_specs(category, specs):
    if not category or not category.spec_schema or not specs:
        return True
    if not isinstance(specs, dict):
        return False
    return True

@inventory_bp.route('/items', methods=['POST'])
def create_item():
    with get_db() as db:
        try:
            current_user, error_response = _get_current_user(db)
            if error_response:
                return error_response
            scope = _get_inventory_scope(current_user)

            try:
                validated_data = InventoryItemCreate(**request.json)
            except ValidationError as e:
                return jsonify({"errors": e.errors()}), 400

            if validated_data.category_uuid:
                category = _get_scoped_category(db, scope, validated_data.category_uuid)
                if not category:
                    return jsonify({"error": "Category not found"}), 404
                if validated_data.technical_specs and not validate_specs(category, validated_data.technical_specs):
                    return jsonify({"error": "Invalid technical specs format"}), 400

            if scope["org_uuid"] and current_user.role == 'admin':
                if not validated_data.branch_uuid:
                    return jsonify({"error": "branch_uuid is required for admin-created items."}), 400
                branch = db.query(Branch).filter(Branch.uuid == validated_data.branch_uuid).first()
                if not branch or branch.organization_uuid != scope["org_uuid"]:
                    return jsonify({"error": "Invalid branch for this organization."}), 400

            payload = validated_data.dict()
            payload.pop("organization_uuid", None)
            payload.pop("branch_uuid", None)
            payload.pop("user_uuid", None)
            if scope["org_uuid"]:
                payload["organization_uuid"] = scope["org_uuid"]
                payload["user_uuid"] = None
                if scope["branch_uuid"]:
                    payload["branch_uuid"] = scope["branch_uuid"]
                else:
                    payload["branch_uuid"] = validated_data.branch_uuid
            else:
                payload["organization_uuid"] = None
                payload["branch_uuid"] = None
                payload["user_uuid"] = scope["user_uuid"]

            new_item = InventoryItem(**payload)
            new_item.is_dirty = True
            db.add(new_item)
            db.commit()
            db.refresh(new_item)
            return jsonify(model_to_dict(new_item)), 201
        except Exception as e:
            db.rollback()
            logging.exception("Error creating item")
            return jsonify({"error": str(e)}), 500

@inventory_bp.route('/items', methods=['GET'])
def get_items():
    with get_db() as db:
        current_user, error_response = _get_current_user(db)
        if error_response:
            return error_response
        scope = _get_inventory_scope(current_user)

        items = _apply_item_scope(db.query(InventoryItem), scope).all()

        return jsonify([model_to_dict(i) for i in items])

@inventory_bp.route('/items/<string:uuid>', methods=['GET'])
def get_item(uuid):
    with get_db() as db:
        current_user, error_response = _get_current_user(db)
        if error_response:
            return error_response
        scope = _get_inventory_scope(current_user)

        item = _get_scoped_item(db, scope, uuid)
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@inventory_bp.route('/items/<string:uuid>', methods=['PUT'])
def update_item(uuid):
    with get_db() as db:
        try:
            current_user, error_response = _get_current_user(db)
            if error_response:
                return error_response
            scope = _get_inventory_scope(current_user)

            item = _get_scoped_item(db, scope, uuid)
            if not item:
                return jsonify({"error": "Not found"}), 404
            try:
                validated_data = InventoryItemUpdate(**request.json)
            except ValidationError as e:
                return jsonify({"errors": e.errors()}), 400

            update_data = validated_data.dict(exclude_unset=True)
            update_data.pop("organization_uuid", None)
            update_data.pop("branch_uuid", None)
            update_data.pop("user_uuid", None)

            if scope["org_uuid"] and current_user.role == 'admin':
                if "branch_uuid" in update_data and not update_data["branch_uuid"]:
                    return jsonify({"error": "branch_uuid cannot be empty for admin items."}), 400

            new_cat_uuid = update_data.get('category_uuid', item.category_uuid)
            new_specs = update_data.get('technical_specs', item.technical_specs)
            if new_cat_uuid and new_specs:
                category = _get_scoped_category(db, scope, new_cat_uuid)
                if not category:
                    return jsonify({"error": "Category not found"}), 404
                if not validate_specs(category, new_specs):
                    return jsonify({"error": "Invalid technical specs format"}), 400

            for key, value in update_data.items():
                setattr(item, key, value)
            item.is_dirty = True
            db.commit()
            db.refresh(item)
            return jsonify(model_to_dict(item))
        except Exception as e:
            db.rollback()
            logging.exception("Error updating item")
            return jsonify({"error": str(e)}), 500

@inventory_bp.route('/items/<string:uuid>', methods=['DELETE'])
def delete_item(uuid):
    with get_db() as db:
        try:
            current_user, error_response = _get_current_user(db)
            if error_response:
                return error_response
            scope = _get_inventory_scope(current_user)

            item = _get_scoped_item(db, scope, uuid)
            if not item:
                return jsonify({"error": "Not found"}), 404
            db.delete(item)
            db.commit()
            return jsonify({"message": "Deleted successfully"}), 200
        except Exception as e:
            db.rollback()
            logging.exception("Error deleting item")
            return jsonify({"error": str(e)}), 500


# --- Stock Adjustments ---

@inventory_bp.route('/adjustments', methods=['POST'])
def create_adjustment():
    with get_db() as db:
        try:
            # 1. Authenticate and verify user context first
            current_user, error_response = _get_current_user(db)
            if error_response:
                return error_response

            scope = _get_inventory_scope(current_user)

            try:
                validated_data = StockAdjustmentCreate(**request.json)
            except ValidationError as e:
                return jsonify({"errors": e.errors()}), 400

            # 2. Check permission context BEFORE initiating the row-level update lock
            # This protects your internal helper queries from conflicting with with_for_update()
            item = _apply_item_scope(
                db.query(InventoryItem).filter(
                    InventoryItem.uuid == validated_data.item_uuid,
                ),
                scope,
            ).with_for_update().first()
            if not item:
                return jsonify({"error": "Not authorized to adjust this item or item not found."}), 403

            # 4. Validate that the adjustment doesn't result in negative stock
            if item.quantity_on_hand + validated_data.adjustment < 0:
                return jsonify({"error": "Stock quantity cannot become negative."}), 400

            # 5. Mutate the inventory record securely
            item.quantity_on_hand += validated_data.adjustment
            item.is_dirty = True

            # 6. Build the payload matching multi-tenant/standalone scope conditions
            payload = validated_data.dict(exclude_unset=True)
            payload.pop("organization_uuid", None)
            payload.pop("branch_uuid", None)
            payload.pop("user_uuid", None)

            if scope.get("org_uuid"):
                payload["organization_uuid"] = scope["org_uuid"]
                payload["branch_uuid"] = scope["branch_uuid"] or item.branch_uuid
                payload["user_uuid"] = current_user.uuid
            else:
                payload["organization_uuid"] = None
                payload["branch_uuid"] = None
                payload["user_uuid"] = scope.get("user_uuid")

            new_adjustment = StockAdjustment(**payload)
            new_adjustment.is_dirty = True
            db.add(new_adjustment)

            # 7. Commit changes and close transaction safely
            db.commit()

            # Construct response safe from thread-racing mutations
            response_data = model_to_dict(new_adjustment)
            return jsonify(response_data), 201

        except Exception as e:
            db.rollback()
            logging.exception("Error creating stock adjustment")
            return jsonify({"error": str(e)}), 500

@inventory_bp.route('/items/<string:item_uuid>/adjustments', methods=['GET'])
def get_item_adjustments(item_uuid):
    with get_db() as db:
        current_user, error_response = _get_current_user(db)
        if error_response:
            return error_response
        scope = _get_inventory_scope(current_user)

        item = _get_scoped_item(db, scope, item_uuid)
        if not item:
            return jsonify({"error": "Not found"}), 404

        adjustments = db.query(StockAdjustment).filter(StockAdjustment.item_uuid == item_uuid).all()
        return jsonify([model_to_dict(a) for a in adjustments])

@inventory_bp.route('/adjustments/history', methods=['GET'])
def get_adjustments_history():
    """
    Get global stock adjustment history.
    """
    with get_db() as db:
        current_user, error_response = _get_current_user(db)
        if error_response:
            return error_response
        scope = _get_inventory_scope(current_user)

        query = db.query(StockAdjustment).join(InventoryItem, StockAdjustment.item_uuid == InventoryItem.uuid)
        query = query.filter(StockAdjustment.deleted_at == None, InventoryItem.deleted_at == None)

        if scope["org_uuid"]:
            query = query.filter(StockAdjustment.organization_uuid == scope["org_uuid"])
            if scope["branch_uuid"]:
                query = query.filter(StockAdjustment.branch_uuid == scope["branch_uuid"])
        else:
            query = query.filter(StockAdjustment.user_uuid == scope["user_uuid"])

        adjustments = query.order_by(StockAdjustment.created_at.desc()).all()

        results = []
        for adj in adjustments:
            d = model_to_dict(adj)
            if adj.item:
                d['item_name'] = adj.item.name
                d['item_sku'] = adj.item.sku
            results.append(d)

        return jsonify(results)


# --- Project Components ---

@inventory_bp.route('/project-components', methods=['POST'])
def add_project_component():
    try:
        validated_data = ProjectComponentCreate(**request.json)
    except ValidationError as e:
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        try:
            item = db.query(InventoryItem).filter(InventoryItem.uuid == validated_data.item_uuid).first()
            if not item:
                return jsonify({"error": "Item not found"}), 404

            new_comp = ProjectComponent(**validated_data.dict())
            new_comp.is_dirty = True
            db.add(new_comp)
            db.commit()
            db.refresh(new_comp)

            d = model_to_dict(new_comp, include_relationships=True)
            if new_comp.item:
                d['item'] = model_to_dict(new_comp.item, include_relationships=True)
            return jsonify(d), 201
        except Exception as e:
            db.rollback()
            logging.exception("Error adding project component")
            return jsonify({"error": str(e)}), 500

@inventory_bp.route('/projects/<string:project_uuid>/components', methods=['GET'])
def get_project_components(project_uuid):
    with get_db() as db:
        # We need to eager load the item and category to make the slots work
        components = db.query(ProjectComponent).filter(ProjectComponent.project_uuid == project_uuid).all()
        # include_relationships=True will include the 'item' relationship
        # item's relationship include_relationships=True will include 'category'
        results = []
        for c in components:
            d = model_to_dict(c, include_relationships=True)
            if c.item:
                d['item'] = model_to_dict(c.item, include_relationships=True)
            results.append(d)
        return jsonify(results)

@inventory_bp.route('/project-components/<string:uuid>', methods=['DELETE'])
def delete_project_component(uuid):
    with get_db() as db:
        try:
            item = db.query(ProjectComponent).filter(ProjectComponent.uuid == uuid).first()
            if not item:
                return jsonify({"error": "Not found"}), 404
            db.delete(item)
            db.commit()
            return jsonify({"message": "Deleted successfully"}), 200
        except Exception as e:
            db.rollback()
            logging.exception("Error deleting project component")
            return jsonify({"error": str(e)}), 500
