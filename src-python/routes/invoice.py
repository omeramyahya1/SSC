from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from sqlalchemy import func
from utils import get_db
from models import Invoice, Project, Customer, Payment
from finances.finances import reverse_stock_deduction
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
            existing = None
            if validated_data.project_uuid:
                existing = db.query(Invoice).filter(Invoice.project_uuid == validated_data.project_uuid).first()
            if existing:
                return jsonify(model_to_dict(existing)), 200
            new_item = Invoice(**validated_data.dict(exclude_unset=True))
            new_item.is_dirty = True
            db.add(new_item)
            db.commit()
            db.refresh(new_item)
            return jsonify(model_to_dict(new_item)), 201
        except Exception as e:
            db.rollback()
            logging.exception("Error creating invoice")
            return jsonify({"error": "Internal server error"}), 500

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
        org_uuid = request.args.get('org_uuid')
        branch_uuid = request.args.get('branch_uuid')
        status = request.args.get('status')

        query = db.query(Invoice).join(Project, Invoice.project_uuid == Project.uuid).join(Customer, Project.customer_uuid == Customer.uuid)

        if org_uuid:
            query = query.filter(Project.organization_uuid == org_uuid)
        if branch_uuid:
            query = query.filter(Project.branch_uuid == branch_uuid)
        if project_uuid:
            query = query.filter(Invoice.project_uuid == project_uuid)
        if status:
            query = query.filter(Invoice.status == status)

        items = query.all()
        results = []
        for i in items:
            d = model_to_dict(i)
            # Add Customer Info
            if i.project and i.project.customer:
                d['customer_name'] = i.project.customer.full_name

            # Add Payment Stats
            paid = db.query(func.sum(Payment.amount)).filter(Payment.invoice_uuid == i.uuid).scalar() or 0.0
            d['paid_amount'] = float(paid)
            d['remainder'] = float((float(i.amount if i.amount else 0.0)) - float(paid))

            # Extract Due Date from JSON
            if i.invoice_details and 'due_date' in i.invoice_details:
                d['due_date'] = i.invoice_details['due_date']

            results.append(d)

        return jsonify(results)

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
    user_uuid = request.args.get('user_uuid')
    with get_db() as db:
        try:
            item = db.query(Invoice).filter(Invoice.uuid == uuid).first()
            if not item:
                return jsonify({"error": "Not found"}), 404

            # Rollback stock if issued
            if item.issued_at and user_uuid:
                reverse_stock_deduction(db, item.uuid, user_uuid)

            db.delete(item)
            db.commit()
            return jsonify({"message": "Deleted successfully"}), 200
        except Exception as e:
            db.rollback()
            logging.exception("Error deleting invoice")
            return jsonify({"error": str(e)}), 500
