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
    -- Basic sanitization to ensure the table name is a valid identifier
    -- and exists in the public schema. This helps prevent SQL injection.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = p_table_name
    ) THEN
        RAISE EXCEPTION 'Invalid table name provided: %', p_table_name;
    END IF;

    FOR rec IN SELECT * FROM jsonb_array_elements(p_records)
    LOOP
        -- Dynamically build the SET part of the UPDATE statement from the JSON keys.
        -- This ensures all provided fields are updated, not just a static list.
        set_clause := (
            SELECT string_agg(
                -- Format as "column_name" = EXCLUDED."column_name"
                format('%I = EXCLUDED.%I', key, key),
                ', '
            )
            FROM jsonb_object_keys(rec) AS key
            WHERE key <> 'id' -- Don't try to update the primary key itself
        );

        -- If for some reason there's nothing to set, skip this record.
        IF set_clause IS NULL THEN
            CONTINUE;
        END IF;

        -- This query uses `jsonb_populate_record` to expand the JSON into a full record.
        -- The ON CONFLICT clause handles the "upsert" logic.
        -- The dynamically generated `set_clause` ensures the UPDATE is comprehensive.
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
            INTO rec_uuid -- This will capture the ID of the inserted or updated row
            USING rec;

            -- If the upsert was successful, add the ID to our list of affected records.
            IF rec_uuid IS NOT NULL THEN
                affected_uuids := array_append(affected_uuids, rec_uuid);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- If a single record fails, log it and continue with the rest of the batch.
            RAISE WARNING 'Failed to process record for table %: %', p_table_name, SQLERRM;
            RAISE WARNING 'Problematic Record: %', rec;
        END;
    END LOOP;

    -- Return the array of UUIDs that were successfully processed.
    RETURN affected_uuids;
END;
$$;
