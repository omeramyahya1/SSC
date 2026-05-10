from flask import Blueprint, request, send_file, jsonify
from utils import get_db
from models import Project, Invoice, ProjectComponent, Customer
from sqlalchemy.orm import joinedload
import pandas as pd
import io
import os
from datetime import datetime
from jinja2 import Environment, FileSystemLoader, select_autoescape
from urllib.parse import quote

try:
    from weasyprint import HTML
except ImportError:
    HTML = None

export_bp = Blueprint('export_bp', __name__, url_prefix='/export')

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), '..', 'pdf_engine', 'templates')
jinja_env = Environment(
    loader=FileSystemLoader(TEMPLATE_DIR),
    autoescape=select_autoescape(enabled_extensions=('html', 'xml')),
)

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
        'item': 'العنصر',
        'unit_price': 'سعر الوحدة',
        'qty': 'الكمية',
        'total': 'المبلغ',
        'subtotal': 'الإجمالي الفرعي',
        'shipping': 'رسوم الشحن',
        'installation': 'رسوم التركيب',
        'discount': 'الخصم',
        'grand_total': 'الإجمالي الكلي',
        'terms': 'الشروط والأحكام',
        'system_config': 'تكوين المنظومة'
    }
}

# Mapping of BLE keys to labels and units
BLE_LABELS = {
    'en': {
        'peak_sun_hours': ('Peak Sun Hours', 'hrs'),
        'total_system_size_kw': ('Total System Size', 'kW'),
        'peak_surge_power_w': ('Peak Surge Power', 'W'),
        'autonomy_days': ('Autonomy Days', 'days'),
        'total_daily_energy_wh': ('Total Daily Energy', 'Wh'),
        'total_peak_power_w': ('Total Peak Power', 'W'),
        'power_rating_w': ('Power Rating', 'W'),
        'quantity': ('Quantity', ''),
        'total_pv_capacity_kw': ('Total PV Capacity', 'kW'),
        'panels_per_string': ('Panels per String', ''),
        'num_parallel_strings': ('Parallel Strings', ''),
        'connection_type': ('Connection Type', ''),
        'tilt_angle': ('Tilt Angle', '°'),
        'efficiency_percent': ('Efficiency', '%'),
        'recommended_rating': ('Recommended Rating', 'W'),
        'surge_rating_w': ('Surge Rating', 'W'),
        'output_voltage_v': ('Output Voltage', 'V'),
        'capacity_per_unit_ah': ('Capacity per Unit', 'Ah'),
        'voltage_per_unit_v': ('Voltage per Unit', 'V'),
        'num_in_series': ('Number in Series', ''),
        'num_in_parallel': ('Number in Parallel', ''),
        'total_storage_kwh': ('Total Storage', 'kWh'),
        'depth_of_discharge_percent': ('Depth of Discharge', '%'),
        'system_voltage_v': ('System Voltage', 'V'),
        'battery_type': ('Battery Type', ''),
    },
    'ar': {
        'peak_sun_hours': ('ساعات ذروة الشمس', 'ساعة'),
        'total_system_size_kw': ('إجمالي حجم المنظومة', 'كيلوواط'),
        'peak_surge_power_w': ('ذروة القدرة', 'واط'),
        'autonomy_days': ('أيام الاستقلالية', 'يوم'),
        'total_daily_energy_wh': ('إجمالي الطاقة اليومية', 'واط ساعة'),
        'total_peak_power_w': ('إجمالي ذروة القدرة', 'واط'),
        'power_rating_w': ('القدرة', 'واط'),
        'quantity': ('الكمية', ''),
        'total_pv_capacity_kw': ('إجمالي قدرة الطاقة الشمسية', 'كيلوواط'),
        'panels_per_string': ('الألواح لكل سلسلة', ''),
        'num_parallel_strings': ('عدد السلاسل المتوازية', ''),
        'connection_type': ('توصيل', ''),
        'tilt_angle': ('زاوية الميل', '°'),
        'efficiency_percent': ('الكفاءة', '%'),
        'recommended_rating': ('التقييم الموصى به', 'واط'),
        'surge_rating_w': ('أقصى قدرة', 'واط'),
        'output_voltage_v': ('جهد الخرج', 'فولت'),
        'capacity_per_unit_ah': ('السعة لكل وحدة', 'أمبير-ساعة'),
        'voltage_per_unit_v': ('الجهد لكل وحدة', 'فولت'),
        'num_in_series': ('العدد على التوالي', ''),
        'num_in_parallel': ('العدد على التوازي', ''),
        'total_storage_kwh': ('التخزين الكلي', 'كيلوواط ساعة'),
        'depth_of_discharge_percent': ('عمق التفريغ', '%'),
        'system_voltage_v': ('جهد المنظومة', 'فولت'),
        'battery_type': ('نوع البطارية', ''),
    }
}

GEO_DATA_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'ble', 'dataset', 'geo_data.csv'))
_geo_df = None

def _load_geo_data():
    global _geo_df
    if _geo_df is None:
        try:
            _geo_df = pd.read_csv(GEO_DATA_PATH)
        except Exception as e:
            print(f"Warning: Could not load geo_data.csv for export localization: {e}")
            _geo_df = pd.DataFrame()
    return _geo_df

def _get_localized_location(location_str, lang):
    if not location_str or lang != 'ar':
        return location_str

    df = _load_geo_data()
    if df.empty:
        return location_str

    # Standard format is "City, State"
    parts = [p.strip().lower() for p in location_str.split(',')]

    if len(parts) >= 2:
        city_en, state_en = parts[0], parts[1]
        match = df[(df['city'].str.lower() == city_en) & (df['state'].str.lower() == state_en)]
        if not match.empty:
            row = match.iloc[0]
            return f"{row['city_ar']}, {row['state_ar']}"

    # Fallback: Try matching just the city
    match = df[df['city'].str.lower() == parts[0]]
    if not match.empty:
        return match.iloc[0]['city_ar']

    return location_str

def _clamp_margin_mm(value, *, default=0.0, min_value=0.0, max_value=40.0):
    try:
        v = float(value)
    except (TypeError, ValueError):
        return float(default)
    return max(min_value, min(max_value, v))

def _load_ssc_logo_svg():
    try:
        repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
        svg_path = os.path.join(repo_root, 'public', 'ssc.svg')
        with open(svg_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception:
        return None

def _svg_to_data_uri(svg_text: str | None):
    if not svg_text:
        return None
    # Encode as a data URI so the PDF generator doesn't rely on filesystem paths/URLs.
    return f"data:image/svg+xml;charset=utf-8,{quote(svg_text)}"

def _normalize_invoice_items(invoice: Invoice):
    raw = invoice.invoice_items or {}
    if not isinstance(raw, dict):
        return {"inventory": [], "manual": []}
    return {
        "inventory": raw.get("inventory") or [],
        "manual": raw.get("manual") or []
    }

def _build_independent_items(invoice: Invoice):
    payload = _normalize_invoice_items(invoice)
    items = []
    subtotal = 0.0

    for it in payload.get("inventory", []) or []:
        unit_price = float((it or {}).get("unit_price") or 0)
        qty = float((it or {}).get("quantity") or 0)
        total = unit_price * qty
        items.append({
            "name": (it or {}).get("name") or "",
            "brand": (it or {}).get("brand") or "",
            "model": (it or {}).get("model") or "",
            "unit_price": f"{float(unit_price):,.2f}",
            "quantity": int(qty),
            "total": f"{float(total):,.2f}",
        })
        subtotal += total

    for it in payload.get("manual", []) or []:
        unit_price = float((it or {}).get("price") or 0)
        qty = float((it or {}).get("quantity") or 0)
        total = unit_price * qty
        items.append({
            "name": (it or {}).get("name") or "",
            "brand": "",
            "model": "",
            "unit_price": f"{float(unit_price):,.2f}",
            "quantity": int(qty),
            "total": f"{float(total):,.2f}",
        })
        subtotal += total

    return items, float(subtotal)

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
        lang = request.args.get('lang', 'en')
        localized_location = _get_localized_location(project.project_location, lang)

        items_data = []
        for comp in project.project_components:
            item_name = comp.item.name if comp.item else comp.custom_name
            brand = comp.item.brand if comp.item else ""
            model = comp.item.model if comp.item else ""
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
                {"Field": "Project Location", "Value": localized_location or "N/A"},
                {"Field": "Invoice No", "Value": str(invoice.invoice_id).zfill(5) if invoice.issued_at else "PROFORMA"},
                {"Field": "Issue Date", "Value": invoice.issued_at.isoformat() or "N/A"},
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

@export_bp.route('/excel/invoice/<string:invoice_uuid>', methods=['GET'])
def export_excel_invoice(invoice_uuid):
    with get_db() as db:
        invoice = db.query(Invoice).filter(Invoice.uuid == invoice_uuid, Invoice.deleted_at.is_(None)).first()
        if not invoice:
            return jsonify({"error": "Invoice not found"}), 404

        details = invoice.invoice_details or {}
        customer_uuid = details.get("customer_uuid")
        customer = db.query(Customer).filter(Customer.uuid == customer_uuid, Customer.deleted_at.is_(None)).first() if customer_uuid else None

        items, subtotal = _build_independent_items(invoice)
        lang = request.args.get('lang', 'en')
        localized_location = _get_localized_location(details.get("project_location"), lang)

        df_items = pd.DataFrame([{
            "Item": i["name"],
            "Brand": i["brand"],
            "Model": i["model"],
            "Unit Price": float(str(i["unit_price"]).replace(",", "")),
            "Quantity": i["quantity"],
            "Total": float(str(i["total"]).replace(",", "")),
        } for i in items])

        discount_pct = float(details.get("discount_percent") or 0)
        discount_amount = (float(subtotal) * float(discount_pct)) / 100

        summary_data = [
            {"Field": "Customer Name", "Value": customer.full_name if customer else "N/A"},
            {"Field": "Address", "Value": localized_location or "N/A"},
            {"Field": "Invoice No", "Value": str(invoice.invoice_id).zfill(5) if invoice.issued_at else "PROFORMA"},
            {"Field": "Issue Date", "Value": invoice.issued_at.isoformat() if invoice.issued_at else "N/A"},
            {"Field": "Subtotal", "Value": float(subtotal)},
            {"Field": "Shipping Fee", "Value": float(details.get("shipping_fee") or 0)},
            {"Field": "Installation Fee", "Value": float(details.get("installation_fee") or 0)},
            {"Field": "Discount Percent", "Value": f"{details.get('discount_percent') or 0}%"},
            {"Field": "Discount Amount", "Value": float(discount_amount)},
            {"Field": "Grand Total", "Value": float(invoice.amount or 0)},
        ]
        df_summary = pd.DataFrame(summary_data)

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            df_items.to_excel(writer, sheet_name='Invoice Items', index=False)
            df_summary.to_excel(writer, sheet_name='Invoice Summary', index=False)

        output.seek(0)
        filename = f"Invoice_{invoice_uuid[:8]}.xlsx"
        return send_file(output, as_attachment=True, download_name=filename, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

@export_bp.route('/pdf/<string:project_uuid>', methods=['GET'])
def export_pdf(project_uuid):
    if HTML is None:
        return jsonify({"error": "WeasyPrint is not installed or configured on the server"}), 500

    lang = request.args.get('lang', 'en')
    direction = 'rtl' if lang == 'ar' else 'ltr'
    top_mm = _clamp_margin_mm(request.args.get('top_mm'), default=0.0)
    bottom_mm = _clamp_margin_mm(request.args.get('bottom_mm'), default=0.0)

    base_margin_mm = 15.0
    margin_top_mm = base_margin_mm + top_mm
    margin_bottom_mm = base_margin_mm + bottom_mm
    margin_left_mm = base_margin_mm
    margin_right_mm = base_margin_mm
    ssc_logo_svg = _load_ssc_logo_svg()
    ssc_logo_data_uri = _svg_to_data_uri(ssc_logo_svg)

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
            manual_items = invoice.invoice_items["manual"] or []
            lang = request.args.get('lang', 'en')

            if project.project_location:
                project.project_location = _get_localized_location(project.project_location, lang)

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
                    "brand": comp.item.brand if comp.item else "",
                    "model": comp.item.model if comp.item else "",
                    "unit_price": f"{float(price):,.2f}",
                    "quantity": comp.quantity,
                    "total": f"{float(total):,.2f}"
                })
                subtotal += total

            for item in manual_items:
                name = item["name"] if item["name"] else next
                price = float(item["price"] or 0)
                total = price * float(item["quantity"] or 0)
                items.append({
                    "name": name,
                    "unit_price": f"{float(price):,.2f}",
                    "quantity": item["quantity"],
                    "total": f"{float(total):,.2f}"
                })
                subtotal += total

            discount_pct = details.get('discount_percent') or 0
            discount_amount = (float(subtotal) * float(discount_pct)) / 100

            # Prepare System Config Data for Template
            # --- START OF UPDATED SECTION ---
            config_render = None
            if project.system_config and project.system_config.config_items:
                config_render = {}
                raw_config = project.system_config.config_items
                section_order = ['metadata', 'solar_panels', 'inverter', 'battery_bank']

                # Use your localized section titles
                section_titles = {
                    'metadata': {'en': 'Metadata', 'ar': 'البيانات الوصفية'},
                    'solar_panels': {'en': 'Solar Panels', 'ar': 'الألواح الشمسية'},
                    'inverter': {'en': 'Inverters', 'ar': 'المحول'},
                    'battery_bank': {'en': 'Battery Bank', 'ar': 'بنك البطاريات'},
                }

                for section in section_order:
                    data = raw_config.get(section)
                    if not isinstance(data, dict) or not data:
                        continue

                    section_title = section_titles.get(section, {}).get(lang) or section.replace('_', ' ').capitalize()
                    section_dict = {}

                    for k, v in data.items():
                        # 1. Look up translated label and unit
                        label_info = BLE_LABELS.get(lang, {}).get(k)

                        if label_info:
                            label, unit = label_info
                            # 2. Append unit to value if it exists and value is numeric
                            display_val = f"{v} {unit}".strip() if unit and isinstance(v, (int, float)) else v
                            section_dict[label] = display_val
                        else:
                            # Fallback if key is missing from BLE_LABELS
                            label = k.replace('_', ' ').capitalize() if lang == 'en' else k.replace('_', ' ')
                            section_dict[label] = v

                    config_render[section_title] = section_dict
            # --- END OF UPDATED SECTION ---

            template = jinja_env.get_template('invoice.html')
            html_string = template.render(
                project=project,
                invoice_number=str(invoice.invoice_id).zfill(5) if invoice.issued_at else "PROFORMA",
                issue_date=invoice.issued_at.strftime('%d/%m/%Y') if invoice.issued_at else datetime.now().strftime('%d/%m/%Y'),
                due_date=(details.get('due_date') or '').split('T')[0] if invoice.issued_at else "n/a",
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
                lang=lang,
                margin_top_mm=margin_top_mm,
                margin_bottom_mm=margin_bottom_mm,
                margin_left_mm=margin_left_mm,
                margin_right_mm=margin_right_mm,
                watermark_text='Made with SSC',
                ssc_logo_data_uri=ssc_logo_data_uri
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

@export_bp.route('/pdf/invoice/<string:invoice_uuid>', methods=['GET'])
def export_pdf_invoice(invoice_uuid):
    if HTML is None:
        return jsonify({"error": "WeasyPrint is not installed or configured on the server"}), 500

    lang = request.args.get('lang', 'en')
    direction = 'rtl' if lang == 'ar' else 'ltr'
    top_mm = _clamp_margin_mm(request.args.get('top_mm'), default=0.0)
    bottom_mm = _clamp_margin_mm(request.args.get('bottom_mm'), default=0.0)

    base_margin_mm = 15.0
    margin_top_mm = base_margin_mm + top_mm
    margin_bottom_mm = base_margin_mm + bottom_mm
    margin_left_mm = base_margin_mm
    margin_right_mm = base_margin_mm
    ssc_logo_svg = _load_ssc_logo_svg()
    ssc_logo_data_uri = _svg_to_data_uri(ssc_logo_svg)

    try:
        with get_db() as db:
            invoice = db.query(Invoice).filter(Invoice.uuid == invoice_uuid, Invoice.deleted_at.is_(None)).first()
            if not invoice:
                return jsonify({"error": "Invoice not found"}), 404

            details = invoice.invoice_details or {}
            customer_uuid = details.get("customer_uuid")
            customer = db.query(Customer).filter(Customer.uuid == customer_uuid, Customer.deleted_at.is_(None)).first() if customer_uuid else None
            if not customer:
                return jsonify({"error": "Customer not found"}), 404

            items, subtotal = _build_independent_items(invoice)
            discount_pct = details.get('discount_percent') or 0
            discount_amount = (float(subtotal) * float(discount_pct)) / 100

            template = jinja_env.get_template('invoice.html')
            html_string = template.render(
                project={
                    "customer": customer,
                    "project_location": details.get("project_location") or "—"
                },
                invoice_number=str(invoice.invoice_id).zfill(5) if invoice.issued_at else "PROFORMA",
                issue_date=invoice.issued_at.strftime('%d/%m/%Y') if invoice.issued_at else datetime.now().strftime('%d/%m/%Y'),
                due_date=(details.get('due_date') or '').split('T')[0] if invoice.issued_at else "n/a",
                items=items,
                subtotal=f"{float(subtotal):,.2f}",
                shipping_fee=f"{float(details.get('shipping_fee') or 0):,.2f}",
                installation_fee=f"{float(details.get('installation_fee') or 0):,.2f}",
                discount_amount=f"{float(discount_amount):,.2f}",
                grand_total=f"{float(invoice.amount or 0):,.2f}",
                terms=details.get('terms_and_conditions', ''),
                config=None,
                t=TRANSLATIONS.get(lang, TRANSLATIONS['en']),
                dir=direction,
                lang=lang,
                margin_top_mm=margin_top_mm,
                margin_bottom_mm=margin_bottom_mm,
                margin_left_mm=margin_left_mm,
                margin_right_mm=margin_right_mm,
                watermark_text='Made with SSC',
                ssc_logo_data_uri=ssc_logo_data_uri
            )

            pdf_io = io.BytesIO()
            HTML(string=html_string).write_pdf(pdf_io)
            pdf_io.seek(0)

            return send_file(
                pdf_io,
                as_attachment=True,
                download_name=f"Invoice_{invoice_uuid[:8]}.pdf",
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

@export_bp.route('/csv/invoice/<string:invoice_uuid>', methods=['GET'])
def export_csv_invoice(invoice_uuid):
    with get_db() as db:
        invoice = db.query(Invoice).filter(Invoice.uuid == invoice_uuid, Invoice.deleted_at.is_(None)).first()
        if not invoice:
            return jsonify({"error": "Invoice not found"}), 404

        items, _subtotal = _build_independent_items(invoice)
        df = pd.DataFrame([{
            "Item": i["name"],
            "Brand": i["brand"],
            "Model": i["model"],
            "Unit Price": float(str(i["unit_price"]).replace(",", "")),
            "Quantity": i["quantity"],
            "Total": float(str(i["total"]).replace(",", "")),
        } for i in items])

        output = io.BytesIO()
        df.to_csv(output, index=False, encoding='utf-8')
        output.seek(0)

        return send_file(
            output,
            as_attachment=True,
            download_name=f"Invoice_{invoice_uuid[:8]}.csv",
            mimetype='text/csv'
        )
