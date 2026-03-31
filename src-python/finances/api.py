from flask import Blueprint, request, jsonify
from utils import inject_db_session, get_db
from finances.finances import (
    calculate_dashboard_stats,
    confirm_and_issue_invoice,
    apply_payment_to_invoice
)
from models import Payment, Invoice, Project
from schemas import PaymentCreate, FinanceStatsSchema
from pydantic import ValidationError
from serializer import model_to_dict
import logging

logger = logging.getLogger(__name__)

finances_bp = Blueprint('finances_bp', __name__, url_prefix='/finances')

@finances_bp.route('/stats', methods=['GET'])
@inject_db_session
def get_stats(db):
    """
    Get Finance Dashboard statistics.
    """
    org_uuid = request.args.get('org_uuid')
    branch_uuid = request.args.get('branch_uuid')

    if not org_uuid:
        return jsonify({"error": "org_uuid is required"}), 400

    stats = calculate_dashboard_stats(db, org_uuid, branch_uuid)
    return jsonify(stats), 200

@finances_bp.route('/invoices/<string:invoice_uuid>/confirm', methods=['POST'])
@inject_db_session
def confirm_invoice(db, invoice_uuid):
    """
    Confirm and issue an invoice.
    """
    user_uuid = request.args.get('user_uuid')
    if not user_uuid:
        return jsonify({"error": "user_uuid is required"}), 400

    result, status_code = confirm_and_issue_invoice(db, invoice_uuid, user_uuid)
    return jsonify(result), status_code

@finances_bp.route('/payments', methods=['GET'])
@inject_db_session
def get_payments(db):
    """
    Get payment history with filtering.
    """
    org_uuid = request.args.get('org_uuid')
    branch_uuid = request.args.get('branch_uuid')
    invoice_uuid = request.args.get('invoice_uuid')

    query = db.query(Payment)

    # Filter by org/branch via Join
    if org_uuid or branch_uuid:
        query = query.join(Invoice, Payment.invoice_uuid == Invoice.uuid) \
                     .join(Project, Invoice.project_uuid == Project.uuid)
        if org_uuid:
            query = query.filter(Project.organization_uuid == org_uuid)
        if branch_uuid:
            query = query.filter(Project.branch_uuid == branch_uuid)

    if invoice_uuid:
        query = query.filter(Payment.invoice_uuid == invoice_uuid)

    payments = query.order_by(Payment.created_at.desc()).all()
    results = []
    for p in payments:
        d = model_to_dict(p)
        # Add basic invoice/project info for UI context
        inv = db.query(Invoice).filter(Invoice.uuid == p.invoice_uuid).first()
        if inv:
            d['invoice_id'] = inv.invoice_id
            proj = db.query(Project).filter(Project.uuid == inv.project_uuid).first()
            if proj:
                d['project_name'] = proj.customer.full_name if proj.customer else "N/A"
                d['customer_name'] = proj.customer.full_name if proj.customer else "N/A"
        results.append(d)

    return jsonify(results), 200

@finances_bp.route('/payments/<string:payment_uuid>', methods=['DELETE'])
@inject_db_session
def delete_payment(db, payment_uuid):
    """
    Delete a payment and re-evaluate invoice status.
    """
    payment = db.query(Payment).filter(Payment.uuid == payment_uuid).first()
    if not payment:
        return jsonify({"error": "Payment not found"}), 404

    invoice_uuid = payment.invoice_uuid
    try:
        db.delete(payment)
        db.flush()

        if invoice_uuid:
            apply_payment_to_invoice(db, invoice_uuid)

        db.commit()
        return jsonify({"message": "Payment deleted and invoice updated"}), 200
    except Exception as e:
        db.rollback()
        logger.exception(f"Failed to delete payment {payment_uuid}")
        return jsonify({"error": str(e)}), 500

@finances_bp.route('/payments', methods=['POST'])
def create_finance_payment():
    """
    Create a payment and update the associated invoice status as a single transaction.
    """
    try:
        validated_data = PaymentCreate(**request.json)
    except ValidationError as e:
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        try:
            # 1. Create the payment
            new_payment = Payment(**validated_data.dict(exclude_unset=True))
            db.add(new_payment)
            db.flush()

            # 2. Update the invoice status
            if new_payment.invoice_uuid:
                apply_payment_to_invoice(db, new_payment.invoice_uuid)

            db.commit()
            return jsonify(model_to_dict(new_payment)), 201

        except Exception as e:
            logger.exception(f"Failed to process payment for invoice {getattr(new_payment, 'invoice_uuid', 'unknown')}")
            db.rollback()
            return jsonify({"error": "An error occurred while processing the payment."}), 500
