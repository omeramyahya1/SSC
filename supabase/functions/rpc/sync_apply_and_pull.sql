CREATE OR REPLACE FUNCTION public.sync_apply_and_pull(
    p_table_name text,
    p_records jsonb
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    rec jsonb;
    rec_uuid uuid;
    set_clause text;
    query text;
    affected_uuids uuid[] := '{}';
BEGIN
    -- [NEW] Set the sync flag for this transaction only
    PERFORM set_config('app.is_sync', 'true', true);

    -- [Existing Logic Starts Here] ------------------------------

    -- Basic sanitization
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = p_table_name
    ) THEN
        RAISE EXCEPTION 'Invalid table name provided: %', p_table_name;
    END IF;

    FOR rec IN SELECT * FROM jsonb_array_elements(p_records)
    LOOP
        set_clause := (
            SELECT string_agg(
                format('%I = EXCLUDED.%I', key, key),
                ', '
            )
            FROM jsonb_object_keys(rec) AS key
            WHERE key <> 'id'
        );

        IF set_clause IS NULL THEN
            CONTINUE;
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

        BEGIN
            EXECUTE query
            INTO rec_uuid
            USING rec;

            IF rec_uuid IS NOT NULL THEN
                affected_uuids := array_append(affected_uuids, rec_uuid);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to process record for table %: %', p_table_name, SQLERRM;
        END;
    END LOOP;

    RETURN affected_uuids;
END;
$$;
