DO $$
DECLARE
    t_name TEXT;
BEGIN
    -- Loop through all base tables in public schema
    FOR t_name IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
    LOOP
        -- Check if table has 'updated_at' column
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = t_name
            AND table_schema = 'public'
            AND column_name = 'updated_at'
        ) THEN
            -- 1. Drop old trigger if exists (to avoid errors when re-running)
            EXECUTE format('DROP TRIGGER IF EXISTS trg_handle_updated_at ON public.%I;', t_name);

            -- 2. Create the new trigger
            EXECUTE format('
                CREATE TRIGGER trg_handle_updated_at
                BEFORE UPDATE ON public.%I
                FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
            ', t_name);

            RAISE NOTICE 'Trigger applied to: %', t_name;
        END IF;
    END LOOP;
END;
$$;
