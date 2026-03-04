from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db
from models import InventoryCategory, InventoryItem, StockAdjustment, ProjectComponent, User, Authentication
from schemas import (
    InventoryCategoryCreate, InventoryCategoryUpdate,
    InventoryItemCreate, InventoryItemUpdate,
    StockAdjustmentCreate, ProjectComponentCreate
)
from serializer import model_to_dict

inventory_bp = Blueprint('inventory_bp', __name__, url_prefix='/inventory')

# --- Categories ---

@inventory_bp.route('/categories', methods=['POST'])
def create_category():
    try:
        validated_data = InventoryCategoryCreate(**request.json)
    except ValidationError as e:
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        new_item = InventoryCategory(**validated_data.dict())
        new_item.is_dirty = True
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return jsonify(model_to_dict(new_item)), 201

@inventory_bp.route('/categories', methods=['GET'])
def get_categories():
    with get_db() as db:
        items = db.query(InventoryCategory).all()
        return jsonify([model_to_dict(i) for i in items])

@inventory_bp.route('/categories/<string:uuid>', methods=['GET'])
def get_category(uuid):
    with get_db() as db:
        item = db.query(InventoryCategory).filter(InventoryCategory.uuid == uuid).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@inventory_bp.route('/categories/<string:uuid>', methods=['PUT'])
def update_category(uuid):
    with get_db() as db:
        item = db.query(InventoryCategory).filter(InventoryCategory.uuid == uuid).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        try:
            validated_data = InventoryCategoryUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        for key, value in validated_data.dict(exclude_unset=True).items():
            setattr(item, key, value)
        item.is_dirty = True
        db.commit()
        db.refresh(item)
        return jsonify(model_to_dict(item))

@inventory_bp.route('/categories/<string:uuid>', methods=['DELETE'])
def delete_category(uuid):
    with get_db() as db:
        item = db.query(InventoryCategory).filter(InventoryCategory.uuid == uuid).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        db.delete(item)
        db.commit()
        return jsonify({"message": "Deleted successfully"}), 200


# --- Items ---

def validate_specs(category, specs):
    if not category or not category.spec_schema or not specs:
        return True
    if not isinstance(specs, dict):
        return False
    return True

@inventory_bp.route('/items', methods=['POST'])
def create_item():
    try:
        validated_data = InventoryItemCreate(**request.json)
    except ValidationError as e:
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        if validated_data.category_uuid and validated_data.technical_specs:
            category = db.query(InventoryCategory).filter(InventoryCategory.uuid == validated_data.category_uuid).first()
            if not validate_specs(category, validated_data.technical_specs):
                return jsonify({"error": "Invalid technical specs format"}), 400

        new_item = InventoryItem(**validated_data.dict())
        new_item.is_dirty = True
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return jsonify(model_to_dict(new_item)), 201

@inventory_bp.route('/items', methods=['GET'])
def get_items():
    with get_db() as db:
        items = db.query(InventoryItem).all()
        return jsonify([model_to_dict(i) for i in items])

@inventory_bp.route('/items/<string:uuid>', methods=['GET'])
def get_item(uuid):
    with get_db() as db:
        item = db.query(InventoryItem).filter(InventoryItem.uuid == uuid).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@inventory_bp.route('/items/<string:uuid>', methods=['PUT'])
def update_item(uuid):
    with get_db() as db:
        item = db.query(InventoryItem).filter(InventoryItem.uuid == uuid).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        try:
            validated_data = InventoryItemUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        update_data = validated_data.dict(exclude_unset=True)

        new_cat_uuid = update_data.get('category_uuid', item.category_uuid)
        new_specs = update_data.get('technical_specs', item.technical_specs)
        if new_cat_uuid and new_specs:
            category = db.query(InventoryCategory).filter(InventoryCategory.uuid == new_cat_uuid).first()
            if not validate_specs(category, new_specs):
                return jsonify({"error": "Invalid technical specs format"}), 400

        for key, value in update_data.items():
            setattr(item, key, value)
        item.is_dirty = True
        db.commit()
        db.refresh(item)
        return jsonify(model_to_dict(item))

@inventory_bp.route('/items/<string:uuid>', methods=['DELETE'])
def delete_item(uuid):
    with get_db() as db:
        item = db.query(InventoryItem).filter(InventoryItem.uuid == uuid).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        db.delete(item)
        db.commit()
        return jsonify({"message": "Deleted successfully"}), 200


# --- Stock Adjustments ---

@inventory_bp.route('/adjustments', methods=['POST'])
def create_adjustment():
    try:
        validated_data = StockAdjustmentCreate(**request.json)
    except ValidationError as e:
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        item = db.query(InventoryItem).filter(InventoryItem.uuid == validated_data.item_uuid).first()
        if not item:
            return jsonify({"error": "Item not found"}), 404

        # Centralized Stock Logic: update quantity_on_hand
        item.quantity_on_hand += validated_data.adjustment
        item.is_dirty = True

        new_adjustment = StockAdjustment(**validated_data.dict())
        new_adjustment.is_dirty = True
        db.add(new_adjustment)
        db.commit()
        db.refresh(new_adjustment)
        return jsonify(model_to_dict(new_adjustment)), 201

@inventory_bp.route('/items/<string:item_uuid>/adjustments', methods=['GET'])
def get_item_adjustments(item_uuid):
    with get_db() as db:
        adjustments = db.query(StockAdjustment).filter(StockAdjustment.item_uuid == item_uuid).all()
        return jsonify([model_to_dict(a) for a in adjustments])


# --- Project Components ---

@inventory_bp.route('/project-components', methods=['POST'])
def add_project_component():
    try:
        validated_data = ProjectComponentCreate(**request.json)
    except ValidationError as e:
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        item = db.query(InventoryItem).filter(InventoryItem.uuid == validated_data.item_uuid).first()
        if not item:
            return jsonify({"error": "Item not found"}), 404

        new_comp = ProjectComponent(**validated_data.dict())
        new_comp.is_dirty = True
        db.add(new_comp)
        db.commit()
        db.refresh(new_comp)
        return jsonify(model_to_dict(new_comp)), 201

@inventory_bp.route('/projects/<string:project_uuid>/components', methods=['GET'])
def get_project_components(project_uuid):
    with get_db() as db:
        components = db.query(ProjectComponent).filter(ProjectComponent.project_uuid == project_uuid).all()
        return jsonify([model_to_dict(c) for c in components])
