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
import logging

inventory_bp = Blueprint('inventory_bp', __name__, url_prefix='/inventory')

# --- Categories ---

def _default_inventory_categories():
    return [
        {
            "name": "Solar Panels",
            "spec_schema": {
                "panel_rated_power": "W",
                "panel_mpp_voltage": "V"
            }
        },
        {
            "name": "Inverters",
            "spec_schema": {
                "inverter_rated_power": "W",
                "inverter_mppt_min_v": "V",
                "inverter_mppt_max_v": "V",
                "system_voltage_v": "V"
            }
        },
        {
            "name": "Batteries",
            "spec_schema": {
                "battery_rated_capacity_ah": "Ah",
                "battery_rated_voltage": "V",
                "battery_max_parallel": "count"
            }
        },
        {
            "name": "Accessories",
            "spec_schema": {}
        }
    ]

@inventory_bp.route('/categories', methods=['POST'])
def create_category():
    with get_db() as db:
        try:
            try:
                validated_data = InventoryCategoryCreate(**request.json)
            except ValidationError as e:
                return jsonify({"errors": e.errors()}), 400

            new_item = InventoryCategory(**validated_data.dict())
            new_item.is_dirty = True
            db.add(new_item)
            db.commit()
            db.refresh(new_item)
            return jsonify(model_to_dict(new_item)), 201
        except Exception as e:
            db.rollback()
            logging.exception("Error creating category")
            return jsonify({"error": str(e)}), 500

@inventory_bp.route('/categories', methods=['GET'])
def get_categories():
    with get_db() as db:
        items = db.query(InventoryCategory).all()
        if items:
            return jsonify([model_to_dict(i) for i in items])

        defaults = []
        for cat in _default_inventory_categories():
            item = InventoryCategory(
                name=cat["name"],
                spec_schema=cat["spec_schema"],
                is_dirty=True
            )
            defaults.append(item)
        db.add_all(defaults)
        db.commit()
        for item in defaults:
            db.refresh(item)
        return jsonify([model_to_dict(i) for i in defaults])

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
        try:
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
        except Exception as e:
            db.rollback()
            logging.exception("Error updating category")
            return jsonify({"error": str(e)}), 500

@inventory_bp.route('/categories/<string:uuid>', methods=['DELETE'])
def delete_category(uuid):
    with get_db() as db:
        try:
            item = db.query(InventoryCategory).filter(InventoryCategory.uuid == uuid).first()
            if not item:
                return jsonify({"error": "Not found"}), 404
            db.delete(item)
            db.commit()
            return jsonify({"message": "Deleted successfully"}), 200
        except Exception as e:
            db.rollback()
            logging.exception("Error deleting category")
            return jsonify({"error": str(e)}), 500


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
            try:
                validated_data = InventoryItemCreate(**request.json)
            except ValidationError as e:
                return jsonify({"errors": e.errors()}), 400

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
        except Exception as e:
            db.rollback()
            logging.exception("Error creating item")
            return jsonify({"error": str(e)}), 500

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
        try:
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
        except Exception as e:
            db.rollback()
            logging.exception("Error updating item")
            return jsonify({"error": str(e)}), 500

@inventory_bp.route('/items/<string:uuid>', methods=['DELETE'])
def delete_item(uuid):
    with get_db() as db:
        try:
            item = db.query(InventoryItem).filter(InventoryItem.uuid == uuid).first()
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
            try:
                validated_data = StockAdjustmentCreate(**request.json)
            except ValidationError as e:
                return jsonify({"errors": e.errors()}), 400

            class _InsufficientStock(Exception):
                pass

            class _ItemNotFound(Exception):
                pass

            new_adjustment = None
            try:
                with db.begin():
                    item = (
                        db.query(InventoryItem)
                        .filter(InventoryItem.uuid == validated_data.item_uuid)
                        .with_for_update()
                        .first()
                    )
                    if not item:
                        raise _ItemNotFound()

                    # Validate that the adjustment doesn't result in negative stock
                    if item.quantity_on_hand + validated_data.adjustment < 0:
                        raise _InsufficientStock()

                    # Centralized Stock Logic: update quantity_on_hand
                    item.quantity_on_hand += validated_data.adjustment
                    item.is_dirty = True

                    new_adjustment = StockAdjustment(**validated_data.dict(exclude_unset=True))
                    new_adjustment.is_dirty = True
                    db.add(new_adjustment)
            except _ItemNotFound:
                return jsonify({"error": "Item not found"}), 404
            except _InsufficientStock:
                return jsonify({"error": "Stock quantity cannot become negative."}), 400

            db.refresh(new_adjustment)
            return jsonify(model_to_dict(new_adjustment)), 201
        except Exception as e:
            db.rollback()
            logging.exception("Error creating stock adjustment")
            return jsonify({"error": str(e)}), 500

@inventory_bp.route('/items/<string:item_uuid>/adjustments', methods=['GET'])
def get_item_adjustments(item_uuid):
    with get_db() as db:
        adjustments = db.query(StockAdjustment).filter(StockAdjustment.item_uuid == item_uuid).all()
        return jsonify([model_to_dict(a) for a in adjustments])

@inventory_bp.route('/adjustments/history', methods=['GET'])
def get_adjustments_history():
    """
    Get global stock adjustment history.
    """
    org_uuid = request.args.get('org_uuid')
    user_uuid = request.args.get('user_uuid')

    with get_db() as db:
        query = db.query(StockAdjustment).join(InventoryItem, StockAdjustment.item_uuid == InventoryItem.uuid)

        if org_uuid:
            query = query.filter(StockAdjustment.organization_uuid == org_uuid)
        elif user_uuid:
            query = query.filter(StockAdjustment.user_uuid == user_uuid)

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
