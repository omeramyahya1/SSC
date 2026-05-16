from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from sqlalchemy import func
from sqlalchemy.orm import joinedload
from datetime import datetime
from typing import Optional
from utils import get_db
from models import Invoice, Project, Payment, User, Customer
from finances.finances import reverse_stock_deduction
from schemas import InvoiceCreate, InvoiceUpdate
from serializer import model_to_dict
from authz import (
    apply_invoice_visibility_filter,
    can_mutate_invoice,
    get_current_user,
    invoice_access_flags,
)
import logging

invoice_bp = Blueprint('invoice_bp', __name__, url_prefix='/invoices')

def _get_invoice_scope(user: User):
    if user.organization_uuid:
        if user.role == 'admin':
            return {"level": "org", "org_uuid": user.organization_uuid, "branch_uuid": None, "user_uuid": None}
        return {"level": "branch", "org_uuid": user.organization_uuid, "branch_uuid": user.branch_uuid, "user_uuid": None}
    return {"level": "user", "org_uuid": None, "branch_uuid": None, "user_uuid": user.uuid}

def _apply_invoice_scope(query, scope):
    """
    Expects query to already include outerjoins to Project and User.
    """
    if scope["level"] == "org":
        return query.filter(
            func.coalesce(Project.organization_uuid, User.organization_uuid) == scope["org_uuid"]
        )
    if scope["level"] == "branch":
        return query.filter(
            func.coalesce(Project.organization_uuid, User.organization_uuid) == scope["org_uuid"],
            func.coalesce(Project.branch_uuid, User.branch_uuid) == scope["branch_uuid"],
        )
    return query.filter(Invoice.user_uuid == scope["user_uuid"])

def _parse_bool_arg(value: Optional[str], default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in ("1", "true", "yes", "y", "on")

@invoice_bp.route('/', methods=['POST'])
def create_invoice():
    try:
        validated_data = InvoiceCreate(**request.json)
    except ValidationError as e:
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        try:
            ctx, error_response = get_current_user(db)
            if error_response:
                return error_response

            existing = None
            if validated_data.project_uuid:
                existing = db.query(Invoice).filter(Invoice.project_uuid == validated_data.project_uuid).first()
            if existing:
                # Idempotent create-by-project: if an invoice already exists for the project,
                # apply any provided fields (e.g. invoice_details / invoice_items / amount)
                # instead of silently discarding them.
                update_data = validated_data.dict(exclude_unset=True)
                # Never alter the project linkage for an existing invoice here.
                update_data.pop("project_uuid", None)
                # Never allow creating/updating invoices on behalf of another user.
                update_data["user_uuid"] = ctx.user_uuid
                for key, value in update_data.items():
                    setattr(existing, key, value)
                existing.is_dirty = True
                db.commit()
                db.refresh(existing)
                d = model_to_dict(existing)
                d["issued_by_username"] = existing.user.username if existing.user else None
                d["access"] = invoice_access_flags(ctx, existing)
                return jsonify(d), 200

            create_data = validated_data.dict(exclude_unset=True)
            create_data["user_uuid"] = ctx.user_uuid
            new_item = Invoice(**create_data)
            new_item.is_dirty = True
            db.add(new_item)
            db.commit()
            db.refresh(new_item)
            d = model_to_dict(new_item)
            d["issued_by_username"] = new_item.user.username if new_item.user else None
            d["access"] = invoice_access_flags(ctx, new_item)
            return jsonify(d), 201
        except Exception as e:
            db.rollback()
            logging.exception("Error creating invoice")
            return jsonify({"error": "Internal server error"}), 500

@invoice_bp.route('/<string:uuid>', methods=['PUT'])
def update_invoice(uuid):
    with get_db() as db:
        ctx, error_response = get_current_user(db)
        if error_response:
            return error_response

        item = (
            db.query(Invoice)
            .outerjoin(Project, Invoice.project_uuid == Project.uuid)
            .outerjoin(User, Invoice.user_uuid == User.uuid)
            .filter(Invoice.uuid == uuid, Invoice.deleted_at.is_(None))
            .first()
        )
        if not item:
            return jsonify({"error": "Not found"}), 404
        if not can_mutate_invoice(ctx, item):
            return jsonify({"error": "Forbidden"}), 403

        try:
            validated_data = InvoiceUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        update_data = validated_data.dict(exclude_unset=True)
        update_data.pop("user_uuid", None)
        update_data.pop("project_uuid", None)
        for key, value in update_data.items():
            setattr(item, key, value)

        item.is_dirty = True
        db.commit()
        db.refresh(item)
        d = model_to_dict(item)
        d["issued_by_username"] = item.user.username if item.user else None
        d["access"] = invoice_access_flags(ctx, item)
        return jsonify(d)

@invoice_bp.route('/', methods=['GET'])
def get_all_invoices():
    with get_db() as db:
        ctx, error_response = get_current_user(db)
        if error_response:
            return error_response
        scope = _get_invoice_scope(ctx.user)

        project_uuid = request.args.get('project_uuid')
        branch_uuid = request.args.get('branch_uuid')
        status = request.args.get('status')

        # Use outerjoin to include invoices without projects
        query = (
            db.query(Invoice)
            .outerjoin(Project, Invoice.project_uuid == Project.uuid)
            .outerjoin(User, Invoice.user_uuid == User.uuid)
            .filter(Invoice.deleted_at.is_(None))
            .filter(Project.deleted_at.is_(None) | Invoice.project_uuid.is_(None))
        )

        query = apply_invoice_visibility_filter(_apply_invoice_scope(query, scope), ctx)

        # Optional additional narrowing (never broadens beyond scope)
        if branch_uuid and scope["level"] == "org":
            query = query.filter(Project.branch_uuid == branch_uuid)
        if project_uuid:
            query = query.filter(Invoice.project_uuid == project_uuid)
        if status:
            query = query.filter(Invoice.status == status)

        items = query.order_by(Invoice.created_at.desc()).all()

        independent_customer_uuids = {
            (i.invoice_details or {}).get("customer_uuid")
            for i in items
            if not i.project_uuid and (i.invoice_details or {}).get("customer_uuid")
        }
        customers_by_uuid = {}
        if independent_customer_uuids:
            customers_by_uuid = {
                c.uuid: c
                for c in db.query(Customer)
                .filter(Customer.uuid.in_(independent_customer_uuids), Customer.deleted_at.is_(None))
                .all()
            }

        results = []
        for i in items:
            d = model_to_dict(i)
            d["issued_by_username"] = i.user.username if i.user else None
            d["access"] = invoice_access_flags(ctx, i)
            if i.project and i.project.customer:
                d["customer_name"] = i.project.customer.full_name
            else:
                cust_uuid = (i.invoice_details or {}).get("customer_uuid")
                cust = customers_by_uuid.get(cust_uuid) if cust_uuid else None
                if cust:
                    d["customer_name"] = cust.full_name

            # Add Payment Stats
            paid = (
                db.query(func.sum(Payment.amount))
                .filter(Payment.invoice_uuid == i.uuid, Payment.deleted_at.is_(None))
                .scalar()
                or 0.0
            )
            d['paid_amount'] = float(paid)
            d['remainder'] = float((float(i.amount if i.amount else 0.0)) - float(paid))

            # Extract Due Date from JSON
            if i.invoice_details and 'due_date' in i.invoice_details:
                d['due_date'] = i.invoice_details['due_date']

            results.append(d)

        return jsonify(results)

@invoice_bp.route('/<string:uuid>', methods=['GET'])
def get_invoice(uuid):
    with get_db() as db:
        ctx, error_response = get_current_user(db)
        if error_response:
            return error_response
        scope = _get_invoice_scope(ctx.user)

        query = (
            db.query(Invoice)
            .outerjoin(Project, Invoice.project_uuid == Project.uuid)
            .outerjoin(User, Invoice.user_uuid == User.uuid)
            .filter(Invoice.uuid == uuid, Invoice.deleted_at.is_(None))
        )
        item = apply_invoice_visibility_filter(_apply_invoice_scope(query, scope), ctx).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        d = model_to_dict(item)
        d["issued_by_username"] = item.user.username if item.user else None
        d["access"] = invoice_access_flags(ctx, item)
        return jsonify(d)

@invoice_bp.route('/project/<string:project_uuid>', methods=['GET'])
def get_invoice_by_project(project_uuid):
    with get_db() as db:
        ctx, error_response = get_current_user(db)
        if error_response:
            return error_response
        scope = _get_invoice_scope(ctx.user)

        query = (
            db.query(Invoice)
            .outerjoin(Project, Invoice.project_uuid == Project.uuid)
            .outerjoin(User, Invoice.user_uuid == User.uuid)
            .filter(Invoice.project_uuid == project_uuid, Invoice.deleted_at.is_(None))
        )
        item = apply_invoice_visibility_filter(_apply_invoice_scope(query, scope), ctx).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        d = model_to_dict(item)
        d["issued_by_username"] = item.user.username if item.user else None
        d["access"] = invoice_access_flags(ctx, item)
        return jsonify(d)

@invoice_bp.route('/<string:uuid>', methods=['DELETE'])
def delete_invoice(uuid):
    cascade_payments = _parse_bool_arg(request.args.get('cascade_payments'), default=False)
    with get_db() as db:
        try:
            ctx, error_response = get_current_user(db)
            if error_response:
                return error_response

            # Always use the authenticated user for stock reversal.
            user_uuid = ctx.user_uuid

            item = (
                db.query(Invoice)
                .outerjoin(Project, Invoice.project_uuid == Project.uuid)
                .outerjoin(User, Invoice.user_uuid == User.uuid)
                .filter(Invoice.uuid == uuid, Invoice.deleted_at.is_(None))
                .first()
            )
            if not item:
                return jsonify({"error": "Not found"}), 404
            if not can_mutate_invoice(ctx, item):
                return jsonify({"error": "Forbidden"}), 403

            project = db.query(Project).filter(Project.uuid == item.project_uuid, Project.deleted_at.is_(None)).first()
            if project and project.status == 'done':
                project.status = 'planning'

            # Rollback stock if issued
            if item.issued_at and user_uuid:
                reverse_stock_deduction(db, item.uuid, user_uuid)

            now = datetime.utcnow()
            item.issued_at = None
            item.deleted_at = now
            item.is_dirty = True

            if cascade_payments:
                db.query(Payment).filter(
                    Payment.invoice_uuid == item.uuid,
                    Payment.deleted_at.is_(None),
                ).update(
                    {Payment.deleted_at: now, Payment.is_dirty: True},
                    synchronize_session=False
                )

            db.commit()
            return jsonify({"message": "Deleted successfully"}), 200
        except Exception as e:
            db.rollback()
            logging.exception("Error deleting invoice")
            return jsonify({"error": str(e)}), 500
