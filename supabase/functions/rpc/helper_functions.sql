CREATE OR REPLACE FUNCTION public.jwt_app_role()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT auth.jwt() ->> 'app_role';
$$;

CREATE OR REPLACE FUNCTION public.jwt_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (auth.jwt() ->> 'sub')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.jwt_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (auth.jwt() ->> 'organization_id')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.jwt_branch_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (auth.jwt() ->> 'branch_id')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.jwt_distributor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (auth.jwt() ->> 'distributor_id')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jwt_app_role() = 'superadmin';
$$;
