from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from sqlalchemy.orm import Session # We need this type hint for clarity
import requests
import io
import os
import sys
import json

from invoice import create_invoice_pdf


# --- Configuration ---
API_BASE_URL = "http://localhost:5000"

def get_data(project_id: int) -> dict:
    """
    1. Fetch data from an API endpoint using the provided project_id.
    2. Return the data as a dictionary.
    """

    # fetch data from API via http request
    data_endpoint = f"{API_BASE_URL}/projects/{project_id}"
    print(f"Fetching data from {data_endpoint}...")

    try:
        response = requests.get(data_endpoint)
        response.raise_for_status()  # Raise an error for bad responses
        data = response.json()
        print("Data fetched successfully.")
        return data
    except requests.RequestException as e:
        print(f"❌ Error fetching data for Project ID {project_id}:\n{e}")
        return None
    

def generate_pdf_document(data: dict, file_name: str ="doc", output_path: str ="") -> str:
    """
    Generate a PDF document from the provided data dictionary.
    Save the PDF to the specified output path with the given file name.
    Return the full path to the saved PDF file.
    """

    if not data:
        print("No data provided to generate PDF.")
        return ""

    # Create a PDF document
    pdf_file_path = os.path.join(output_path, f"{file_name}.pdf")
    doc = SimpleDocTemplate(pdf_file_path, pagesize=A4)
    styles = getSampleStyleSheet()
    elements = []

    # Dumb raw data as json string in the PDF for demonstration
    json_data_str = json.dumps(data, indent=4)
    elements.append(Paragraph("Project Data", styles['Title']))
    elements.append(Spacer(1, 12))
    elements.append(Paragraph(f"<pre>{json_data_str}</pre>", styles['Code']))  
    doc.build(elements)
    
    print(f"PDF generated successfully at: {pdf_file_path}")
    return pdf_file_path

# Execute
if __name__ == "__main__":
    #fetch data for a specific project
    # data = get_data(3)

    # #generate pdf document from fetched data
    # generate_pdf_document(data, file_name="project_report_3", output_path=".")
    pass