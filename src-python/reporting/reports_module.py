import io
import pandas as pd
import xlsxwriter
from datetime import datetime, timedelta
from sqlalchemy import func, and_, or_
from sqlalchemy.orm import joinedload
from models import Invoice, Payment, Project, Customer, User, Branch, InventoryItem, ProjectComponent, StockAdjustment
from decimal import Decimal
import json

def get_finance_report_data(db, org_uuid=None, branch_uuid=None, user_uuid=None, start_date=None, end_date=None, lang='en'):
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
        joinedload(Invoice.payments).joinedload(Payment.created_by_user),
        joinedload(Invoice.project).joinedload(Project.project_components).joinedload(ProjectComponent.item)
    ).all()

    raw_data = []
    payments_data = []
    total_revenue = Decimal('0.0')
    total_invoiced = Decimal('0.0')
    total_cogs = Decimal('0.0')
    total_discounts = Decimal('0.0')
    cycle_times = []

    state_performance = {}
    branch_performance = {}
    method_breakdown = {}
    user_breakdown = {}

    # Load geo data for state mapping
    from routes.export import _load_geo_data
    geo_df = _load_geo_data()

    for inv in invoices:
        # Calculate Paid Amount
        paid_amount = Decimal('0.0')
        for p in inv.payments:
            if p.deleted_at is None:
                paid_amount += p.amount
                method = p.method or "Other"
                method_breakdown[method] = method_breakdown.get(method, Decimal('0.0')) + p.amount

                creator = p.created_by_user.username if p.created_by_user else "N/A"
                user_breakdown[creator] = user_breakdown.get(creator, Decimal('0.0')) + p.amount

                payments_data.append({
                    "Payment ID": f"{p.payment_id:05d}",
                    "Date": p.payment_date.strftime('%d-%m-%Y') if p.payment_date else p.created_at.strftime('%d-%m-%Y'),
                    "Method": method,
                    "Amount": float(p.amount),
                    "Reference": p.payment_reference or "",
                    "Created By": creator,
                    "Invoice No.": f"{inv.invoice_id:05d}" if inv.invoice_id else "N/A"
                })

        total_revenue += paid_amount
        total_invoiced += (inv.amount or Decimal('0.0'))

        # Calculate COGS
        inv_cogs = Decimal('0.0')
        if inv.project:
            for comp in inv.project.project_components:
                buy_price = Decimal(str(comp.item.buy_price or 0)) if comp.item else Decimal('0.0')
                inv_cogs += buy_price * Decimal(str(comp.quantity))
        total_cogs += inv_cogs

        # Discounts
        details = inv.invoice_details or {}
        discount_pct = Decimal(str(details.get('discount_percent') or 0))
        subtotal = (inv.amount or Decimal('0.0')) / (1 - (discount_pct / 100)) if discount_pct < 100 else inv.amount
        discount_amount = subtotal - (inv.amount or Decimal('0.0'))
        total_discounts += discount_amount

        # Cycle Time
        if inv.status == 'paid' and inv.payments:
            last_payment = max((p.payment_date or p.created_at for p in inv.payments if p.deleted_at is None), default=None)
            if last_payment and inv.project.created_at:
                diff = last_payment - inv.project.created_at
                cycle_times.append(diff.total_seconds() / 86400.0) # In days

        # State Mapping
        loc = inv.project.project_location or ""
        state = "Other"
        if loc and not geo_df.empty:
            parts = [p.strip().lower() for p in loc.split(',')]
            if len(parts) >= 2:
                city_en, state_en = parts[0], parts[1]
                match = geo_df[(geo_df['city'].str.lower() == city_en) | (geo_df['state'].str.lower() == state_en)]
                if not match.empty:
                    state = match.iloc[0]['state_ar' if lang == 'ar' else 'state']
            elif len(parts) == 1:
                match = geo_df[geo_df['city'].str.lower() == parts[0]]
                if not match.empty:
                    state = match.iloc[0]['state_ar' if lang == 'ar' else 'state']

        state_performance[state] = state_performance.get(state, Decimal('0.0')) + (inv.amount or Decimal('0.0'))

        br_name = inv.project.branch.name if inv.project.branch else "Main"
        branch_performance[br_name] = branch_performance.get(br_name, Decimal('0.0')) + (inv.amount or Decimal('0.0'))

        raw_data.append({
            "Invoice No.": f"{inv.invoice_id:05d}" if inv.invoice_id else "N/A",
            "Date": inv.issued_at.strftime('%d-%m-%Y') if inv.issued_at else "Pending",
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
        "Total Discounts": round(float(total_discounts), 2),
        "Avg Sale Cycle (Days)": round(avg_cycle, 1),
        "Outstanding": float(total_invoiced - total_revenue)
    }

    return {
        "summary": summary,
        "raw_data": raw_data,
        "payments_data": payments_data,
        "state_performance": {k: float(v) for k, v in state_performance.items()},
        "method_breakdown": {k: float(v) for k, v in method_breakdown.items()},
        "user_breakdown": {k: float(v) for k, v in user_breakdown.items()},
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
            "Name": item.name,
            "Category": item.category.name if item.category else "Uncategorized",
            "Threshold": item.low_stock_threshold,
            "Brand": item.brand or "",
            "Buy Price": float(item.buy_price or 0),
            "Sell Price": float(item.sell_price or 0),
            "Status": "Low Stock" if is_low else "OK",
            "Stock": item.quantity_on_hand
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
            "Date": adj.created_at.strftime('%d-%m-%Y %H:%M'),
            "Item": adj.item.name if adj.item else "Unknown",
            "Adjustment": adj.adjustment,
            "Reason": adj.reason or "Manual",
            "User": adj.user.username if adj.user else "System"
        })

    summary = {
        "Total Stock Value (Cost)": float(total_value_buy),
        "Total Potential Revenue": float(total_value_sell),
        "Total Movements in Period": len(movements),
        "Critical Items": critical_items
    }

    return {
        "summary": summary,
        "current_stock": current_stock,
        "movements": movements
    }

def generate_excel_report(data, report_type='finance', lang='en', t=None):
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})

    # Formats
    is_rtl = lang == 'ar'
    header_fmt = workbook.add_format({
        'bold': True,
        'bg_color': '#3b82f6',
        'font_color': 'white',
        'border': 1,
        'reading_order': 2 if is_rtl else 1,
        'align': 'right' if is_rtl else 'left'
    })
    metric_fmt = workbook.add_format({
        'bold': True,
        'font_size': 12,
        'reading_order': 2 if is_rtl else 1,
        'align': 'right' if is_rtl else 'left'
    })
    title_fmt = workbook.add_format({
        'bold': True,
        'font_size': 14,
        'font_color': '#3b82f6',
        'reading_order': 2 if is_rtl else 1,
        'align': 'right' if is_rtl else 'left'
    })
    cell_fmt = workbook.add_format({
        'reading_order': 2 if is_rtl else 1,
        'align': 'right' if is_rtl else 'left'
    })
    num_fmt = workbook.add_format({
        'num_format': '#,##0.00',
        'reading_order': 2 if is_rtl else 1,
        'align': 'right' if is_rtl else 'left'
    })

    currency_symbol = t.get('currency_label', 'SDG') if t else 'SDG'

    if report_type == 'finance':
        # Sheet 1: Summary
        summary_sheet = workbook.add_worksheet(t.get('summary', 'Summary') if t else 'Summary')
        if is_rtl: summary_sheet.right_to_left()

        summary_sheet.write(0, 0, t.get('finance_title', 'Finance Performance Report') if t else 'Finance Performance Report', title_fmt)

        row = 2
        for k, v in data['summary'].items():
            # Translate key if possible
            key_map = {
                "Total Revenue": "total_revenue",
                "Total Invoiced": "total_invoiced",
                "Gross Profit": "gross_profit",
                "Total Discounts": "total_discounts",
                "Avg Sale Cycle (Days)": "avg_sale_cycle",
                "Outstanding": "outstanding"
            }
            label = t.get(key_map.get(k, k), k) if t else k
            summary_sheet.write(row, 0, label, cell_fmt)
            summary_sheet.write(row, 1, v, num_fmt if isinstance(v, (int, float)) else metric_fmt)
            row += 1

        # Revenue by State Table
        row += 1
        summary_sheet.write(row, 0, t.get('performance_metrics', 'Revenue by State') if t else 'Revenue by State', header_fmt)
        row += 1
        for state, val in data['state_performance'].items():
            summary_sheet.write(row, 0, state, cell_fmt)
            summary_sheet.write(row, 1, val, num_fmt)
            row += 1

        # Sheet 2: Invoices Detail
        raw_sheet = workbook.add_worksheet(t.get('invoices_detail', 'Invoices Detail') if t else 'Invoices Detail')
        if is_rtl: raw_sheet.right_to_left()

        if data['raw_data']:
            headers = list(data['raw_data'][0].keys())
            for col, h in enumerate(headers):
                # Translate headers
                header_key = h.lower().replace(' ', '_').replace('.', '')
                label = t.get('table', {}).get(header_key, h) if t else h
                raw_sheet.write(0, col, label, header_fmt)

            for row_idx, entry in enumerate(data['raw_data']):
                for col_idx, h in enumerate(headers):
                    val = entry[h]
                    fmt = num_fmt if isinstance(val, (int, float)) and h not in ["Invoice No.", "Date"] else cell_fmt
                    raw_sheet.write(row_idx + 1, col_idx, val, fmt)

        # Sheet 3: Payments Detail
        pay_sheet = workbook.add_worksheet(t.get('payments_detail', 'Payments Detail') if t else 'Payments Detail')
        if is_rtl: pay_sheet.right_to_left()

        if data['payments_data']:
            headers = list(data['payments_data'][0].keys())
            for col, h in enumerate(headers):
                header_key = h.lower().replace(' ', '_').replace('.', '')
                label = t.get('table', {}).get(header_key, h) if t else h
                pay_sheet.write(0, col, label, header_fmt)

            for row_idx, entry in enumerate(data['payments_data']):
                for col_idx, h in enumerate(headers):
                    val = entry[h]
                    fmt = num_fmt if isinstance(val, (int, float)) and h not in ["Payment ID", "Date"] else cell_fmt
                    pay_sheet.write(row_idx + 1, col_idx, val, fmt)

    else: # Inventory
        summary_sheet = workbook.add_worksheet(t.get('summary', 'Summary') if t else 'Summary')
        if is_rtl: summary_sheet.right_to_left()

        summary_sheet.write(0, 0, t.get('inventory_title', 'Inventory Status Report') if t else 'Inventory Status Report', title_fmt)
        row = 2
        for k, v in data['summary'].items():
            key_map = {
                "Total Stock Value (Cost)": "total_stock_value",
                "Total Potential Revenue": "total_potential_revenue",
                "Total Movements in Period": "total_movements",
                "Critical Items": "critical_items"
            }
            label = t.get(key_map.get(k, k), k) if t else k
            summary_sheet.write(row, 0, label, cell_fmt)
            summary_sheet.write(row, 1, v, num_fmt if isinstance(v, (int, float)) else metric_fmt)
            row += 1

        # Stock Sheet
        stock_sheet = workbook.add_worksheet(t.get('stock_detail', 'Current Stock') if t else 'Current Stock')
        if is_rtl: stock_sheet.right_to_left()

        if data['current_stock']:
            headers = list(data['current_stock'][0].keys())
            for col, h in enumerate(headers):
                header_key = h.lower().replace(' ', '_')
                label = t.get('table', {}).get(header_key, h) if t else h
                stock_sheet.write(0, col, label, header_fmt)
            for row_idx, entry in enumerate(data['current_stock']):
                for col_idx, h in enumerate(headers):
                    val = entry[h]
                    fmt = num_fmt if isinstance(val, (int, float)) and h != "Threshold" else cell_fmt
                    stock_sheet.write(row_idx + 1, col_idx, val, fmt)

        # Movements Sheet
        move_sheet = workbook.add_worksheet(t.get('movements_history', 'Movements History') if t else 'Movements History')
        if is_rtl: move_sheet.right_to_left()

        if data['movements']:
            headers = list(data['movements'][0].keys())
            for col, h in enumerate(headers):
                header_key = h.lower().replace(' ', '_')
                label = t.get('table', {}).get(header_key, h) if t else h
                move_sheet.write(0, col, label, header_fmt)
            for row_idx, entry in enumerate(data['movements']):
                for col_idx, h in enumerate(headers):
                    val = entry[h]
                    fmt = num_fmt if isinstance(val, (int, float)) else cell_fmt
                    move_sheet.write(row_idx + 1, col_idx, val, fmt)

    workbook.close()
    output.seek(0)
    return output
