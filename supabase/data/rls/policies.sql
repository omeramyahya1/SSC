/* ========================================================
   1. HELPER FUNCTIONS
   ======================================================== */

-- Extracts a specific claim from the custom JWT.
CREATE OR REPLACE FUNCTION get_jwt_claim(claim TEXT)
RETURNS TEXT AS $$
DECLARE
    json_claims jsonb;
BEGIN
    -- Get claims, handling cases where the setting might be missing
    BEGIN
        json_claims := current_setting('request.jwt.claims', true)::jsonb;
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;

    RETURN json_claims ->> claim;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Convenience functions for accessing specific JWT claims.
-- We use NULLIF to ensure empty strings don't crash UUID casting.
CREATE OR REPLACE FUNCTION jwt_user_id() RETURNS UUID AS $$
    SELECT NULLIF(get_jwt_claim('sub'), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION jwt_app_role() RETURNS TEXT AS $$
    SELECT get_jwt_claim('app_role');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION jwt_org_id() RETURNS UUID AS $$
    SELECT NULLIF(get_jwt_claim('organization_id'), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION jwt_branch_id() RETURNS UUID AS $$
    SELECT NULLIF(get_jwt_claim('branch_id'), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION jwt_distributor_id() RETURNS UUID AS $$
    SELECT NULLIF(get_jwt_claim('distributor_id'), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_superadmin() RETURNS BOOLEAN AS $$
    SELECT jwt_app_role() = 'superadmin';
$$ LANGUAGE sql STABLE;


/* ========================================================
   2. ENABLE RLS ON ALL TABLES
   ======================================================== */
-- This script ensures RLS is active on all tables in the public schema.
DO $$
DECLARE
    t_name TEXT;
BEGIN
    FOR t_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE')
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t_name);
    END LOOP;
END;
$$;


/* ========================================================
   3. RLS POLICIES
   ======================================================== */

-- 3.1. Publicly Readable Tables

DROP POLICY IF EXISTS "Public read access for pricing" ON public.pricing;
CREATE POLICY "Public read access for pricing"
ON public.pricing FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read access for bank accounts" ON public.bank_accounts;
CREATE POLICY "Public read access for bank accounts"
ON public.bank_accounts FOR SELECT USING (true);


-- 3.2. Organizational Data

DROP POLICY IF EXISTS "Orgs: Members can see, admins can modify" ON public.organizations;
CREATE POLICY "Orgs: Members can see, admins can modify"
ON public.organizations FOR ALL USING (
    is_superadmin()
    OR (id = jwt_org_id())
) WITH CHECK (
    is_superadmin()
    OR (id = jwt_org_id() AND jwt_app_role() = 'admin')
);

DROP POLICY IF EXISTS "Branches: Hierarchy access" ON public.branches;
CREATE POLICY "Branches: Hierarchy access"
ON public.branches FOR ALL USING (
    is_superadmin()
    OR (organization_id = jwt_org_id() AND jwt_app_role() = 'admin')
    OR (id = jwt_branch_id() AND jwt_app_role() = 'employee')
) WITH CHECK (
    is_superadmin()
    OR (organization_id = jwt_org_id() AND jwt_app_role() = 'admin')
);


-- 3.3. User & Distributor Data

DROP POLICY IF EXISTS "Users: Hierarchy and self access" ON public.users;
CREATE POLICY "Users: Hierarchy and self access"
ON public.users FOR ALL USING (
    is_superadmin()
    OR id = jwt_user_id()
    OR (jwt_app_role() = 'admin' AND organization_id = jwt_org_id())
    OR (jwt_app_role() = 'distributor' AND distributor_id = jwt_distributor_id())
) WITH CHECK (
    is_superadmin()
    OR id = jwt_user_id()
    OR (jwt_app_role() = 'admin' AND organization_id = jwt_org_id())
);

DROP POLICY IF EXISTS "Distributors: Self access only" ON public.distributors;
CREATE POLICY "Distributors: Self access only"
ON public.distributors FOR ALL USING (
    is_superadmin()
    OR id = jwt_distributor_id()
);

DROP POLICY IF EXISTS "Distributor Financials: Self-service access" ON public.distributor_financials;
CREATE POLICY "Distributor Financials: Self-service access"
ON public.distributor_financials FOR ALL USING (
    is_superadmin()
    OR distributor_id = jwt_distributor_id()
) WITH CHECK (
    is_superadmin()
);


-- 3.4. Core Business Data (Customers, Projects)

DROP POLICY IF EXISTS "Customers: Hierarchy access" ON public.customers;
CREATE POLICY "Customers: Hierarchy access"
ON public.customers FOR ALL USING (
    is_superadmin()
    OR user_id = jwt_user_id()
    OR (jwt_app_role() = 'admin' AND organization_id = jwt_org_id())
);

DROP POLICY IF EXISTS "Projects: Hierarchy access" ON public.projects;
CREATE POLICY "Projects: Hierarchy access"
ON public.projects FOR ALL USING (
    is_superadmin()
    OR user_id = jwt_user_id()
    OR (jwt_app_role() = 'admin' AND organization_id = jwt_org_id())
);


-- 3.5. Child Data (via parent link)

DROP POLICY IF EXISTS "System Config: Access via parent Project" ON public.system_configurations;
CREATE POLICY "System Config: Access via parent Project"
ON public.system_configurations FOR ALL USING (
    is_superadmin() OR (project_id IN (SELECT id FROM public.projects))
);

DROP POLICY IF EXISTS "Appliances: Access via parent Project" ON public.appliances;
CREATE POLICY "Appliances: Access via parent Project"
ON public.appliances FOR ALL USING (
    is_superadmin() OR (project_id IN (SELECT id FROM public.projects))
);

DROP POLICY IF EXISTS "Documents: Access via parent Project" ON public.documents;
CREATE POLICY "Documents: Access via parent Project"
ON public.documents FOR ALL USING (
    is_superadmin() OR (project_id IN (SELECT id FROM public.projects))
);


-- 3.6. Financial Records (Invoices, Payments)

DROP POLICY IF EXISTS "Invoices: Hierarchy access" ON public.invoices;
CREATE POLICY "Invoices: Hierarchy access"
ON public.invoices FOR ALL USING (
    is_superadmin()
    OR user_id = jwt_user_id()
    OR (jwt_app_role() = 'admin' AND project_id IN (SELECT id FROM public.projects WHERE organization_id = jwt_org_id()))
);

DROP POLICY IF EXISTS "Payments: Access via parent Invoice" ON public.payments;
CREATE POLICY "Payments: Access via parent Invoice"
ON public.payments FOR ALL USING (
    is_superadmin() OR (invoice_id IN (SELECT id FROM public.invoices))
);


-- 3.7. Strictly Private User Data

DROP POLICY IF EXISTS "Application Settings: Owner access only" ON public.application_settings;
CREATE POLICY "Application Settings: Owner access only"
ON public.application_settings FOR ALL USING (is_superadmin() OR user_id = jwt_user_id());

DROP POLICY IF EXISTS "Authentication: Owner access only" ON public.authentication;
CREATE POLICY "Authentication: Owner access only"
ON public.authentication FOR ALL USING (is_superadmin() OR user_id = jwt_user_id());

DROP POLICY IF EXISTS "Sync Logs: Owner access only" ON public.sync_logs;
CREATE POLICY "Sync Logs: Owner access only"
ON public.sync_logs FOR ALL USING (is_superadmin() OR user_id = jwt_user_id());

DROP POLICY IF EXISTS "Subscriptions: Owner access only" ON public.subscriptions;
CREATE POLICY "Subscriptions: Owner access only"
ON public.subscriptions FOR ALL USING (is_superadmin() OR user_id = jwt_user_id());

DROP POLICY IF EXISTS "Subscription Payments: Access via parent Subscription" ON public.subscription_payments;
CREATE POLICY "Subscription Payments: Access via parent Subscription"
ON public.subscription_payments FOR ALL USING (
    is_superadmin() OR (subscription_id IN (SELECT id FROM public.subscriptions))
);


-- 3.8. System & Temporary Tables

DROP POLICY IF EXISTS "Notification Jobs: Recipient access" ON public.notification_jobs;
CREATE POLICY "Notification Jobs: Recipient access"
ON public.notification_jobs FOR ALL USING (is_superadmin() OR recipient_user_id = jwt_user_id());

DROP POLICY IF EXISTS "Password Resets: Allow creation, restrict reads" ON public.password_reset_requests;
CREATE POLICY "Password Resets: Allow creation, restrict reads"
ON public.password_reset_requests FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Password Resets: Admin and owner access" ON public.password_reset_requests;
CREATE POLICY "Password Resets: Admin and owner access"
ON public.password_reset_requests FOR SELECT USING (is_superadmin() OR user_id = jwt_user_id());
-- Note: UPDATE/DELETE for password resets usually handled by system functions, but if exposed:
CREATE POLICY "Password Resets: Admin and owner modify"
ON public.password_reset_requests FOR UPDATE USING (is_superadmin() OR user_id = jwt_user_id());
CREATE POLICY "Password Resets: Admin and owner delete"
ON public.password_reset_requests FOR DELETE USING (is_superadmin() OR user_id = jwt_user_id());
