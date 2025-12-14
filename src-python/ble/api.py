# src-python/ble/api.py
# BLE API endpoint

import sys
import os
from flask import Blueprint, jsonify
from sqlalchemy.orm import joinedload

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from db_setup import SessionLocal
from models import Project
from .ble import BLE, get_geo_data

# --- Blueprint Setup ---
ble_bp = Blueprint(
    'ble_bp', __name__,
    url_prefix='/ble'
)

# --- API Endpoints ---
@ble_bp.route('/calculate/<int:project_id>', methods=['GET'])
def calculate_system(project_id: int):
    """
    Calculate the required solar system configuration based on project data.
    """
    with SessionLocal() as session:
        # 1. Fetch project data with related appliances
        project = session.query(Project).options(
            joinedload(Project.appliances)
        ).filter(Project.project_id == project_id).first()

        if not project:
            return jsonify({"status": "error", "message": f"Project with ID {project_id} not found."}), 404

        if not project.project_location:
            return jsonify({"status": "error", "message": "Project location is not set."}), 400

        # 2. Get Peak Sun Hours from geo data
        geo_data = get_geo_data(project.project_location)
        if geo_data is None:
            return jsonify({"status": "error", "message": f"Could not find geo data for location: {project.project_location}"}), 400
        
        # 3. Instantiate BLE and run calculations
        ble_instance = BLE(project_data=project, geo_data=geo_data, db_session=session)
        response_data = ble_instance.run_calculations()

        return jsonify(response_data)
