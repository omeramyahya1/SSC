from flask import Blueprint, request, jsonify
from utils import get_db
from models import Project, ProjectComponent, InventoryItem, User, Authentication
from recommender.recommender import generate_recommendations
from serializer import model_to_dict

recommender_bp = Blueprint('recommender_bp', __name__, url_prefix='/recommendations')

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

def _get_recommender_scope(user):
    if user.organization_uuid:
        return {
            "org_uuid": user.organization_uuid,
            "branch_uuid": user.branch_uuid,
            "user_uuid": None
        }
    return {
        "org_uuid": None,
        "branch_uuid": None,
        "user_uuid": user.uuid
    }

@recommender_bp.route('/projects/<string:project_uuid>/recommend', methods=['POST'])
def recommend_components(project_uuid):
    """
    Endpoint to generate and save recommended components for a project.
    """
    ble_results = request.json
    if not ble_results:
        return jsonify({"error": "Missing BLE results in payload"}), 400

    with get_db() as db:
        current_user, error_response = _get_current_user(db)
        if error_response:
            return error_response
        scope = _get_recommender_scope(current_user)

        project = db.query(Project).filter(Project.uuid == project_uuid).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        recommendations = generate_recommendations(db, ble_results, scope)

        # Clear previous components for this project to provide a fresh recommendation slate
        db.query(ProjectComponent).filter(
            ProjectComponent.project_uuid == project_uuid,
            ProjectComponent.is_recommended.is_(True)
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
