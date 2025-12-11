
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import Color, black, white
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Frame
from reportlab.lib.styles import getSampleStyleSheet
from svglib.svglib import svg2rlg

# --- Configuration ---

# Color Palette
DEFAULT_COLOR = Color(48/255, 54/255, 66/255)
GRAY_COLOR = Color(138/255, 140/255, 142/255)
LIGHT_GRAY = Color(217/255, 217/255, 217/255)
SHADE_GRAY = Color(239/255, 239/255, 239/255)
RED_COLOR = Color(255/255, 22/255, 22/255)
GREEN_COLOR = Color(0/255, 191/255, 99/255)
BLACK_COLOR = black
WHITE_COLOR = white

# Page Setup
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 2.1 * cm
FOOTER_START_Y = 26.2 * cm
FOOTER_HEIGHT = PAGE_HEIGHT - FOOTER_START_Y - (0.7 * cm)
FOOTER_TOP_MARGIN = 0.7 * cm

# Asset Paths
ASSETS_PATH = os.path.join(os.path.dirname(__file__), 'assets')
FONT_PATH = os.path.join(ASSETS_PATH, 'fonts')
ICON_PATH = os.path.join(ASSETS_PATH, 'icons')

# Register Fonts
pdfmetrics.registerFont(TTFont('Cairo-Regular', os.path.join(FONT_PATH, 'Cairo-Regular.ttf')))
pdfmetrics.registerFont(TTFont('Cairo-Bold', os.path.join(FONT_PATH, 'Cairo-Bold.ttf')))
pdfmetrics.registerFont(TTFont('Cairo-Light', os.path.join(FONT_PATH, 'Cairo-Light.ttf')))

def draw_footer(c: canvas.Canvas, doc):
    """
    Draws the footer on each page.
    """
    c.saveState()

    footer_width = PAGE_WIDTH - 2 * MARGIN
    footer_x = MARGIN
    footer_y = 0.7 * cm #
    content_y = footer_y + FOOTER_HEIGHT - FOOTER_TOP_MARGIN

    # Top part of the footer
    
    # 1. Phone
    icon_box_size = 0.64 * cm
    icon_size = 0.36 * cm
    text_offset = 0.2 * cm
    
    # Evenly distribute items
    item_width = footer_width / 3
    
    # Phone
    phone_x = footer_x
    c.setFillColor(DEFAULT_COLOR)
    c.rect(phone_x, content_y - icon_box_size, icon_box_size, icon_box_size, fill=1, stroke=0)
    
    phone_icon_path = os.path.join(ICON_PATH, 'telephone.svg')
    if os.path.exists(phone_icon_path):
        phone_icon = svg2rlg(phone_icon_path)
        phone_icon.width = phone_icon.height = icon_size
        phone_icon.drawOn(c, phone_x + (icon_box_size - icon_size) / 2, content_y - icon_box_size + (icon_box_size - icon_size) / 2)


    c.setFont('Cairo-Regular', 9)
    c.setFillColor(DEFAULT_COLOR)
    text_x = phone_x + icon_box_size + text_offset
    c.drawString(text_x, content_y - (icon_box_size / 2) - (9 / 2.5), "Phone number")

    # 2. Email
    email_x = footer_x + item_width
    c.setFillColor(DEFAULT_COLOR)
    c.rect(email_x, content_y - icon_box_size, icon_box_size, icon_box_size, fill=1, stroke=0)
    
    mail_icon_path = os.path.join(ICON_PATH, 'mail.svg')
    if os.path.exists(mail_icon_path):
        mail_icon = svg2rlg(mail_icon_path)
        mail_icon.width = mail_icon.height = icon_size
        mail_icon.drawOn(c, email_x + (icon_box_size - icon_size) / 2, content_y - icon_box_size + (icon_box_size - icon_size) / 2)

    c.setFont('Cairo-Regular', 9)
    c.setFillColor(DEFAULT_COLOR)
    text_x = email_x + icon_box_size + text_offset
    c.drawString(text_x, content_y - (icon_box_size / 2) - (9 / 2.5), "Business email")

    # 3. Location
    location_x = footer_x + 2 * item_width
    c.setFillColor(DEFAULT_COLOR)
    c.rect(location_x, content_y - icon_box_size, icon_box_size, icon_box_size, fill=1, stroke=0)
    
    pin_icon_path = os.path.join(ICON_PATH, 'pin.svg')
    if os.path.exists(pin_icon_path):
        pin_icon = svg2rlg(pin_icon_path)
        pin_icon.width = pin_icon.height = icon_size
        pin_icon.drawOn(c, location_x + (icon_box_size - icon_size) / 2, content_y - icon_box_size + (icon_box_size - icon_size) / 2)

    c.setFont('Cairo-Regular', 9)
    c.setFillColor(DEFAULT_COLOR)
    text_x = location_x + icon_box_size + text_offset
    
    # Handle text wrapping for location
    location_text = "Placeholder for a long location address that might need to wrap"
    p_style = getSampleStyleSheet()['Normal']
    p_style.fontName = 'Cairo-Regular'
    p_style.fontSize = 9
    p_style.textColor = DEFAULT_COLOR
    p = Paragraph(location_text, p_style)
    p.wrapOn(c, 2.6 * cm, 100)
    p.drawOn(c, text_x, content_y - (icon_box_size / 2) - (9/2.5) * p.height/p.style.leading)

    # Middle line
    line_y = footer_y + FOOTER_HEIGHT / 2
    c.setStrokeColor(BLACK_COLOR)
    c.setLineWidth(1)
    c.line(footer_x, line_y, footer_x + footer_width, line_y)

    # Bottom part (Watermark)
    watermark_y = footer_y + (FOOTER_HEIGHT / 4)
    
    ssc_logo_path = os.path.join(ICON_PATH, 'ssc.svg')
    logo_width = 0.62 * cm
    logo_height = 0.48 * cm

    watermark_text = "Made with SSC"
    c.setFont('Cairo-Regular', 9)
    c.setFillColor(GRAY_COLOR)
    text_width = c.stringWidth(watermark_text)
    
    total_watermark_width = logo_width + text_offset + text_width
    watermark_x = footer_x + footer_width - total_watermark_width
    
    if os.path.exists(ssc_logo_path):
        ssc_logo = svg2rlg(ssc_logo_path)
        ssc_logo.width = logo_width
        ssc_logo.height = logo_height
        c.saveState()
        c.setFillAlpha(0.7)
        ssc_logo.drawOn(c, watermark_x, watermark_y - logo_height / 2)
        c.restoreState()
        
    c.drawString(watermark_x + logo_width + text_offset, watermark_y - (9 / 2.5), watermark_text)

    c.restoreState()

def create_test_invoice():
    """
    Generates a test invoice PDF with the specified footer.
    """
    output_path = os.path.dirname(__file__)
    pdf_file_path = os.path.join(output_path, "test_invoice.pdf")

    doc = SimpleDocTemplate(
        pdf_file_path,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN + FOOTER_HEIGHT + FOOTER_TOP_MARGIN 
    )

    styles = getSampleStyleSheet()
    styles['Title'].fontName = 'Cairo-Bold'
    styles['h1'].fontName = 'Cairo-Bold'
    styles['Normal'].fontName = 'Cairo-Regular'

    elements = [
        Paragraph("Invoice Title", styles['Title']),
        Spacer(1, 2 * cm),
        Paragraph("This is a test invoice to demonstrate the footer.", styles['Normal'])
    ]

    doc.build(elements, onFirstPage=draw_footer, onLaterPages=draw_footer)
    print(f"✅ Test invoice generated at: {pdf_file_path}")


if __name__ == "__main__":
    create_test_invoice()
