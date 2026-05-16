from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple

from flask import jsonify
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from models import Authentication, Invoice, Project, User


@dataclass(frozen=True)
class AuthContext:
    user: User

    @property
    def is_admin(self) -> bool:
        return self.user.role == "admin"

    @property
    def is_employee(self) -> bool:
        return self.user.role == "employee"

    @property
    def org_uuid(self) -> Optional[str]:
        return self.user.organization_uuid

    @property
    def branch_uuid(self) -> Optional[str]:
        return self.user.branch_uuid

    @property
    def user_uuid(self) -> str:
        return self.user.uuid


def get_current_user(db: Session) -> Tuple[Optional[AuthContext], Optional[tuple]]:
    auth_record = (
        db.query(Authentication)
        .filter(Authentication.is_logged_in.is_(True))
        .order_by(Authentication.last_active.desc())
        .first()
    )
    if not auth_record:
        return None, (jsonify({"error": "No authenticated user found. Please log in."}), 401)

    current_user = (
        db.query(User)
        .filter(User.uuid == auth_record.user_uuid, User.deleted_at.is_(None))
        .first()
    )
    if not current_user:
        return None, (jsonify({"error": "Authenticated user not found in user table."}), 404)

    return AuthContext(user=current_user), None


def invoice_effective_org_branch(invoice: Invoice) -> tuple[Optional[str], Optional[str]]:
    """
    Prefer Project org/branch when present, else fall back to invoice issuer's org/branch.
    Assumes invoice.project and invoice.user relationships may be loaded.
    """
    org_uuid = None
    branch_uuid = None
    if getattr(invoice, "project", None) is not None:
        org_uuid = getattr(invoice.project, "organization_uuid", None)
        branch_uuid = getattr(invoice.project, "branch_uuid", None)
    if org_uuid is None and getattr(invoice, "user", None) is not None:
        org_uuid = getattr(invoice.user, "organization_uuid", None)
    if branch_uuid is None and getattr(invoice, "user", None) is not None:
        branch_uuid = getattr(invoice.user, "branch_uuid", None)
    return org_uuid, branch_uuid


def can_view_invoice(ctx: AuthContext, invoice: Invoice) -> bool:
    if ctx.org_uuid:
        inv_org, inv_branch = invoice_effective_org_branch(invoice)
        if inv_org != ctx.org_uuid:
            return False

        # Employees: branch-only visibility
        if ctx.is_employee:
            if inv_branch != ctx.branch_uuid:
                return False
            # Other employees' drafts are hidden
            if invoice.user_uuid != ctx.user_uuid and not invoice.issued_at:
                return False
            return True

        # Admin: org-wide; cross-branch is view-only but still visible only if issued.
        if ctx.is_admin:
            if inv_branch != ctx.branch_uuid:
                return bool(invoice.issued_at)
            return True

        # Non-admin org user: treat as branch user.
        if inv_branch != ctx.branch_uuid:
            return False
        if invoice.user_uuid != ctx.user_uuid and not invoice.issued_at:
            return False
        return True

    # No org: personal scope
    return invoice.user_uuid == ctx.user_uuid


def can_mutate_invoice(ctx: AuthContext, invoice: Invoice) -> bool:
    """
    Edit/issue/delete permissions.
    - Employee: only own invoices
    - Admin: full within own branch; view-only (no mutate) across branches
    """
    if not can_view_invoice(ctx, invoice):
        return False

    if ctx.org_uuid:
        inv_org, inv_branch = invoice_effective_org_branch(invoice)
        if inv_org != ctx.org_uuid:
            return False
        if ctx.is_admin:
            return inv_branch == ctx.branch_uuid
        # employee / normal: only own
        return invoice.user_uuid == ctx.user_uuid

    return invoice.user_uuid == ctx.user_uuid


def invoice_access_flags(ctx: AuthContext, invoice: Invoice) -> dict:
    if not can_view_invoice(ctx, invoice):
        return {"mode": "hidden", "can_edit": False, "can_delete": False, "can_issue": False, "can_add_payment": False, "can_delete_payment": False}

    can_mutate = can_mutate_invoice(ctx, invoice)

    # Payments: allowed only on issued invoices
    can_add_payment = bool(invoice.issued_at) and can_mutate

    # Deleting payments on other-issuer invoices: only issuer or admin within same branch.
    can_delete_payment = False
    if invoice.issued_at:
        if ctx.is_admin:
            can_delete_payment = can_mutate
        else:
            can_delete_payment = can_mutate and invoice.user_uuid == ctx.user_uuid

    return {
        "mode": "full" if can_mutate else "view",
        "can_edit": can_mutate and not invoice.issued_at,
        "can_issue": can_mutate and not invoice.issued_at,
        "can_delete": can_mutate,
        "can_add_payment": can_add_payment,
        "can_delete_payment": can_delete_payment,
    }


def apply_invoice_visibility_filter(query, ctx: AuthContext):
    """
    Apply DB-side visibility filter for invoice lists where possible.
    Expects query to have outer-joined Project and User (issuer).
    """
    if not ctx.org_uuid:
        return query.filter(Invoice.user_uuid == ctx.user_uuid)

    # Must be same org.
    query = query.filter(func.coalesce(Project.organization_uuid, User.organization_uuid) == ctx.org_uuid)

    if ctx.is_employee or (ctx.user.role not in ("admin",) and ctx.branch_uuid):
        # Branch-only
        query = query.filter(func.coalesce(Project.branch_uuid, User.branch_uuid) == ctx.branch_uuid)
        # Hide other employees' drafts
        query = query.filter(or_(Invoice.user_uuid == ctx.user_uuid, Invoice.issued_at.isnot(None)))
        return query

    if ctx.is_admin:
        # Admin can see own branch drafts; other branches only issued.
        return query.filter(
            or_(
                func.coalesce(Project.branch_uuid, User.branch_uuid) == ctx.branch_uuid,
                Invoice.issued_at.isnot(None),
            )
        )

    return query
