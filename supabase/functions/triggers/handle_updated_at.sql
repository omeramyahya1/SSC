CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if we are in "Sync Mode"
    -- current_setting returns null if the variable isn't set, so we default to 'false'
    IF current_setting('app.is_sync', true) = 'true' THEN
        -- SYNC OPERATION:
        -- Respect the incoming values (including the historical updated_at)
        RETURN NEW;
    ELSE
        -- DASHBOARD / MANUAL OPERATION:
        -- Force the timestamp to the current server time
        NEW.updated_at = now();
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
