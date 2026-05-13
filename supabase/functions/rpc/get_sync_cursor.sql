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

