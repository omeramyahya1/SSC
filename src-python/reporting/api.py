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
        'generated_on': 'Date generated',
        'scope': 'Scope',
        'summary': 'Summary Metrics',
        'performance_metrics': 'Performance Metrics',
        'footer_text': 'Made with SSC - Internal Report',
        'finance_title': 'Finance Performance Report',
        'inventory_title': 'Inventory Status Report',
        'invoices_detail': 'Invoices Detail',
        'stock_detail': 'Current Stock Detail',
        'payments_detail': 'Payments Detail',
        'movements_history': 'Movements History',
        'all_branches': 'All Branches',
        'total_stock_value': 'Total Stock Value (Cost)',
        'total_potential_revenue': 'Total Potential Revenue',
        'total_movements': 'Total Movements in Period',
        'critical_items': 'Critical Items',
        'total_revenue': 'Total Revenue',
        'total_invoiced': 'Total Invoiced',
        'gross_profit': 'Gross Profit',
        'total_discounts': 'Total Discounts',
        'avg_sale_cycle': 'Avg Sale Cycle (Days)',
        'outstanding': 'Outstanding',
        'currency_label': 'SDG',
        'payment_methods': 'Payment Methods Breakdown',
        'created_by_breakdown': 'Created By Breakdown',
        'table': {
            'name': 'Name',
            'category': 'Category',
            'threshold': 'Threshold',
            'brand': 'Brand',
            'buy_price': 'Buy Price',
            'sell_price': 'Sell Price',
            'status': 'Status',
            'low_stock': 'Low Stock',
            'invoice_no': 'Invoice No.',
            'date': 'Date',
            'customer': 'Customer',
            'amount': 'Amount',
            'paid': 'Paid',
            'branch': 'Branch',
            'created_by': 'Created By',
            'location': 'Location',
            'cycle_time': 'Cycle Time',
            'method': 'Method',
            'reference': 'Reference',
            'adjustment': 'Adjustment',
            'reason': 'Reason',
            'user': 'User'
        }
    },
    'ar': {
        'generated_on': 'تاريخ الإنشاء',
        'scope': 'النطاق',
        'summary': 'ملخص',
        'performance_metrics': 'مقاييس الأداء',
        'footer_text': 'Made with SSC - Internal Report',
        'finance_title': 'تقرير الأداء المالي',
        'inventory_title': 'تقرير حالة المخزون',
        'invoices_detail': 'تفاصيل الفواتير',
        'stock_detail': 'تفاصيل المخزون الحالي',
        'payments_detail': 'تفاصيل المدفوعات',
        'movements_history': 'سجل التحركات',
        'all_branches': 'جميع الفروع',
        'total_stock_value': 'إجمالي قيمة المخزون (التكلفة)',
        'total_potential_revenue': 'إجمالي الإيرادات المتوقعة',
        'total_movements': 'إجمالي التحركات في الفترة',
        'critical_items': 'الأصناف الحرجة',
        'total_revenue': 'إجمالي الإيرادات',
        'total_invoiced': 'إجمالي الفواتير',
        'gross_profit': 'إجمالي الربح',
        'total_discounts': 'إجمالي الخصومات',
        'avg_sale_cycle': 'متوسط دورة المبيعات (أيام)',
        'outstanding': 'المستحقات المتأخرة',
        'currency_label': 'ج.س.',
        'payment_methods': 'توزيع طرق الدفع',
        'created_by_breakdown': 'توزيع حسب الموظف',
        'table': {
            'name': 'الاسم',
            'category': 'الفئة',
            'threshold': 'الحد الأدنى',
            'brand': 'العلامة التجارية',
            'buy_price': 'سعر الشراء',
            'sell_price': 'سعر البيع',
            'status': 'الحالة',
            'low_stock': 'مخزون منخفض',
            'invoice_no': 'رقم الفاتورة',
            'date': 'التاريخ',
            'customer': 'العميل',
            'amount': 'المبلغ',
            'paid': 'المدفوع',
            'branch': 'الفرع',
            'created_by': 'بواسطة',
            'location': 'الموقع',
            'cycle_time': 'دورة الوقت',
            'method': 'الطريقة',
            'reference': 'المرجع',
            'adjustment': 'التعديل',
            'reason': 'السبب',
            'user': 'المستخدم'
        }
    }
}

@reporting_bp.route('/export', methods=['POST'])
@inject_db_session
def export_report(db):
    data = request.json or {}
    report_type = data.get('report_type') # 'finance' or 'inventory'
    formats = data.get('formats', ['excel']) # ['excel', 'pdf']
    lang = data.get('lang', 'en')
    t = REPORT_TRANSLATIONS.get(lang, REPORT_TRANSLATIONS['en'])

    org_uuid = data.get('org_uuid')
    branch_uuid = data.get('branch_uuid')
    user_uuid = data.get('user_uuid')
    start_date = data.get('start_date')
    end_date = data.get('end_date')

    if report_type == 'finance':
        report_data = get_finance_report_data(db, org_uuid, branch_uuid, user_uuid, start_date, end_date, lang=lang)
        title = t['finance_title']
        table_title = t['invoices_detail']
        table_data = report_data['raw_data']
    else:
        report_data = get_inventory_report_data(db, org_uuid, branch_uuid, start_date, end_date)
        title = t['inventory_title']
        table_title = t['stock_detail']
        table_data = report_data['current_stock']

    generated_files = []
    current_date_str = datetime.now().strftime('%d_%m_%Y')

    if 'excel' in formats:
        excel_io = generate_excel_report(report_data, report_type, lang=lang, t=t)
        generated_files.append((f"{report_type}_report_{current_date_str}.xlsx", excel_io, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))

    if 'pdf' in formats:
        if HTML is None:
            return jsonify({"error": "PDF engine not available"}), 500

        template = jinja_env.get_template('report.html')

        # Localize dates for display
        def _fmt_date(d_str):
            if not d_str:
                return "—"
            try:
                return datetime.fromisoformat(d_str).strftime('%d-%m-%Y')
            except (ValueError, TypeError):
                return d_str

        date_range = f"{_fmt_date(start_date)} - {_fmt_date(end_date)}"

        # Determine scope string
        scope = t['all_branches']
        if branch_uuid: scope = f"Branch: {branch_uuid}"
        elif user_uuid: scope = f"User: {user_uuid}"

        table_headers = list(table_data[0].keys()) if table_data else []

        html_string = template.render(
            title=title,
            date_range=date_range,
            generated_at=datetime.now().strftime('%d-%m-%Y %H:%M'),
            scope=scope,
            data=report_data,
            table_title=table_title,
            table_headers=table_headers,
            table_data=table_data,
            t=t,
            lang=lang,
            dir='rtl' if lang == 'ar' else 'ltr'
        )

        pdf_io = io.BytesIO()
        HTML(string=html_string).write_pdf(pdf_io)
        pdf_io.seek(0)
        generated_files.append((f"{report_type}_report_{current_date_str}.pdf", pdf_io, "application/pdf"))

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
        return send_file(zip_io, as_attachment=True, download_name=f"{report_type}_reports_{current_date_str}.zip", mimetype='application/zip')
