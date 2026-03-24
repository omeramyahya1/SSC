from flask import Blueprint, request, jsonify
from utils import inject_db_session, get_db
from finances.finances import (
    calculate_dashboard_stats,
    confirm_and_issue_invoice,
    apply_payment_to_invoice
)
from models import Payment, Invoice, Authentication
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
            # Using exclude_unset=True to avoid overwriting defaults with Nones
            new_payment = Payment(**validated_data.dict(exclude_unset=True))
            db.add(new_payment)

            # Flush to ensure calculations in apply_payment_to_invoice see the new payment
            db.flush()

            # 2. Identify the linked invoice
            invoice = None
            if hasattr(new_payment, 'invoice_uuid') and new_payment.invoice_uuid:
                invoice = db.query(Invoice).filter(Invoice.uuid == new_payment.invoice_uuid).first()

            # 3. Update the invoice status
            if invoice:
                apply_payment_to_invoice(db, invoice.uuid)

            # Note: get_db() will commit on success when exiting the block
            return jsonify(model_to_dict(new_payment)), 201

        except Exception as e:
            # Record full stack trace and context
            logger.exception(f"Failed to process payment for invoice {getattr(new_payment, 'invoice_uuid', 'unknown')}")
            # Ensure both operations are rolled back
            db.rollback()
            return jsonify({"error": "An error occurred while processing the payment."}), 500
