CREATE OR REPLACE FUNCTION public.pull_changes(
    p_table_name TEXT,
    p_last_sync_timestamp TIMESTAMPTZ
)
RETURNS SETOF JSON
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Sanitize the table name to prevent SQL injection.
    -- Ensure it's a valid, existing table in the public schema.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = p_table_name
    ) THEN
        RAISE EXCEPTION 'Invalid or non-existent table: %', p_table_name;
    END IF;

    -- Execute a dynamic query to fetch records updated after the last sync timestamp.
    -- RLS policies of the invoker will be automatically applied.
    RETURN QUERY EXECUTE format(
        'SELECT to_json(t) FROM public.%I AS t WHERE t.updated_at > $1',
        p_table_name
    )
    USING p_last_sync_timestamp;
END;
$$;