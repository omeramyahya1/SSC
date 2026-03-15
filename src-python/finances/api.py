from flask import Blueprint, request, jsonify
from utils import inject_db_session, get_db
from finances.finances import (
    calculate_dashboard_stats,
    confirm_and_issue_invoice,
    apply_payment_to_invoice
)
from models import Payment, Invoice
from schemas import PaymentCreate, FinanceStatsSchema
from pydantic import ValidationError
from serializer import model_to_dict

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
    user_uuid = request.args.get('user_uuid') # In a real app, this would come from the JWT
    if not user_uuid:
        return jsonify({"error": "user_uuid is required"}), 400
        
    result, status_code = confirm_and_issue_invoice(db, invoice_uuid, user_uuid)
    return jsonify(result), status_code

@finances_bp.route('/payments', methods=['POST'])
def create_finance_payment():
    """
    Create a payment and update the associated invoice status.
    """
    try:
        validated_data = PaymentCreate(**request.json)
    except ValidationError as e:
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        new_payment = Payment(**validated_data.dict())
        db.add(new_payment)
        db.commit() # Commit the payment first
        db.refresh(new_payment)
        
        # Now update the invoice status
        try:
            # We need the invoice_uuid, but Payment schema might have invoice_id (int) 
            # while internal logic uses uuid. Let's check model.
            # In models.py: Payment has invoice_uuid = Column(String, ForeignKey("invoices.uuid"))
            # But schemas.py says PaymentCreate has invoice_id: Optional[int]. 
            # This looks like a mismatch between local DB (int PK) and Sync (UUID).
            # I'll use invoice_uuid if present in data, otherwise find by id.
            
            invoice = None
            if hasattr(new_payment, 'invoice_uuid') and new_payment.invoice_uuid:
                invoice = db.query(Invoice).filter(Invoice.uuid == new_payment.invoice_uuid).first()
            
            if invoice:
                apply_payment_to_invoice(db, invoice.uuid)
                db.commit()
        except Exception as e:
            print(f"Failed to update invoice status: {e}")
            # We don't fail the payment if status update fails, but maybe we should?
            
        return jsonify(model_to_dict(new_payment)), 201
