
/* ========================================================
   2. PUBLIC READ TABLES
   (Pricing & Bank Accounts are visible to everyone)
   ======================================================== */

CREATE POLICY "Public: Pricing is visible to all"
ON public.pricing FOR SELECT USING (true);

CREATE POLICY "Public: Bank Accounts are visible to all"
ON public.bank_accounts FOR SELECT USING (true);

/* ========================================================
   3. ORGANIZATIONS & BRANCHES
   ======================================================== */

-- Organizations: Admins see their own; Superadmin sees all
CREATE POLICY "Orgs: Visible to members"
ON public.organizations FOR ALL TO authenticated
USING (
    is_superadmin() OR
    id = jwt_org_id()
);

-- Branches: Org Admin sees all in Org; Employee sees only their assigned branch
CREATE POLICY "Branches: Hierarchy access"
ON public.branches FOR SELECT TO authenticated
USING (
    is_superadmin() OR
    (organization_id = jwt_org_id() AND jwt_app_role() = 'admin') OR
    id = jwt_branch_id()
);

/* ========================================================
   4. USERS
   ======================================================== */

-- Users:
-- 1. View Self
-- 2. Org Admin views users in their Org
-- 3. Distributor views users linked to them
-- 4. Superadmin views all
CREATE POLICY "Users: Hierarchy visibility"
ON public.users FOR SELECT TO authenticated
USING (
    is_superadmin() OR
    id = jwt_user_id() OR
    (organization_id = jwt_org_id() AND jwt_app_role() = 'admin') OR
    (distributor_id = jwt_distributor_id() AND jwt_app_role() = 'distributor')
);

-- Users: Update Self Only (Strict CRUD own data)
CREATE POLICY "Users: Update self"
ON public.users FOR UPDATE TO authenticated
USING (id = jwt_user_id());

/* ========================================================
   5. DISTRIBUTORS
   ======================================================== */

-- Distributors: View own profile
CREATE POLICY "Distributors: View self"
ON public.distributors FOR SELECT TO authenticated
USING (
    is_superadmin() OR
    id = jwt_distributor_id()
);

-- Distributor Financials: View own records
CREATE POLICY "Distributors: View financials"
ON public.distributor_financials FOR SELECT TO authenticated
USING (
    is_superadmin() OR
    distributor_id = jwt_distributor_id()
);

/* ========================================================
   6. CORE TRANSACTIONAL DATA (Projects, Customers)
   Strict Hierarchy: Superadmin > Org Admin > Owner (User/Employee)
   ======================================================== */

-- Customers
CREATE POLICY "Customers: Hierarchy access"
ON public.customers FOR ALL TO authenticated
USING (
    deleted_at IS NULL AND (
        is_superadmin() OR
        user_id = jwt_user_id() OR
        (organization_id = jwt_org_id() AND jwt_app_role() = 'admin')
    )
);

-- Projects
CREATE POLICY "Projects: Hierarchy access"
ON public.projects FOR ALL TO authenticated
USING (
    deleted_at IS NULL AND (
        is_superadmin() OR
        user_id = jwt_user_id() OR
        (organization_id = jwt_org_id() AND jwt_app_role() = 'admin')
    )
);

/* ========================================================
   7. PROJECT CHILDREN (Appliances, Docs, Configs)
   These tables lack user_id/org_id, so we verify parent Project access.
   ======================================================== */

CREATE POLICY "System Config: Via Project"
ON public.system_configurations FOR ALL TO authenticated
USING (
    project_id IN (SELECT id FROM public.projects)
);

CREATE POLICY "Appliances: Via Project"
ON public.appliances FOR ALL TO authenticated
USING (
    project_id IN (SELECT id FROM public.projects)
);

CREATE POLICY "Documents: Via Project"
ON public.documents FOR ALL TO authenticated
USING (
    project_id IN (SELECT id FROM public.projects)
);

/* ========================================================
   8. FINANCIALS (Invoices, Payments)
   Invoices have user_id, so we can optimize without joining Projects.
   ======================================================== */

CREATE POLICY "Invoices: Access own or Org"
ON public.invoices FOR ALL TO authenticated
USING (
    deleted_at IS NULL AND (
        is_superadmin() OR
        user_id = jwt_user_id() OR
        (jwt_app_role() = 'admin' AND project_id IN (
            SELECT p.id
            FROM public.projects p
            WHERE p.organization_id = jwt_org_id()
        ))
    )
);

CREATE POLICY "Payments: Via Invoice"
ON public.payments FOR ALL TO authenticated
USING (
    invoice_id IN (SELECT id FROM public.invoices)
);

/* ========================================================
   9. PRIVATE USER DATA (Settings, Subs, Auth, Sync)
   Strictly Owner Only
   ======================================================== */

CREATE POLICY "Settings: Owner only"
ON public.application_settings FOR ALL TO authenticated
USING (user_id = jwt_user_id());

CREATE POLICY "Subscriptions: Owner only"
ON public.subscriptions FOR ALL TO authenticated
USING (user_id = jwt_user_id());

CREATE POLICY "Sub Payments: Owner only"
ON public.subscription_payments FOR ALL TO authenticated
USING (
    subscription_id IN (SELECT id FROM public.subscriptions WHERE user_id = jwt_user_id())
);

CREATE POLICY "Auth: Owner only"
ON public.authentication FOR ALL TO authenticated
USING (user_id = jwt_user_id());

CREATE POLICY "Sync Logs: Owner only"
ON public.sync_logs FOR ALL TO authenticated
USING (user_id = jwt_user_id());
