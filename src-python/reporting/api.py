from flask import Blueprint, request, send_file, jsonify
from utils import inject_db_session
from reporting.reports_module import (
    get_finance_report_data,
    get_inventory_report_data,
    generate_excel_report
)
from jinja2 import Environment, FileSystemLoader, select_autoescape
import os
import io
import zipfile
from datetime import datetime

try:
    from weasyprint import HTML
except ImportError:
    HTML = None

reporting_bp = Blueprint('reporting_bp', __name__, url_prefix='/reporting')

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), '..', 'pdf_engine', 'templates')
jinja_env = Environment(
    loader=FileSystemLoader(TEMPLATE_DIR),
    autoescape=select_autoescape(enabled_extensions=('html', 'xml')),
)

REPORT_TRANSLATIONS = {
    'en': {
        'generated_on': 'Generated On',
        'scope': 'Scope',
        'summary': 'Summary Metrics',
        'performance_metrics': 'Performance Metrics',
        'footer_text': 'Solar System Calculator - Internal Report',
        'finance_title': 'Finance Performance Report',
        'inventory_title': 'Inventory Status Report',
        'invoices_detail': 'Invoices Detail',
        'stock_detail': 'Current Stock Detail'
    },
    'ar': {
        'generated_on': 'تم الإنشاء في',
        'scope': 'النطاق',
        'summary': 'مقاييس ملخصة',
        'performance_metrics': 'مقاييس الأداء',
        'footer_text': 'مقدر المنظومات الشمسية - تقرير داخلي',
        'finance_title': 'تقرير الأداء المالي',
        'inventory_title': 'تقرير حالة المخزون',
        'invoices_detail': 'تفاصيل الفواتير',
        'stock_detail': 'تفاصيل المخزون الحالي'
    }
}

@reporting_bp.route('/export', methods=['POST'])
@inject_db_session
def export_report(db):
    data = request.json
    report_type = data.get('report_type') # 'finance' or 'inventory'
    formats = data.get('formats', ['excel']) # ['excel', 'pdf']
    lang = data.get('lang', 'en')
    
    org_uuid = data.get('org_uuid')
    branch_uuid = data.get('branch_uuid')
    user_uuid = data.get('user_uuid')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    
    if report_type == 'finance':
        report_data = get_finance_report_data(db, org_uuid, branch_uuid, user_uuid, start_date, end_date)
        title = REPORT_TRANSLATIONS[lang]['finance_title']
        table_title = REPORT_TRANSLATIONS[lang]['invoices_detail']
        table_data = report_data['raw_data']
    else:
        report_data = get_inventory_report_data(db, org_uuid, branch_uuid, start_date, end_date)
        title = REPORT_TRANSLATIONS[lang]['inventory_title']
        table_title = REPORT_TRANSLATIONS[lang]['stock_detail']
        table_data = report_data['current_stock']
        
    generated_files = []
    
    if 'excel' in formats:
        excel_io = generate_excel_report(report_data, report_type)
        generated_files.append((f"{report_type}_report.xlsx", excel_io, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
        
    if 'pdf' in formats:
        if HTML is None:
            return jsonify({"error": "PDF engine not available"}), 500
            
        template = jinja_env.get_template('report.html')
        date_range = f"{start_date or 'Start'} - {end_date or 'Today'}"
        
        # Determine scope string
        scope = "All Organization"
        if branch_uuid: scope = f"Branch: {branch_uuid}"
        elif user_uuid: scope = f"User: {user_uuid}"
        
        table_headers = list(table_data[0].keys()) if table_data else []
        
        html_string = template.render(
            title=title,
            date_range=date_range,
            generated_at=datetime.now().strftime('%Y-%m-%d %H:%M'),
            scope=scope,
            data=report_data,
            table_title=table_title,
            table_headers=table_headers,
            table_data=table_data,
            t=REPORT_TRANSLATIONS[lang],
            lang=lang,
            dir='rtl' if lang == 'ar' else 'ltr'
        )
        
        pdf_io = io.BytesIO()
        HTML(string=html_string).write_pdf(pdf_io)
        pdf_io.seek(0)
        generated_files.append((f"{report_type}_report.pdf", pdf_io, "application/pdf"))
        
    if len(generated_files) == 1:
        name, bio, mime = generated_files[0]
        return send_file(bio, as_attachment=True, download_name=name, mimetype=mime)
    else:
        # Multiple formats -> ZIP
        zip_io = io.BytesIO()
        with zipfile.ZipFile(zip_io, 'w') as zf:
            for name, bio, _ in generated_files:
                zf.writestr(name, bio.getvalue())
        zip_io.seek(0)
        return send_file(zip_io, as_attachment=True, download_name=f"{report_type}_reports.zip", mimetype='application/zip')
