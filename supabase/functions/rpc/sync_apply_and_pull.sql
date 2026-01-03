CREATE OR REPLACE FUNCTION public.sync_apply_and_pull(
    table_name text,
    records jsonb
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    r jsonb;
    affected_uuids uuid[] := '{}';
    v_uuid uuid;
    v_query text;
    v_ownership_filter text;
BEGIN
    -- 1. Determine the Ownership Filter based on the table structure
    -- We check if the table has user_id or organization_id columns
    SELECT
        CASE
            WHEN is_superadmin() THEN 'TRUE' -- Superadmin bypasses checks
            WHEN column_exists(table_name, 'user_id') AND column_exists(table_name, 'organization_id') THEN
                format('(%I.user_id = jwt_user_id() OR (%I.organization_id = jwt_org_id() AND jwt_app_role() = ''admin''))', table_name, table_name)
            WHEN column_exists(table_name, 'user_id') THEN
                format('%I.user_id = jwt_user_id()', table_name)
            WHEN column_exists(table_name, 'organization_id') THEN
                format('(%I.organization_id = jwt_org_id() AND jwt_app_role() = ''admin'')', table_name)
            WHEN column_exists(table_name, 'project_id') THEN
                -- For child tables, verify via a join to projects
                format('EXISTS (SELECT 1 FROM public.projects p WHERE p.id = %I.project_id AND (p.user_id = jwt_user_id() OR (p.organization_id = jwt_org_id() AND jwt_app_role() = ''admin'')))', table_name)
            ELSE 'FALSE' -- If no ownership column exists, deny by default (safety)
        END INTO v_ownership_filter;

    -- 2. Iterate through incoming records
    FOR r IN SELECT * FROM jsonb_array_elements(records)
    LOOP
        v_uuid := (r->>'id')::uuid;

        -- 3. Construct and Execute the Upsert
        -- We add the ownership filter to the WHERE clause of the UPDATE
        -- and as a check before performing the INSERT.
        v_query := format(
            'INSERT INTO public.%I
             SELECT * FROM jsonb_populate_record(null::public.%I, $1)
             WHERE (
                -- Validation: Ensure user isn''t trying to insert data for someone else
                %s
             )
             ON CONFLICT (id) DO UPDATE
             SET
                updated_at = EXCLUDED.updated_at,
                deleted_at = EXCLUDED.deleted_at,
                is_dirty = false
             WHERE %I.updated_at < EXCLUDED.updated_at
               AND %s -- The Ownership Check for Updates
             RETURNING id',
            table_name,
            table_name,
            replace(v_ownership_filter, table_name, 'EXCLUDED'), -- Map filter to incoming data
            table_name,
            v_ownership_filter -- Map filter to existing data
        );

        EXECUTE v_query
        INTO v_uuid
        USING r;

        -- 4. Track affected records
        IF v_uuid IS NOT NULL THEN
            affected_uuids := array_append(affected_uuids, v_uuid);
        END IF;
    END LOOP;

    RETURN affected_uuids;
END;
$$;
