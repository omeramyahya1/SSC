CREATE OR REPLACE FUNCTION public.sync_apply_and_pull(
    p_table_name text,
    p_records jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    rec jsonb;
    rec_uuid uuid;
    set_clause text;
    query text;
    affected_uuids uuid[] := '{}';
    failures jsonb := '[]'::jsonb;
    error_msg text;
    error_detail text;
    error_hint text;
BEGIN
    -- [NEW] Set the sync flag for this transaction only
    PERFORM set_config('app.is_sync', 'true', true);

    -- Basic sanitization
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = p_table_name
    ) THEN
        RAISE EXCEPTION 'Invalid table name provided: %', p_table_name;
    END IF;

    FOR rec IN SELECT * FROM jsonb_array_elements(p_records)
    LOOP
        BEGIN
            -- [NEW] Validate record shape and build query inside the protected block
            IF jsonb_typeof(rec) <> 'object' THEN
                RAISE EXCEPTION 'Record must be a JSON object';
            END IF;

            set_clause := (
                SELECT string_agg(
                    format('%I = EXCLUDED.%I', key, key),
                    ', '
                )
                FROM jsonb_object_keys(rec) AS key
                WHERE key <> 'id'
            );

            IF set_clause IS NULL THEN
                CONTINUE; -- Skip records with no fields to update (besides id)
            END IF;

            query := format(
                'INSERT INTO public.%1$I
                 SELECT * FROM jsonb_populate_record(null::public.%1$I, $1)
                 ON CONFLICT (id) DO UPDATE
                 SET %2$s
                 RETURNING id;',
                p_table_name,
                set_clause
            );

            EXECUTE query
            INTO rec_uuid
            USING rec;

            IF rec_uuid IS NOT NULL THEN
                affected_uuids := array_append(affected_uuids, rec_uuid);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS 
                error_msg = MESSAGE_TEXT,
                error_detail = PG_EXCEPTION_DETAIL,
                error_hint = PG_EXCEPTION_HINT;
            
            failures := failures || jsonb_build_object(
                'id', rec->>'id',
                'error', error_msg,
                'detail', error_detail,
                'hint', error_hint
            );
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'confirmed_ids', affected_uuids,
        'failures', failures
    );
END;
$$;
