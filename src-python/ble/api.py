# src-python/ble/api.py
# BLE API endpoint

import sys
import os
from flask import Blueprint, jsonify, request
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
@ble_bp.route('/calculate/<int:project_id>', methods=['POST'])
def calculate_system(project_id: int):
    """
    Calculate the required solar system configuration based on project data.
    Accepts an optional 'settings' object in the POST body to override defaults.
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

        # Add a check for invalid geo_data
        if geo_data['gti'] <= 0 or geo_data['pvout'] <= 0:
            return jsonify({"status": "error", "message": f"Insufficient geo data for location: {project.project_location}. Please select a different location."}), 400

        # 3. Get override settings from request body
        override_settings = (request.json or {}).get('settings', {})

        # 4. Instantiate BLE and run calculations
        ble_instance = BLE(
            project_data=project,
            geo_data=geo_data,
            db_session=session,
            override_settings=override_settings
        )
        response_data = ble_instance.run_calculations()

        return jsonify(response_data)
