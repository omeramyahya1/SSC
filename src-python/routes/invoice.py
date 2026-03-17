from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db
from models import Invoice
from schemas import InvoiceCreate, InvoiceUpdate
from serializer import model_to_dict
import logging

invoice_bp = Blueprint('invoice_bp', __name__, url_prefix='/invoices')

@invoice_bp.route('/', methods=['POST'])
def create_invoice():
    try:
        validated_data = InvoiceCreate(**request.json)
    except ValidationError as e:
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        try:
            new_item = Invoice(**validated_data.dict(exclude_unset=True))
            new_item.is_dirty = True
            db.add(new_item)
            db.commit()
            db.refresh(new_item)
            return jsonify(model_to_dict(new_item)), 201
        except Exception as e:
            db.rollback()
            logging.exception("Error creating invoice")
            return jsonify({"error": str(e)}), 500

@invoice_bp.route('/<string:uuid>', methods=['PUT'])
def update_invoice(uuid):
    with get_db() as db:
        item = db.query(Invoice).filter(Invoice.uuid == uuid).first()
        if not item:
            return jsonify({"error": "Not found"}), 404

        try:
            validated_data = InvoiceUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        update_data = validated_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)
        
        item.is_dirty = True
        db.commit()
        db.refresh(item)
        return jsonify(model_to_dict(item))

@invoice_bp.route('/', methods=['GET'])
def get_all_invoices():
    with get_db() as db:
        project_uuid = request.args.get('project_uuid')
        query = db.query(Invoice)
        if project_uuid:
            query = query.filter(Invoice.project_uuid == project_uuid)
        
        items = query.all()
        return jsonify([model_to_dict(i) for i in items])

@invoice_bp.route('/<string:uuid>', methods=['GET'])
def get_invoice(uuid):
    with get_db() as db:
        item = db.query(Invoice).filter(Invoice.uuid == uuid).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@invoice_bp.route('/project/<string:project_uuid>', methods=['GET'])
def get_invoice_by_project(project_uuid):
    with get_db() as db:
        item = db.query(Invoice).filter(Invoice.project_uuid == project_uuid).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@invoice_bp.route('/<string:uuid>', methods=['DELETE'])
def delete_invoice(uuid):
    with get_db() as db:
        try:
            item = db.query(Invoice).filter(Invoice.uuid == uuid).first()
            if not item:
                return jsonify({"error": "Not found"}), 404
            db.delete(item)
            db.commit()
            return jsonify({"message": "Deleted successfully"}), 200
        except Exception as e:
            db.rollback()
            logging.exception("Error deleting invoice")
            return jsonify({"error": str(e)}), 500
