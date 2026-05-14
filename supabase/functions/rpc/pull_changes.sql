CREATE OR REPLACE FUNCTION public.pull_changes(
    p_table_name TEXT,
    p_last_sync_timestamp TIMESTAMPTZ,
    p_high_water_mark TIMESTAMPTZ
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

    -- Fetch records in a bounded window:
    --   (p_last_sync_timestamp, p_high_water_mark]
    -- This prevents missing updates that occur during a sync run.
    -- RLS policies of the invoker will be automatically applied.
    RETURN QUERY EXECUTE format(
        'SELECT to_json(t)
           FROM public.%I AS t
          WHERE t.updated_at > $1
            AND t.updated_at <= $2
          ORDER BY t.updated_at ASC, t.id ASC',
        p_table_name
    )
    USING p_last_sync_timestamp, p_high_water_mark;
END;
$$;
