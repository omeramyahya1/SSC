from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db
from models import SyncLog
from schemas import SyncLogCreate, SyncLogUpdate
from serializer import model_to_dict

sync_log_bp = Blueprint('sync_log_bp', __name__, url_prefix='/sync_logs')

@sync_log_bp.route('/', methods=['POST'])
def create_sync_log():
    try:
        validated_data = SyncLogCreate(**request.json)
    except ValidationError as e:
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        new_item = SyncLog(**validated_data.dict())
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return jsonify(model_to_dict(new_item)), 201

@sync_log_bp.route('/', methods=['GET'])
def get_all_sync_logs():
    with get_db() as db:
        items = db.query(SyncLog).all()
        return jsonify([model_to_dict(i) for i in items])