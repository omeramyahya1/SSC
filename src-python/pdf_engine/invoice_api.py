# API endpoint for invoice generation

import sys
import json
import base64

sys.path.append("..")  # Adjust the path as necessary to import utils and models

from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy import select
from db_setup import SessionLocal
from models import Project


def get_invoice_data(project_id: int) -> str:
    """
    Fetch aggregated data from the database for the given project_id and return as a JSON string.
    """

    with SessionLocal() as session:
        # Correctly load related entities using relationship names
        stmt = (
            select(Project)
            .where(Project.project_id == project_id)
            .options(
                joinedload(Project.user),
                joinedload(Project.customer),
                joinedload(Project.system_config),
                selectinload(Project.invoices),
            )
        )

        project = session.scalar(stmt)

        if not project:
            print(f"❌ No project found with ID {project_id}")
            return None

        output_data = {}

        # User data
        if project.user:
            # Note: 'phone_number' is not in the User model and will be skipped.
            # 'business_log' is assumed to be 'business_logo'.
            output_data["user"] = {
                "business_name": project.user.business_name,
                "email": project.user.email,
                "location": project.user.location,
                "business_logo": base64.b64encode(project.user.business_logo).decode(
                    "utf-8"
                )
                if project.user.business_logo
                else None,
            }

        # Customer data
        if project.customer:
            output_data["customers"] = {
                "customer_name": project.customer.full_name,
                "phone_number": project.customer.phone_number,
                "email": project.customer.email,
            }

        # Project data
        output_data["projects"] = {"location": project.project_location}

        # Invoices data
        if project.invoices:
            output_data["invoice"] = [
                {
                    "invoices_number": invoice.invoice_id,
                    "issue_date": invoice.issued_at.isoformat()
                    if invoice.issued_at
                    else None,
                }
                for invoice in project.invoices
            ]

        # System configuration data
        if project.system_config:
            output_data["system_configurations"] = {
                "config_items": project.system_config.config_items
            }

        return json.dumps(output_data, indent=4)



