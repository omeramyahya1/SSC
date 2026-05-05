from flask import Blueprint, request, send_file, jsonify
from utils import get_db
from models import Project, Invoice, ProjectComponent, InventoryItem, SystemConfiguration, Customer
from sqlalchemy.orm import joinedload
import pandas as pd
import io
import json
import os
from datetime import datetime
from jinja2 import Environment, FileSystemLoader

try:
    from weasyprint import HTML
except ImportError:
    HTML = None

export_bp = Blueprint('export_bp', __name__, url_prefix='/export')

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), '..', 'pdf_engine', 'templates')
jinja_env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))

# Basic translations for PDF
TRANSLATIONS = {
    'en': {
        'address': 'Address',
        'email': 'Email',
        'phone': 'Phone No',
        'invoice_no': 'Invoice No',
        'issue_date': 'Issue Date',
        'due_date': 'Due Date',
        'item': 'Item',
        'unit_price': 'Unit Price',
        'qty': 'Qty',
        'total': 'Total',
        'subtotal': 'Subtotal',
        'shipping': 'Shipping',
        'installation': 'Installation',
        'discount': 'Discount',
        'grand_total': 'Total',
        'terms': 'Terms & Conditions',
        'system_config': 'System Configuration Summary'
    },
    'ar': {
        'address': 'العنوان',
        'email': 'البريد الإلكتروني',
        'phone': 'رقم الهاتف',
        'invoice_no': 'رقم الفاتورة',
        'issue_date': 'تاريخ الإصدار',
        'due_date': 'تاريخ الاستحقاق',
        'item': 'البند',
        'unit_price': 'سعر الوحدة',
        'qty': 'الكمية',
        'total': 'المجموع',
        'subtotal': 'المجموع الفرعي',
        'shipping': 'الشحن',
        'installation': 'التركيب',
        'discount': 'الخصم',
        'grand_total': 'الإجمالي',
        'terms': 'الشروط والأحكام',
        'system_config': 'ملخص تهيئة النظام'
    }
}

@export_bp.route('/excel/<string:project_uuid>', methods=['GET'])
def export_excel(project_uuid):
    with get_db() as db:
        project = db.query(Project).filter(Project.uuid == project_uuid).options(
            joinedload(Project.customer),
            joinedload(Project.system_config),
            joinedload(Project.project_components).joinedload(ProjectComponent.item)
        ).first()

        if not project:
            return jsonify({"error": "Project not found"}), 404

        invoice = db.query(Invoice).filter(Invoice.project_uuid == project_uuid).first()

        # Sheet 1: Invoice / Items
        items_data = []
        for comp in project.project_components:
            item_name = comp.item.name if comp.item else comp.custom_name
            brand = comp.item.brand if comp.item else "N/A"
            model = comp.item.model if comp.item else "N/A"
            items_data.append({
                "Item": item_name,
                "Brand": brand,
                "Model": model,
                "Unit Price": float(comp.price_at_sale or 0),
                "Quantity": comp.quantity,
                "Total": float((comp.price_at_sale or 0) * comp.quantity)
            })

        df_items = pd.DataFrame(items_data)

        # Totals and Metadata
        if invoice:
            details = invoice.invoice_details or {}
            summary_data = [
                {"Field": "Customer Name", "Value": project.customer.full_name if project.customer else "N/A"},
                {"Field": "Project Location", "Value": project.project_location or "N/A"},
                {"Field": "Invoice No", "Value": str(invoice.invoice_id).zfill(5) if invoice.issued_at else "PROFORMA"},
                {"Field": "Issue Date", "Value": invoice.issued_at.isoformat() if invoice.issued_at else "N/A"},
                {"Field": "Subtotal", "Value": float(df_items['Total'].sum()) if not df_items.empty else 0.0},
                {"Field": "Shipping Fee", "Value": float(details.get('shipping_fee') or 0)},
                {"Field": "Installation Fee", "Value": float(details.get('installation_fee') or 0)},
                {"Field": "Discount Percent", "Value": f"{details.get('discount_percent') or 0}%"},
                {"Field": "Grand Total", "Value": float(invoice.amount or 0)},
            ]
            df_summary = pd.DataFrame(summary_data)
        else:
            df_summary = pd.DataFrame([{"Field": "Status", "Value": "No Invoice Created"}])

        # Sheet 2: System Configuration
        config_data = []
        if project.system_config and project.system_config.config_items:
            config = project.system_config.config_items
            
            def add_section(title, data_dict):
                if not data_dict: return
                for k, v in data_dict.items():
                    config_data.append({"Category": title, "Parameter": k.replace('_', ' ').capitalize(), "Value": v})

            add_section("Metadata", config.get('metadata', {}))
            add_section("Solar Panels", config.get('solar_panels', {}))
            add_section("Inverter", config.get('inverter', {}))
            add_section("Battery Bank", config.get('battery_bank', {}))

        df_config = pd.DataFrame(config_data)

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            df_items.to_excel(writer, sheet_name='Invoice Items', index=False)
            df_summary.to_excel(writer, sheet_name='Invoice Summary', index=False)
            df_config.to_excel(writer, sheet_name='System Configuration', index=False)
        
        output.seek(0)
        
        filename = f"Invoice_{project_uuid[:8]}.xlsx"
        return send_file(output, as_attachment=True, download_name=filename, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

@export_bp.route('/pdf/<string:project_uuid>', methods=['GET'])
def export_pdf(project_uuid):
    if HTML is None:
        return jsonify({"error": "WeasyPrint is not installed or configured on the server"}), 500

    lang = request.args.get('lang', 'en')
    direction = 'rtl' if lang == 'ar' else 'ltr'
    
    try:
        with get_db() as db:
            project = db.query(Project).filter(Project.uuid == project_uuid).options(
                joinedload(Project.customer),
                joinedload(Project.system_config),
                joinedload(Project.project_components).joinedload(ProjectComponent.item)
            ).first()

            if not project:
                return jsonify({"error": "Project not found"}), 404

            invoice = db.query(Invoice).filter(Invoice.project_uuid == project_uuid).first()
            if not invoice:
                return jsonify({"error": "Invoice not found"}), 404

            details = invoice.invoice_details or {}
            
            items = []
            subtotal = 0.0
            for comp in project.project_components:
                name = comp.item.name if comp.item else comp.custom_name
                # Avoid Decimal/float mixing during arithmetic (common source of 500s).
                # Normalize everything to float for PDF rendering.
                price = float(comp.price_at_sale or 0)
                total = price * float(comp.quantity or 0)
                items.append({
                    "name": name,
                    "brand": comp.item.brand if comp.item else "N/A",
                    "model": comp.item.model if comp.item else "N/A",
                    "unit_price": f"{float(price):,.2f}",
                    "quantity": comp.quantity,
                    "total": f"{float(total):,.2f}"
                })
                subtotal += total

            discount_pct = details.get('discount_percent') or 0
            discount_amount = (float(subtotal) * float(discount_pct)) / 100
            
            # Prepare System Config Data for Template
            config_render = None
            if project.system_config and project.system_config.config_items:
                config_render = {}
                raw_config = project.system_config.config_items
                for section, data in raw_config.items():
                    if section in ['metadata', 'solar_panels', 'inverter', 'battery_bank']:
                        section_title = section.replace('_', ' ').capitalize()
                        if isinstance(data, dict):
                            config_render[section_title] = { k.replace('_', ' ').capitalize(): v for k, v in data.items() }

            template = jinja_env.get_template('invoice.html')
            html_string = template.render(
                project=project,
                invoice_number=str(invoice.invoice_id).zfill(5) if invoice.issued_at else "PROFORMA | فاتورة مبدئية",
                issue_date=invoice.issued_at.strftime('%d/%m/%Y') if invoice.issued_at else datetime.now().strftime('%d/%m/%Y'),
                due_date=(details.get('due_date') or '').split('T')[0],
                items=items,
                subtotal=f"{float(subtotal):,.2f}",
                shipping_fee=f"{float(details.get('shipping_fee') or 0):,.2f}",
                installation_fee=f"{float(details.get('installation_fee') or 0):,.2f}",
                discount_amount=f"{float(discount_amount):,.2f}",
                grand_total=f"{float(invoice.amount or 0):,.2f}",
                terms=details.get('terms_and_conditions', ''),
                config=config_render,
                t=TRANSLATIONS.get(lang, TRANSLATIONS['en']),
                dir=direction,
                lang=lang
            )

            pdf_io = io.BytesIO()
            HTML(string=html_string).write_pdf(pdf_io)
            pdf_io.seek(0)

            return send_file(
                pdf_io,
                as_attachment=True,
                download_name=f"Invoice_{project_uuid[:8]}.pdf",
                mimetype='application/pdf'
            )
    except Exception as e:
        return jsonify({"error": f"Failed to generate PDF: {str(e)}"}), 500

@export_bp.route('/csv/<string:project_uuid>', methods=['GET'])
def export_csv(project_uuid):
    with get_db() as db:
        project = db.query(Project).filter(Project.uuid == project_uuid).options(
            joinedload(Project.project_components).joinedload(ProjectComponent.item)
        ).first()

        if not project:
            return jsonify({"error": "Project not found"}), 404

        items_data = []
        for comp in project.project_components:
            item_name = comp.item.name if comp.item else comp.custom_name
            items_data.append({
                "Item": item_name,
                "Unit Price": float(comp.price_at_sale or 0),
                "Quantity": comp.quantity,
                "Total": float((comp.price_at_sale or 0) * comp.quantity)
            })

        df = pd.DataFrame(items_data)
        output = io.BytesIO()
        df.to_csv(output, index=False, encoding='utf-8')
        output.seek(0)
        
        return send_file(
            output,
            as_attachment=True,
            download_name=f"Invoice_{project_uuid[:8]}.csv",
            mimetype='text/csv'
        )
