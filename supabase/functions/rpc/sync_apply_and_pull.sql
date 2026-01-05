CREATE OR REPLACE FUNCTION public.sync_apply_and_pull(
    table_name text,
    records jsonb
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
    r jsonb;
    affected_uuids uuid[] := '{}';
    v_uuid uuid;
    v_query text;
BEGIN
    -- Loop through incoming records
    FOR r IN SELECT * FROM jsonb_array_elements(records)
    LOOP
        v_uuid := (r->>'id')::uuid;

        -- Construct and Execute the Upsert without Validation
        -- We insert the record blindly.
        -- If ID exists, we update ONLY if the incoming record is newer.
        v_query := format(
            'INSERT INTO public.%I
             SELECT * FROM jsonb_populate_record(null::public.%I, $1)
             ON CONFLICT (id) DO UPDATE
             SET
                -- Note: This currently only syncs timestamps and deletion status on update.
                -- If you need to sync other columns (like name, amount, etc.), you must list them here
                -- or use a dynamic column loop.
                updated_at = EXCLUDED.updated_at,
                deleted_at = EXCLUDED.deleted_at,
                is_dirty = false
             WHERE public.%I.updated_at < EXCLUDED.updated_at
             RETURNING id',
            table_name,
            table_name,
            table_name -- Argument for the WHERE clause
        );

        EXECUTE v_query
        INTO v_uuid
        USING r;

        -- Track affected records
        IF v_uuid IS NOT NULL THEN
            affected_uuids := array_append(affected_uuids, v_uuid);
        END IF;
    END LOOP;

    RETURN affected_uuids;
END;
$$;
