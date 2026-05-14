-- Retrieves the last sync cursor for the authenticated user and specified device.
-- Returns NULL if no sync state exists for the (user_id, device_id) pair.
--
-- `@param` p_device_id The UUID of the device to query
-- `@return` The last cursor timestamp, or NULL if no record exists
CREATE OR REPLACE FUNCTION public.get_sync_cursor(
    p_device_id uuid
)
RETURNS timestamptz
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT ss.last_cursor
  FROM public.sync_state ss
  WHERE ss.user_id = public.jwt_user_id()
    AND ss.device_id = p_device_id;
$$;

