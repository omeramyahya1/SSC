import io
import pandas as pd
import xlsxwriter
from datetime import datetime, timedelta
from sqlalchemy import func, and_, or_
from sqlalchemy.orm import joinedload
from models import Invoice, Payment, Project, Customer, User, Branch, InventoryItem, ProjectComponent, StockAdjustment
from decimal import Decimal
import json

def get_finance_report_data(db, org_uuid=None, branch_uuid=None, user_uuid=None, start_date=None, end_date=None):
    """
    Aggregates finance data for reporting.
    """
    query = db.query(Invoice).join(Project, Invoice.project_uuid == Project.uuid)
    
    if org_uuid:
        query = query.filter(Project.organization_uuid == org_uuid)
    if branch_uuid:
        query = query.filter(Project.branch_uuid == branch_uuid)
    if user_uuid:
        query = query.filter(Project.user_uuid == user_uuid)
        
    if start_date:
        query = query.filter(Invoice.issued_at >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.filter(Invoice.issued_at <= datetime.fromisoformat(end_date))
        
    invoices = query.options(
        joinedload(Invoice.project).joinedload(Project.customer),
        joinedload(Invoice.project).joinedload(Project.branch),
        joinedload(Invoice.user),
        joinedload(Invoice.payments),
        joinedload(Invoice.project).joinedload(Project.project_components).joinedload(ProjectComponent.item)
    ).all()
    
    raw_data = []
    total_revenue = Decimal('0.0')
    total_invoiced = Decimal('0.0')
    total_cogs = Decimal('0.0')
    total_discounts = Decimal('0.0')
    cycle_times = []
    
    location_performance = {}
    branch_performance = {}
    
    for inv in invoices:
        # Calculate Paid Amount
        paid_amount = sum((p.amount for p in inv.payments if p.deleted_at is None), Decimal('0.0'))
        total_revenue += paid_amount
        total_invoiced += (inv.amount or Decimal('0.0'))
        
        # Calculate COGS
        inv_cogs = Decimal('0.0')
        if inv.project:
            for comp in inv.project.project_components:
                # Use current buy_price as historical cost isn't snapshotted
                buy_price = Decimal(str(comp.item.buy_price or 0)) if comp.item else Decimal('0.0')
                inv_cogs += buy_price * Decimal(str(comp.quantity))
        total_cogs += inv_cogs
        
        # Discounts
        details = inv.invoice_details or {}
        discount_pct = Decimal(str(details.get('discount_percent') or 0))
        # Assuming inv.amount is after discount if it's the final amount, 
        # but usually it's Subtotal - Discount. 
        # Let's estimate discount amount if pct is given.
        subtotal = (inv.amount or Decimal('0.0')) / (1 - (discount_pct / 100)) if discount_pct < 100 else inv.amount
        discount_amount = subtotal - (inv.amount or Decimal('0.0'))
        total_discounts += discount_amount
        
        # Cycle Time
        if inv.status == 'paid' and inv.payments:
            last_payment = max((p.payment_date or p.created_at for p in inv.payments if p.deleted_at is None), default=None)
            if last_payment and inv.project.created_at:
                diff = last_payment - inv.project.created_at
                cycle_times.append(diff.total_seconds() / 86400.0) # In days
        
        # Aggregates for charts
        loc = inv.project.project_location or "Unknown"
        location_performance[loc] = location_performance.get(loc, Decimal('0.0')) + (inv.amount or Decimal('0.0'))
        
        br_name = inv.project.branch.name if inv.project.branch else "Main"
        branch_performance[br_name] = branch_performance.get(br_name, Decimal('0.0')) + (inv.amount or Decimal('0.0'))
        
        raw_data.append({
            "Invoice ID": f"{inv.invoice_id:05d}" if inv.invoice_id else "N/A",
            "Date": inv.issued_at.strftime('%Y-%m-%d') if inv.issued_at else "Pending",
            "Customer": inv.project.customer.full_name if inv.project.customer else "N/A",
            "Amount": float(inv.amount or 0),
            "Paid": float(paid_amount),
            "Status": inv.status.capitalize(),
            "Branch": br_name,
            "Created By": inv.user.username if inv.user else "N/A",
            "Location": loc,
            "Cycle Time (Days)": round(cycle_times[-1], 1) if inv.status == 'paid' and cycle_times else "N/A"
        })
        
    avg_cycle = sum(cycle_times) / len(cycle_times) if cycle_times else 0
    
    summary = {
        "Total Revenue": float(total_revenue),
        "Total Invoiced": float(total_invoiced),
        "Gross Profit": float(total_invoiced - total_cogs),
        "Total Discounts": float(total_discounts),
        "Avg Sale Cycle (Days)": round(avg_cycle, 1),
        "Outstanding": float(total_invoiced - total_revenue)
    }
    
    return {
        "summary": summary,
        "raw_data": raw_data,
        "location_performance": {k: float(v) for k, v in location_performance.items()},
        "branch_performance": {k: float(v) for k, v in branch_performance.items()}
    }

def get_inventory_report_data(db, org_uuid=None, branch_uuid=None, start_date=None, end_date=None):
    """
    Aggregates inventory data for reporting.
    """
    # Current Stock
    item_query = db.query(InventoryItem)
    if org_uuid:
        item_query = item_query.filter(InventoryItem.organization_uuid == org_uuid)
    if branch_uuid:
        item_query = item_query.filter(InventoryItem.branch_uuid == branch_uuid)
        
    items = item_query.options(joinedload(InventoryItem.category)).all()
    
    current_stock = []
    total_value_buy = Decimal('0.0')
    total_value_sell = Decimal('0.0')
    critical_items = 0
    
    for item in items:
        val_buy = (item.buy_price or Decimal('0.0')) * Decimal(str(item.quantity_on_hand))
        val_sell = (item.sell_price or Decimal('0.0')) * Decimal(str(item.quantity_on_hand))
        total_value_buy += val_buy
        total_value_sell += val_sell
        
        is_low = item.quantity_on_hand <= (item.low_stock_threshold or 0)
        if is_low: critical_items += 1
        
        current_stock.append({
            "SKU": item.sku or "N/A",
            "Name": item.name,
            "Category": item.category.name if item.category else "Uncategorized",
            "Brand": item.brand or "",
            "Stock": item.quantity_on_hand,
            "Threshold": item.low_stock_threshold,
            "Buy Price": float(item.buy_price or 0),
            "Sell Price": float(item.sell_price or 0),
            "Status": "Low Stock" if is_low else "OK"
        })
        
    # Movements
    adj_query = db.query(StockAdjustment).join(InventoryItem, StockAdjustment.item_uuid == InventoryItem.uuid)
    if org_uuid:
        adj_query = adj_query.filter(StockAdjustment.organization_uuid == org_uuid)
    if branch_uuid:
        adj_query = adj_query.filter(StockAdjustment.branch_uuid == branch_uuid)
        
    if start_date:
        adj_query = adj_query.filter(StockAdjustment.created_at >= datetime.fromisoformat(start_date))
    if end_date:
        adj_query = adj_query.filter(StockAdjustment.created_at <= datetime.fromisoformat(end_date))
        
    adjustments = adj_query.options(joinedload(StockAdjustment.item), joinedload(StockAdjustment.user)).all()
    
    movements = []
    for adj in adjustments:
        movements.append({
            "Date": adj.created_at.strftime('%Y-%m-%d %H:%M'),
            "Item": adj.item.name if adj.item else "Unknown",
            "Adjustment": adj.adjustment,
            "Reason": adj.reason or "Manual",
            "User": adj.user.username if adj.user else "System"
        })
        
    summary = {
        "Total Stock Value (Cost)": float(total_value_buy),
        "Total Potential Revenue": float(total_value_sell),
        "Critical Items": critical_items,
        "Total Movements in Period": len(movements)
    }
    
    return {
        "summary": summary,
        "current_stock": current_stock,
        "movements": movements
    }

def generate_excel_report(data, report_type='finance'):
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    
    # Formats
    header_fmt = workbook.add_format({'bold': True, 'bg_color': '#3b82f6', 'font_color': 'white', 'border': 1})
    metric_fmt = workbook.add_format({'bold': True, 'font_size': 12})
    title_fmt = workbook.add_format({'bold': True, 'font_size': 14, 'font_color': '#3b82f6'})
    
    if report_type == 'finance':
        # Sheet 1: Summary & Charts
        summary_sheet = workbook.add_worksheet('Summary')
        summary_sheet.write(0, 0, 'Finance Performance Summary', title_fmt)
        
        row = 2
        for k, v in data['summary'].items():
            summary_sheet.write(row, 0, k)
            summary_sheet.write(row, 1, v, metric_fmt)
            row += 1
            
        # Add Charts
        # Location Chart
        if data['location_performance']:
            loc_data = list(data['location_performance'].items())
            summary_sheet.write(row + 1, 0, 'Revenue by Location', header_fmt)
            chart_row = row + 2
            for i, (loc, val) in enumerate(loc_data):
                summary_sheet.write(chart_row + i, 0, loc)
                summary_sheet.write(chart_row + i, 1, val)
            
            chart = workbook.add_chart({'type': 'pie'})
            chart.add_series({
                'name': 'Revenue by Location',
                'categories': ['Summary', chart_row, 0, chart_row + len(loc_data) - 1, 0],
                'values': ['Summary', chart_row, 1, chart_row + len(loc_data) - 1, 1],
            })
            chart.set_title({'name': 'Revenue by Location'})
            summary_sheet.insert_chart('D2', chart)
            
        # Sheet 2: Raw Data
        raw_sheet = workbook.add_worksheet('Invoices Detail')
        if data['raw_data']:
            headers = list(data['raw_data'][0].keys())
            for col, h in enumerate(headers):
                raw_sheet.write(0, col, h, header_fmt)
            
            for row_idx, entry in enumerate(data['raw_data']):
                for col_idx, h in enumerate(headers):
                    raw_sheet.write(row_idx + 1, col_idx, entry[h])
                    
    else: # Inventory
        summary_sheet = workbook.add_worksheet('Summary')
        summary_sheet.write(0, 0, 'Inventory Summary', title_fmt)
        row = 2
        for k, v in data['summary'].items():
            summary_sheet.write(row, 0, k)
            summary_sheet.write(row, 1, v, metric_fmt)
            row += 1
            
        # Stock Sheet
        stock_sheet = workbook.add_worksheet('Current Stock')
        if data['current_stock']:
            headers = list(data['current_stock'][0].keys())
            for col, h in enumerate(headers):
                stock_sheet.write(0, col, h, header_fmt)
            for row_idx, entry in enumerate(data['current_stock']):
                for col_idx, h in enumerate(headers):
                    stock_sheet.write(row_idx + 1, col_idx, entry[h])
                    
        # Movements Sheet
        move_sheet = workbook.add_worksheet('Movements History')
        if data['movements']:
            headers = list(data['movements'][0].keys())
            for col, h in enumerate(headers):
                move_sheet.write(0, col, h, header_fmt)
            for row_idx, entry in enumerate(data['movements']):
                for col_idx, h in enumerate(headers):
                    move_sheet.write(row_idx + 1, col_idx, entry[h])
                    
    workbook.close()
    output.seek(0)
    return output
