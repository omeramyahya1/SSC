from flask import Blueprint, request, jsonify, Response
from pydantic import ValidationError
import json
import os
import sys

# Add parent directory to path to import from sibling directories
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from pdf_engine.invoice_api import get_invoice_data
from pdf_engine.invoice import create_invoice_pdf
from utils import get_db
from models import Invoice
from schemas import InvoiceCreate, InvoiceUpdate
from serializer import model_to_dict

invoice_bp = Blueprint('invoice_bp', __name__, url_prefix='/invoices')

@invoice_bp.route('/project/<int:project_id>/generate-pdf', methods=['GET'])
def generate_invoice_pdf_route(project_id):
    """
    Generates a PDF invoice for a given project ID.
    """
    # 1. Fetch aggregated data for the project
    json_data_str = get_invoice_data(project_id)
    
    if not json_data_str:
        return jsonify({"error": f"No data found for project with ID {project_id}."}), 404
    
    invoice_data = json.loads(json_data_str)

    # 2. Generate the PDF from the data
    try:
        pdf_bytes = create_invoice_pdf(invoice_data)
    except Exception as e:
        print(f"Error during PDF generation for project {project_id}: {e}")
        return jsonify({"error": "An internal error occurred while generating the PDF."}), 500

    # 3. Return the generated PDF as a file response
    return Response(
        pdf_bytes,
        mimetype='application/pdf',
        headers={'Content-Disposition': f'attachment;filename=invoice_project_{project_id}.pdf'}
    )

@invoice_bp.route('/', methods=['POST'])
def create_invoice():
    try:
        # Validate request data using the Pydantic schema
        validated_data = InvoiceCreate(**request.json)
    except ValidationError as e:
        # Return a 400 Bad Request with validation errors
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        # Create the SQLAlchemy model from validated data
        new_item = Invoice(**validated_data.dict())
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return jsonify(model_to_dict(new_item)), 201

@invoice_bp.route('/<int:item_id>', methods=['PUT'])
def update_invoice(item_id):
    with get_db() as db:
        item = db.query(Invoice).filter(Invoice.invoice_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
            
        try:
            # Validate request data
            validated_data = InvoiceUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        # Use exclude_unset=True to only update fields that were actually provided
        update_data = validated_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)
        
        db.commit()
        db.refresh(item)
        return jsonify(model_to_dict(item))

@invoice_bp.route('/', methods=['GET'])
def get_all_invoice():
    with get_db() as db:
        items = db.query(Invoice).all()
        return jsonify([model_to_dict(i) for i in items])

@invoice_bp.route('/<int:item_id>', methods=['GET'])
def get_invoice(item_id):
    with get_db() as db:
        item = db.query(Invoice).filter(Invoice.invoice_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@invoice_bp.route('/<int:item_id>', methods=['DELETE'])
def delete_invoice(item_id):
    with get_db() as db:
        item = db.query(Invoice).filter(Invoice.invoice_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        db.delete(item)
        db.commit()
        return jsonify({"message": "Deleted successfully"}), 200