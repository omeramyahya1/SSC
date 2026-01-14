CREATE OR REPLACE FUNCTION public.handle_update_metadata()
RETURNS TRIGGER AS $$
DECLARE
    is_sync_mode text;
BEGIN
    -- 1. Check if we are in "Sync Mode" (set by your sync function)
    -- current_setting(name, missing_ok)
    is_sync_mode := current_setting('app.is_sync', true);

    IF is_sync_mode = 'true' THEN
        -- SYNC OPERATION:
        -- Trust the incoming data completely.
        -- Preserve the `updated_at` and `is_dirty` values sent by the Python backend.
        RETURN NEW;
    ELSE
        -- DASHBOARD / MANUAL OPERATION:
        -- Force the metadata updates.

        NEW.updated_at = now();
        NEW.is_dirty = true; -- Always mark dirty on manual edits

        -- Handle creation time for new manual inserts
        IF (TG_OP = 'INSERT') THEN
            NEW.created_at = now();
        END IF;

        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
