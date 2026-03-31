from sqlalchemy import func
from sqlalchemy.orm import Session
from models import Invoice, Payment, InventoryItem, ProjectComponent, StockAdjustment, Project
from datetime import datetime
from typing import Optional

def calculate_dashboard_stats(db: Session, organization_uuid: str, branch_uuid: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None):
    """
    Calculate Finance Dashboard statistics with optional date filtering.
    """
    # 1. Aggregate Total Revenue (Sum of all payments within range)
    revenue_query = db.query(func.sum(Payment.amount)) \
        .join(Invoice, Payment.invoice_uuid == Invoice.uuid) \
        .join(Project, Invoice.project_uuid == Project.uuid) \
        .filter(Project.organization_uuid == organization_uuid)

    if branch_uuid:
        revenue_query = revenue_query.filter(Project.branch_uuid == branch_uuid)
    
    if start_date:
        revenue_query = revenue_query.filter(Payment.created_at >= datetime.fromisoformat(start_date))
    if end_date:
        revenue_query = revenue_query.filter(Payment.created_at <= datetime.fromisoformat(end_date))

    total_revenue = revenue_query.scalar() or 0.0

    # 2. Total Invoices Amount (Sum of all invoices issued within range)
    invoice_total_query = db.query(func.sum(Invoice.amount)) \
        .join(Project, Invoice.project_uuid == Project.uuid) \
        .filter(Project.organization_uuid == organization_uuid) \
        .filter(Invoice.issued_at != None)

    if branch_uuid:
        invoice_total_query = invoice_total_query.filter(Project.branch_uuid == branch_uuid)
    
    if start_date:
        invoice_total_query = invoice_total_query.filter(Invoice.issued_at >= datetime.fromisoformat(start_date))
    if end_date:
        invoice_total_query = invoice_total_query.filter(Invoice.issued_at <= datetime.fromisoformat(end_date))

    total_invoice_amount = invoice_total_query.scalar() or 0.0
    
    # Outstanding = Total Amount of Invoices issued in range - Revenue from those same invoices?
    # Actually, usually "Outstanding" on a dashboard means "Total currently unpaid for invoices issued in range"
    # To keep it simple and consistent with the previous logic:
    outstanding_invoices = total_invoice_amount - total_revenue

    # 3. Inventory Value (Asset Value: Sum of buy_price * quantity_on_hand)
    # Note: Inventory is usually a snapshot of current value, not historical range
    inventory_query = db.query(func.sum(InventoryItem.buy_price * InventoryItem.quantity_on_hand)) \
        .filter(InventoryItem.organization_uuid == organization_uuid)

    if branch_uuid:
        inventory_query = inventory_query.filter(InventoryItem.branch_uuid == branch_uuid)

    inventory_value = inventory_query.scalar() or 0.0

    return {
        "total_revenue": float(total_revenue),
        "outstanding_invoices": float(max(0, outstanding_invoices)),
        "inventory_value": float(inventory_value)
    }

def execute_stock_deduction(db: Session, invoice_uuid: str, user_uuid: str):
    """
    Iterate through ProjectComponents and generate StockAdjustment records.
    Deducts stock from InventoryItem.
    Raises ValueError if stock is insufficient.
    """
    invoice = db.query(Invoice).filter(Invoice.uuid == invoice_uuid).first()
    if not invoice:
        raise ValueError("Invoice not found")

    # Get components associated with the project
    components = db.query(ProjectComponent).filter(ProjectComponent.project_uuid == invoice.project_uuid).all()

    for component in components:
        # Use with_for_update() to lock the row during the transaction
        item = db.query(InventoryItem).filter(InventoryItem.uuid == component.item_uuid).with_for_update().first()
        if not item:
            continue

        if item.quantity_on_hand < component.quantity:
            raise ValueError(f"Insufficient stock for item: {item.name}. Available: {item.quantity_on_hand}, Required: {component.quantity}")

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

def reverse_stock_deduction(db: Session, invoice_uuid: str, user_uuid: str):
    """
    Reverses stock deductions for a deleted or voided invoice.
    Adds back quantities to InventoryItem and creates 'Reversal' StockAdjustment records.
    """
    invoice = db.query(Invoice).filter(Invoice.uuid == invoice_uuid).first()
    if not invoice:
        return

    # Get components associated with the project
    components = db.query(ProjectComponent).filter(ProjectComponent.project_uuid == invoice.project_uuid).all()

    for component in components:
        item = db.query(InventoryItem).filter(InventoryItem.uuid == component.item_uuid).with_for_update().first()
        if not item:
            continue

        # Add back stock
        item.quantity_on_hand += component.quantity
        item.is_dirty = True

        # Create Reversal StockAdjustment record
        adjustment = StockAdjustment(
            organization_uuid=item.organization_uuid,
            branch_uuid=item.branch_uuid,
            item_uuid=item.uuid,
            adjustment=component.quantity,
            reason=f"Reversal for Deleted Invoice {invoice.invoice_id}",
            user_uuid=user_uuid,
            is_dirty=True
        )
        db.add(adjustment)

def snapshot_project_components(db: Session, project_uuid: str):
    """
    Explicitly snapshots the current InventoryItem.sell_price into ProjectComponent.price_at_sale.
    This ensures that the invoice record maintains the price at the time of issuance,
    avoiding "joining" to the current inventory price which may change over time.
    """
    components = db.query(ProjectComponent).filter(ProjectComponent.project_uuid == project_uuid).all()
    for component in components:
        # Fetch the current inventory price for the item
        item = db.query(InventoryItem).filter(InventoryItem.uuid == component.item_uuid).first()
        if item:
            # We copy the price only if it wasn't already manually set (e.g., by the user in the editor)
            # or if we want to ensure it's finalized at issuance.
            if component.price_at_sale is None:
                component.price_at_sale = item.sell_price
                component.is_dirty = True
        else:
            # Optional: handle case where item no longer exists in inventory
            pass

def confirm_and_issue_invoice(db: Session, invoice_uuid: str, user_uuid: str):
    """
    Confirms and issues an invoice, snapshotting components and triggering stock deduction.
    """
    invoice = db.query(Invoice).filter(Invoice.uuid == invoice_uuid).first()
    if not invoice:
        return {"error": "Invoice not found"}, 404

    if invoice.status != "pending":
        return {"error": "Only pending invoices can be confirmed"}, 400

    # 1. Snapshot prices to lock data integrity
    snapshot_project_components(db, invoice.project_uuid)

    # 2. Update Invoice Status/Date
    invoice.issued_at = datetime.utcnow()
    invoice.is_dirty = True

    # 3. Trigger Stock Deduction (Defaulting to ON_ISSUE as per current requirements)
    try:
        execute_stock_deduction(db, invoice_uuid, user_uuid)
    except ValueError as e:
        # Ensure we rollback partial changes (like issued_at) if deduction fails
        db.rollback()
        return {"error": str(e)}, 400
    except Exception as e:
        db.rollback()
        return {"error": f"Stock deduction failed: {str(e)}"}, 500

    return {"message": "Invoice confirmed and stock deducted successfully"}, 200

def apply_payment_to_invoice(db: Session, invoice_uuid: str):
    """
    Update "Partial" vs "Paid" status transitions based on total payments.
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
        # If it was issued, it stays as is or pending
        if invoice.issued_at:
             invoice.status = "pending" # Or keep current if we don't want to revert issued state
        else:
             invoice.status = "pending"

    invoice.is_dirty = True
    return invoice.status
