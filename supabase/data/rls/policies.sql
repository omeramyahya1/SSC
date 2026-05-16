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
    OR (id = jwt_org_id() AND jwt_app_role() IN ('admin', 'user'))
);

DROP POLICY IF EXISTS "Branches: Hierarchy access" ON public.branches;
CREATE POLICY "Branches: Hierarchy access"
ON public.branches FOR ALL USING (
    is_superadmin()
    OR (organization_id = jwt_org_id() AND jwt_app_role() = 'admin')
    OR (id = jwt_branch_id() AND jwt_app_role() = 'employee')
    OR (id = jwt_branch_id() AND jwt_app_role() = 'user')
) WITH CHECK (
    is_superadmin()
    OR (organization_id = jwt_org_id() AND jwt_app_role() = 'admin')
    OR (id = jwt_branch_id() AND organization_id = jwt_org_id() AND jwt_app_role() = 'user')
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

-- 3.X. Sync State (per-device cursor)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'sync_state'
    ) THEN
        EXECUTE 'DROP POLICY IF EXISTS "SyncState: Self access" ON public.sync_state';
        EXECUTE $pol$
            CREATE POLICY "SyncState: Self access"
            ON public.sync_state FOR ALL USING (
                is_superadmin()
                OR user_id = jwt_user_id()
            ) WITH CHECK (
                is_superadmin()
                OR user_id = jwt_user_id()
            )
        $pol$;
    END IF;
END;
$$;

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
    OR (
        jwt_app_role() = 'employee'
        AND EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = customers.user_id
            AND u.organization_id = jwt_org_id()
            AND u.branch_id = jwt_branch_id()
        )
    )
) WITH CHECK (
    is_superadmin()
    OR user_id = jwt_user_id()
    OR (jwt_app_role() = 'admin' AND organization_id = jwt_org_id())
    OR (
        jwt_app_role() = 'employee'
        AND EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = customers.user_id
            AND u.organization_id = jwt_org_id()
            AND u.branch_id = jwt_branch_id()
        )
    )
);

DROP POLICY IF EXISTS "Projects: Hierarchy access" ON public.projects;
CREATE POLICY "Projects: Hierarchy access"
ON public.projects FOR ALL USING (
    is_superadmin()
    OR user_id = jwt_user_id()
    OR (jwt_app_role() = 'admin' AND organization_id = jwt_org_id())
    OR (
        jwt_app_role() = 'employee'
        AND organization_id = jwt_org_id()
        AND EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = projects.user_id
            AND u.organization_id = jwt_org_id()
            AND u.branch_id = jwt_branch_id()
        )
    )
) WITH CHECK (
    is_superadmin()
    OR user_id = jwt_user_id()
    OR (jwt_app_role() = 'admin' AND organization_id = jwt_org_id())
    OR (
        jwt_app_role() = 'employee'
        AND organization_id = jwt_org_id()
        AND EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = projects.user_id
            AND u.organization_id = jwt_org_id()
            AND u.branch_id = jwt_branch_id()
        )
    )
);


-- =================================================================
-- PRODUCTION ENFORCEMENT: SECURED CHILD RELATIONSHIPS
-- =================================================================

-- 1. SYSTEM CONFIGURATIONS
ALTER TABLE public.system_configurations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "System Configurations temporary pass" ON public.system_configurations;
DROP POLICY IF EXISTS "System Config: Access via parent Project" ON public.system_configurations;
DROP POLICY IF EXISTS "System Configurations secure access" ON public.system_configurations;

CREATE POLICY "System Configurations secure access"
ON public.system_configurations FOR ALL
USING (
    is_superadmin()
    -- Otherwise, check project relationships for Users and Employees
    OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.system_config_id = system_configurations.id
        AND (
            -- Standard Users: Must own the parent project
            (jwt_app_role() = 'user' AND p.user_id = jwt_user_id())
            OR
            -- Employees / Mutation Admins: Restrict context to same organization projects
            (jwt_app_role() IN ('admin', 'employee') AND p.organization_id = jwt_org_id())
        )
    )
)
WITH CHECK (
    is_superadmin()
    OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.system_config_id = system_configurations.id
        AND (
            (jwt_app_role() = 'user' AND p.user_id = jwt_user_id())
            OR
            (jwt_app_role() IN ('admin', 'employee') AND p.organization_id = jwt_org_id())
        )
    )
);


-- 2. APPLIANCES
ALTER TABLE public.appliances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Appliances temporary pass" ON public.appliances;
DROP POLICY IF EXISTS "Appliances: Access via parent Project" ON public.appliances;
DROP POLICY IF EXISTS "Appliances secure access" ON public.appliances;

CREATE POLICY "Appliances secure access"
ON public.appliances FOR ALL
USING (
    is_superadmin()
    -- Structural validation lookup matching project constraints
    OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = appliances.project_id
        AND (
            (jwt_app_role() = 'user' AND p.user_id = jwt_user_id())
            OR
            (jwt_app_role() IN ('admin', 'employee') AND p.organization_id = jwt_org_id())
        )
    )
)
WITH CHECK (
    is_superadmin()
    OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = appliances.project_id
        AND (
            (jwt_app_role() = 'user' AND p.user_id = jwt_user_id())
            OR
            (jwt_app_role() IN ('admin', 'employee') AND p.organization_id = jwt_org_id())
        )
    )
);


-- 3. DOCUMENTS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Documents temporary pass" ON public.documents;
DROP POLICY IF EXISTS "Documents: Access via parent Project" ON public.documents;
DROP POLICY IF EXISTS "Documents secure access" ON public.documents;

CREATE POLICY "Documents secure access"
ON public.documents FOR ALL
USING (
    is_superadmin()
    OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = documents.project_id
        AND (
            (jwt_app_role() = 'user' AND p.user_id = jwt_user_id())
            OR
            (jwt_app_role() IN ('admin', 'employee') AND p.organization_id = jwt_org_id())
        )
    )
)
WITH CHECK (
    is_superadmin()
    OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = documents.project_id
        AND (
            (jwt_app_role() = 'user' AND p.user_id = jwt_user_id())
            OR
            (jwt_app_role() IN ('admin', 'employee') AND p.organization_id = jwt_org_id())
        )
    )
);

-- 3.6. Financial Records (Invoices, Payments)
-- =================================================================
-- REFACTORED RLS POLICIES: INVOICES
-- =================================================================
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Invoices: Hierarchy access" ON public.invoices;

CREATE POLICY "Invoices: Hierarchy access"
ON public.invoices FOR ALL
USING (
    is_superadmin()
    -- 1. Standard users can see their own invoices
    OR (jwt_app_role() = 'user' AND user_id = jwt_user_id())
    -- 2. Admins can see all invoices within the same organization
    OR (
        jwt_app_role() = 'admin'
        AND (
            project_id IN (SELECT id FROM public.projects WHERE organization_id = jwt_org_id())
            OR
            user_id IN (SELECT id FROM public.users WHERE organization_id = jwt_org_id())
        )
    )
    -- 3. Employees are restricted to their branch
    OR (
        jwt_app_role() = 'employee'
        AND (
            project_id IN (SELECT id FROM public.projects WHERE organization_id = jwt_org_id() AND branch_id = jwt_branch_id())
            OR
            user_id IN (SELECT id FROM public.users WHERE organization_id = jwt_org_id() AND branch_id = jwt_branch_id())
        )
    )
)
WITH CHECK (
    is_superadmin()
    OR (jwt_app_role() = 'user' AND user_id = jwt_user_id())
    OR (
        jwt_app_role() = 'admin'
        AND (
            project_id IN (SELECT id FROM public.projects WHERE organization_id = jwt_org_id())
            OR
            user_id IN (SELECT id FROM public.users WHERE organization_id = jwt_org_id())
        )
    )
    OR (
        jwt_app_role() = 'employee'
        AND (
            project_id IN (SELECT id FROM public.projects WHERE organization_id = jwt_org_id() AND branch_id = jwt_branch_id())
            OR
            user_id IN (SELECT id FROM public.users WHERE organization_id = jwt_org_id() AND branch_id = jwt_branch_id())
        )
    )
);


-- =================================================================
-- REFACTORED RLS POLICIES: PAYMENTS
-- =================================================================
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payments: Access via parent Invoice" ON public.payments;

-- This is secure because the database uses the corrected invoice row policy above
CREATE POLICY "Payments: Access via parent Invoice"
ON public.payments FOR ALL
USING (
    is_superadmin()
    OR EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = payments.invoice_id
    )
)
WITH CHECK (
    is_superadmin()
    OR EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = payments.invoice_id
    )
);
-- 3.7. Strictly Private User Data

DROP POLICY IF EXISTS "Application Settings: Owner access only" ON public.application_settings;
CREATE POLICY "Application Settings: Owner access only"
ON public.application_settings FOR ALL USING (is_superadmin() OR user_id = jwt_user_id());

DROP POLICY IF EXISTS "Authentications: Owner access only" ON public.authentications;
CREATE POLICY "Authentications: Owner access only"
ON public.authentications
FOR ALL
USING (
    is_superadmin()
    OR user_id = jwt_user_id()
    OR (
        jwt_app_role() = 'admin'
        AND EXISTS (
            SELECT 1
            FROM public.users u
            WHERE u.id = authentications.user_id
              AND u.organization_id = jwt_org_id()
        )
    )
)
WITH CHECK (
    is_superadmin()
    OR user_id = jwt_user_id()
    OR (
        jwt_app_role() = 'admin'
        AND EXISTS (
            SELECT 1
            FROM public.users u
            WHERE u.id = authentications.user_id
              AND u.organization_id = jwt_org_id()
        )
    )
);

DROP POLICY IF EXISTS "Sync Logs: Owner access only" ON public.sync_logs;
CREATE POLICY "Sync Logs: Owner access only"
ON public.sync_logs FOR ALL USING (is_superadmin() OR user_id = jwt_user_id());

DROP POLICY IF EXISTS "Subscriptions: Owner access only" ON public.subscriptions;
CREATE POLICY "Subscriptions: Owner access only"
ON public.subscriptions FOR ALL USING (is_superadmin() OR user_id = jwt_user_id());

DROP POLICY IF EXISTS "Subscription Payments: Access via parent Subscription" ON public.subscription_payments;
CREATE POLICY "Subscription Payments: Access via parent Subscription"
ON public.subscription_payments FOR ALL USING (
    is_superadmin() OR EXISTS (
        SELECT 1 FROM public.subscriptions s
        WHERE s.id = subscription_payments.subscription_id
    )
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

-- =================================================================
-- REFACTORED RLS POLICIES: INVENTORY CATEGORIES
-- =================================================================
ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;

-- Clear any old versions safely
DROP POLICY IF EXISTS "Allow global full access on inventory_categories" ON public.inventory_categories;
DROP POLICY IF EXISTS "Allow admin full access on inventory_categories" ON public.inventory_categories;
DROP POLICY IF EXISTS "Allow employee full access on inventory_categories" ON public.inventory_categories;
DROP POLICY IF EXISTS "Allow employee read access on inventory_categories" ON public.inventory_categories;
DROP POLICY IF EXISTS "Allow user full access on own inventory_categories" ON public.inventory_categories;

-- 1. Everyone can view categories
CREATE POLICY "Allow global select on inventory_categories"
ON public.inventory_categories
FOR SELECT
USING (true);

-- 2. Authorized agents can modify
CREATE POLICY "Allow authorized insert on inventory_categories"
ON public.inventory_categories
FOR INSERT
WITH CHECK (
    is_superadmin()
    OR (jwt_app_role() = 'admin' AND organization_id = jwt_org_id())
    OR (jwt_app_role() = 'user' AND user_id = jwt_user_id())
);

CREATE POLICY "Allow authorized update on inventory_categories"
ON public.inventory_categories
FOR UPDATE
USING (
    is_superadmin()
    OR (jwt_app_role() = 'admin' AND organization_id = jwt_org_id())
    OR (jwt_app_role() = 'user' AND user_id = jwt_user_id())
)
WITH CHECK (
    is_superadmin()
    OR (jwt_app_role() = 'admin' AND organization_id = jwt_org_id())
    OR (jwt_app_role() = 'user' AND user_id = jwt_user_id())
);

CREATE POLICY "Allow authorized delete on inventory_categories"
ON public.inventory_categories
FOR DELETE
USING (
    is_superadmin()
    OR (jwt_app_role() = 'admin' AND organization_id = jwt_org_id())
    OR (jwt_app_role() = 'user' AND user_id = jwt_user_id())
);


-- =================================================================
-- REFACTORED RLS POLICIES: INVENTORY ITEMS
-- =================================================================
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admin full access on inventory_items" ON public.inventory_items;
DROP POLICY IF EXISTS "Allow employee full access on branch inventory_items" ON public.inventory_items;
DROP POLICY IF EXISTS "Allow employee read access on organization inventory_items" ON public.inventory_items;
DROP POLICY IF EXISTS "Allow user full access on own inventory_items" ON public.inventory_items;

-- 1. Standard Users: Full CRUD on their own items
CREATE POLICY "Allow user full access on own inventory_items"
ON public.inventory_items
FOR ALL
USING (
    is_superadmin()
    OR (jwt_app_role() = 'user' AND user_id = jwt_user_id())
)
WITH CHECK (
    is_superadmin()
    OR (jwt_app_role() = 'user' AND user_id = jwt_user_id())
);

-- 2. Admins & Employees: Forced to their own branch only
CREATE POLICY "Allow branch staff full access on inventory_items"
ON public.inventory_items
FOR ALL
USING (
    is_superadmin()
    OR (
        jwt_app_role() IN ('admin', 'employee')
        AND organization_id = jwt_org_id()
        AND branch_id = jwt_branch_id()
    )
)
WITH CHECK (
    is_superadmin()
    OR (
        jwt_app_role() IN ('admin', 'employee')
        AND organization_id = jwt_org_id()
        AND branch_id = jwt_branch_id()
    )
);


-- =================================================================
-- REFACTORED RLS POLICIES: STOCK ADJUSTMENTS
-- =================================================================
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admin full access on stock_adjustments" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Allow employee full access on branch stock_adjustments" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Allow user to create their own stock_adjustments" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Allow user to view their own stock_adjustments" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Allow user full access on own stock_adjustments" ON public.stock_adjustments;

-- Staff Adjustments: Tied strictly to item relationship branch visibility
CREATE POLICY "Allow branch staff full access on stock_adjustments"
ON public.stock_adjustments
FOR ALL
USING (
    is_superadmin()
    OR (
        jwt_app_role() IN ('admin', 'employee')
        AND EXISTS (
            SELECT 1 FROM public.inventory_items i
            WHERE i.id = stock_adjustments.item_id
            AND i.organization_id = jwt_org_id()
            AND i.branch_id = jwt_branch_id()
        )
    )
)
WITH CHECK (
    is_superadmin()
    OR (
        jwt_app_role() IN ('admin', 'employee')
        AND EXISTS (
            SELECT 1 FROM public.inventory_items i
            WHERE i.id = stock_adjustments.item_id
            AND i.organization_id = jwt_org_id()
            AND i.branch_id = jwt_branch_id()
        )
    )
);

-- Standard Users: Full access to their adjustments linked to their items
CREATE POLICY "Allow user full access on own stock_adjustments"
ON public.stock_adjustments
FOR ALL
USING (
    is_superadmin()
    OR (
        jwt_app_role() = 'user'
        AND EXISTS (
            SELECT 1 FROM public.inventory_items i
            WHERE i.id = stock_adjustments.item_id
            AND i.user_id = jwt_user_id()
        )
    )
)
WITH CHECK (
    is_superadmin()
    OR (
        jwt_app_role() = 'user'
        AND EXISTS (
            SELECT 1 FROM public.inventory_items i
            WHERE i.id = stock_adjustments.item_id
            AND i.user_id = jwt_user_id()
        )
    )
);
-- =================================================================
-- RLS POLICIES: PROJECT COMPONENTS
-- =================================================================
ALTER TABLE public.project_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow access to project_components based on project access" ON public.project_components;
CREATE POLICY "Allow access to project_components based on project access"
ON public.project_components
FOR ALL
USING (
    is_superadmin()
    OR EXISTS (
        SELECT 1
        FROM public.projects p
        LEFT JOIN public.users u ON u.id = p.user_id
        JOIN public.inventory_items ii ON ii.id = project_components.item_id
        WHERE p.id = project_components.project_id
        AND (
            (jwt_app_role() = 'admin' AND p.organization_id = jwt_org_id() AND ii.organization_id = jwt_org_id())
            OR (
                jwt_app_role() = 'employee'
                AND p.organization_id = jwt_org_id()
                AND u.organization_id = jwt_org_id()
                AND u.branch_id = jwt_branch_id()
                AND ii.organization_id = jwt_org_id()
                AND ii.branch_id = jwt_branch_id()
            )
            OR (
                jwt_app_role() = 'user'
                AND p.user_id = jwt_user_id()
                AND ii.organization_id = jwt_org_id()
            )
        )
    )
)
WITH CHECK (
    is_superadmin()
    OR EXISTS (
        SELECT 1
        FROM public.projects p
        LEFT JOIN public.users u ON u.id = p.user_id
        JOIN public.inventory_items ii ON ii.id = project_components.item_id
        WHERE p.id = project_components.project_id
        AND (
            (jwt_app_role() = 'admin' AND p.organization_id = jwt_org_id() AND ii.organization_id = jwt_org_id())
            OR (
                jwt_app_role() = 'employee'
                AND p.organization_id = jwt_org_id()
                AND u.organization_id = jwt_org_id()
                AND u.branch_id = jwt_branch_id()
                AND ii.organization_id = jwt_org_id()
                AND ii.branch_id = jwt_branch_id()
            )
            OR (
                jwt_app_role() = 'user'
                AND p.user_id = jwt_user_id()
                AND ii.organization_id = jwt_org_id()
            )
        )
    )
);

-- ================================
-- SSC bucket storage.objects RLS
-- Custom JWT auth via claim: sub
-- Helper required: public.get_jwt_claim(text)
-- ================================

drop policy if exists "SSC public read pictures" on storage.objects;
drop policy if exists "SSC authenticated read invoices" on storage.objects;
drop policy if exists "SSC authenticated read project breakdowns" on storage.objects;
drop policy if exists "SSC authenticated insert" on storage.objects;
drop policy if exists "SSC authenticated update" on storage.objects;
drop policy if exists "SSC authenticated delete" on storage.objects;

-- Public downloads for pictures
create policy "SSC public read pictures"
on storage.objects
for select
to public
using (
  bucket_id = 'SSC'
  and (
    (storage.foldername(name))[1] = 'user_logos'
    or (storage.foldername(name))[1] = 'payment_screenshots'
  )
);

-- Authenticated downloads for invoices
create policy "SSC authenticated read invoices"
on storage.objects
for select
to public
using (
  bucket_id = 'SSC'
  and (storage.foldername(name))[1] = 'documents'
  and (storage.foldername(name))[2] = 'invoices'
  and public.get_jwt_claim('sub') is not null
);

-- Authenticated downloads for project breakdowns (same as invoices)
create policy "SSC authenticated read project breakdowns"
on storage.objects
for select
to public
using (
  bucket_id = 'SSC'
  and (storage.foldername(name))[1] = 'documents'
  and (storage.foldername(name))[2] = 'project_breakdowns'
  and public.get_jwt_claim('sub') is not null
);

-- Uploads: allow insert only when custom JWT is present
create policy "SSC authenticated insert"
on storage.objects
for insert
to public
with check (
  bucket_id = 'SSC'
  and public.get_jwt_claim('sub') is not null
);

-- Upsert/overwrite: allow update only when custom JWT is present
create policy "SSC authenticated update"
on storage.objects
for update
to public
using (
  bucket_id = 'SSC'
  and public.get_jwt_claim('sub') is not null
)
with check (
  bucket_id = 'SSC'
  and public.get_jwt_claim('sub') is not null
);

-- Deletes
create policy "SSC authenticated delete"
on storage.objects
for delete
to public
using (
  bucket_id = 'SSC'
  and public.get_jwt_claim('sub') is not null
);
