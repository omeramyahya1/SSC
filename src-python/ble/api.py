# src-python/ble/api.py
# BLE API endpoint

import sys
sys.path.append("..")  # Adjust the path as necessary to import utils and models

import json
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy import select
from db_setup import SessionLocal
from models import Project, SystemConfiguration, Appliance, ApplicationSettings

def get_project_data(project_id: int) -> str:
    """
    Fetch data from the database for the given project_id and return as a JSON string.
    """

    with SessionLocal() as session:
        # load project data
        stmt = (
            select(Project)
            .where(Project.project_id == project_id)
        )

        project = session.scalar(stmt)
        
        if not project:
            print(f"❌ No project found with ID {project_id}")
            return None
        
        return json.dumps({
            "project_id": project.project_id,
            "customer_id": project.customer_id,
            "user_id": project.user_id,
            "status": project.status,
            "system_config_id": project.system_config_id,
            "project_location": project.project_location if project.project_location else None
        }, indent=4)


def create_system_configuration(data: dict):
    """
    Create new SystemConfiguration entry in the database.
    """
    pass
