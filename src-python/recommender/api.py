from flask import Blueprint, request, jsonify
from utils import get_db
from models import Project, ProjectComponent, InventoryItem
from recommender.recommender import generate_recommendations
from serializer import model_to_dict

recommender_bp = Blueprint('recommender_bp', __name__, url_prefix='/recommendations')

@recommender_bp.route('/projects/<string:project_uuid>/recommend', methods=['POST'])
def recommend_components(project_uuid):
    """
    Endpoint to generate and save recommended components for a project.
    """
    ble_results = request.json
    if not ble_results:
        return jsonify({"error": "Missing BLE results in payload"}), 400

    with get_db() as db:
        project = db.query(Project).filter(Project.uuid == project_uuid).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        recommendations = generate_recommendations(db, ble_results)

        # Clear previous components for this project to provide a fresh recommendation slate
        db.query(ProjectComponent).filter(
            ProjectComponent.project_uuid == project_uuid
        ).delete()

        final_results = []
        for rec in recommendations:
            if "item_uuid" in rec:
                # Find the actual inventory item to ensure it exists
                item = db.query(InventoryItem).filter(InventoryItem.uuid == rec["item_uuid"]).first()
                if item:
                    new_comp = ProjectComponent(
                        project_uuid=project_uuid,
                        item_uuid=item.uuid,
                        quantity=rec["quantity"],
                        price_at_sale=rec["unit_price"],
                        is_recommended=True
                    )
                    new_comp.is_dirty = True
                    db.add(new_comp)
                    db.flush() # To get the uuid for the response
                    
                    rec_response = rec.copy()
                    rec_response["project_component_uuid"] = new_comp.uuid
                    final_results.append(rec_response)
            else:
                # This handles cases where no item was found (it only contains flags/category)
                final_results.append(rec)

        db.commit()
        return jsonify(final_results), 200

@recommender_bp.route('/project-components/<string:component_uuid>', methods=['PATCH'])
def update_component_status(component_uuid):
    """
    Endpoint to handle edits to recommended components.
    When a user edits a recommended component, we set is_recommended to False.
    """
    data = request.json
    with get_db() as db:
        comp = db.query(ProjectComponent).filter(ProjectComponent.uuid == component_uuid).first()
        if not comp:
            return jsonify({"error": "Project component not found"}), 404
        
        # If any data is provided in the PATCH, we assume it's an edit
        # and thus it's no longer a "pure" recommendation.
        comp.is_recommended = False
        
        if data:
            if "quantity" in data:
                comp.quantity = data["quantity"]
            if "price_at_sale" in data:
                comp.price_at_sale = data["price_at_sale"]
            if "item_uuid" in data:
                comp.item_uuid = data["item_uuid"]
            if "custom_name" in data:
                comp.custom_name = data["custom_name"]
        
        comp.is_dirty = True
        db.commit()
        db.refresh(comp)
        d = model_to_dict(comp, include_relationships=True)
        if comp.item:
            d['item'] = model_to_dict(comp.item, include_relationships=True)
        return jsonify(d), 200
