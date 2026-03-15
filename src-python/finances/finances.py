from sqlalchemy import func
from sqlalchemy.orm import Session
from models import Invoice, Payment, InventoryItem, ProjectComponent, StockAdjustment, Project
from datetime import datetime
from typing import Optional

def calculate_dashboard_stats(db: Session, organization_uuid: str, branch_uuid: Optional[str] = None):
    """
    Calculate Finance Dashboard statistics.
    """
    # 1. Aggregate Total Revenue (Sum of all payments)
    revenue_query = db.query(func.sum(Payment.amount)) \
        .join(Invoice, Payment.invoice_uuid == Invoice.uuid) \
        .filter(Invoice.organization_uuid == organization_uuid)
    
    if branch_uuid:
        revenue_query = revenue_query.filter(Invoice.branch_uuid == branch_uuid)
    
    total_revenue = revenue_query.scalar() or 0.0

    # 2. Outstanding Invoices (Total Invoice Amount - Total Paid)
    invoice_total_query = db.query(func.sum(Invoice.amount)) \
        .filter(Invoice.organization_uuid == organization_uuid)
    
    if branch_uuid:
        invoice_total_query = invoice_total_query.filter(Invoice.branch_uuid == branch_uuid)
    
    total_invoice_amount = invoice_total_query.scalar() or 0.0
    outstanding_invoices = total_invoice_amount - total_revenue

    # 3. Inventory Value (Asset Value: Sum of buy_price * quantity_on_hand)
    inventory_query = db.query(func.sum(InventoryItem.buy_price * InventoryItem.quantity_on_hand)) \
        .filter(InventoryItem.organization_uuid == organization_uuid)
    
    if branch_uuid:
        inventory_query = inventory_query.filter(InventoryItem.branch_uuid == branch_uuid)
    
    inventory_value = inventory_query.scalar() or 0.0

    return {
        "total_revenue": float(total_revenue),
        "outstanding_invoices": float(outstanding_invoices),
        "inventory_value": float(inventory_value)
    }

def execute_stock_deduction(db: Session, invoice_uuid: str, user_uuid: str):
    """
    Iterate through ProjectComponents and generate StockAdjustment records.
    Deducts stock from InventoryItem.
    """
    invoice = db.query(Invoice).filter(Invoice.uuid == invoice_uuid).first()
    if not invoice:
        raise ValueError("Invoice not found")

    # Get components associated with the project
    components = db.query(ProjectComponent).filter(ProjectComponent.project_uuid == invoice.project_uuid).all()

    for component in components:
        item = db.query(InventoryItem).filter(InventoryItem.uuid == component.item_uuid).first()
        if not item:
            continue

        # Deduct stock
        item.quantity_on_hand -= component.quantity
        item.is_dirty = True

        # Create StockAdjustment record
        adjustment = StockAdjustment(
            organization_uuid=item.organization_uuid,
            branch_uuid=item.branch_uuid,
            item_uuid=item.uuid,
            adjustment=-component.quantity,
            reason=f"Deduction for Invoice {invoice.invoice_id}",
            user_uuid=user_uuid,
            is_dirty=True
        )
        db.add(adjustment)

def confirm_and_issue_invoice(db: Session, invoice_uuid: str, user_uuid: str):
    """
    Critical: Confirms and issues an invoice, locking its status and triggering stock deduction.
    """
    # Use the session passed (which is already in a transaction if called from get_db)
    invoice = db.query(Invoice).filter(Invoice.uuid == invoice_uuid).first()
    if not invoice:
        return {"error": "Invoice not found"}, 404
    
    if invoice.status != "pending":
        return {"error": "Only pending invoices can be confirmed"}, 400

    # Update Invoice Status
    invoice.status = "pending" # Keep as pending or transition to partial/paid if there are payments?
    # Usually 'Issuing' means it's ready for payment.
    invoice.issued_at = datetime.utcnow()
    invoice.is_dirty = True

    # Trigger Stock Deduction
    try:
        execute_stock_deduction(db, invoice_uuid, user_uuid)
    except Exception as e:
        db.rollback()
        return {"error": f"Stock deduction failed: {str(e)}"}, 500

    return {"message": "Invoice confirmed and stock deducted successfully"}, 200

def apply_payment_to_invoice(db: Session, invoice_uuid: str):
    """
    Handle "Partial" vs "Paid" status transitions based on total payments vs invoice total.
    """
    invoice = db.query(Invoice).filter(Invoice.uuid == invoice_uuid).first()
    if not invoice:
        raise ValueError("Invoice not found")

    # Calculate total paid
    total_paid = db.query(func.sum(Payment.amount)).filter(Payment.invoice_uuid == invoice_uuid).scalar() or 0.0

    if total_paid >= invoice.amount:
        invoice.status = "paid"
    elif total_paid > 0:
        invoice.status = "partial"
    else:
        invoice.status = "pending"

    invoice.is_dirty = True
    return invoice.status
