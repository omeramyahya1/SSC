CREATE OR REPLACE FUNCTION public.daily_database_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    r RECORD;
    query_str TEXT;
    deleted_rows INT;
BEGIN
    -------------------------------------------------------------------
    -- STEP 1: Loop through all tables with 'deleted_at' AND 'last_updated'
    -------------------------------------------------------------------
    FOR r IN
        SELECT table_schema, table_name
        FROM information_schema.columns c1
        WHERE column_name = 'deleted_at'
          AND table_schema = 'public' -- Limit to public schema for safety
          AND EXISTS (
              SELECT 1
              FROM information_schema.columns c2
              WHERE c2.table_schema = c1.table_schema
                AND c2.table_name = c1.table_name
                AND c2.column_name = 'last_updated'
          )
    LOOP
        -- Construct the dynamic DELETE query safely using quote_ident
        query_str := format(
            'DELETE FROM %I.%I WHERE deleted_at IS NOT NULL AND last_updated < NOW() - INTERVAL ''60 days''',
            r.table_schema,
            r.table_name
        );

        -- Execute the deletion
        EXECUTE query_str;
    END LOOP;

    -------------------------------------------------------------------
    -- STEP 2: Clear sync logs older than 3 days
    -------------------------------------------------------------------
    DELETE FROM public.sync_logs
    WHERE created_at < NOW() - INTERVAL '3 days';

    -------------------------------------------------------------------
    -- STEP 3: Clear sent notifications older than 10 days
    -------------------------------------------------------------------
    DELETE FROM public.notification_jobs
    WHERE status = 'sent'
        AND sent_at < NOW() - INTERVAL '10 days';


EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Cleanup process failed: %', SQLERRM;
END;
$$;



DO $$
BEGIN
  PERFORM cron.unschedule('daily-db-cleanup');
EXCEPTION
  WHEN OTHERS THEN
    -- ignore if not scheduled yet
    NULL;
END $$;

SELECT cron.schedule(
  'daily-db-cleanup',
  '0 0 * * *',
  'SELECT public.daily_database_cleanup();'
);
