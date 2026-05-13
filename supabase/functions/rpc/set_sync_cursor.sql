CREATE OR REPLACE FUNCTION public.set_sync_cursor(
    p_device_id uuid,
    p_cursor timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  INSERT INTO public.sync_state(user_id, device_id, last_cursor, updated_at)
  VALUES (public.jwt_user_id(), p_device_id, p_cursor, now())
  ON CONFLICT (user_id, device_id)
  DO UPDATE SET
    last_cursor = EXCLUDED.last_cursor,
    updated_at = now();

  RETURN p_cursor;
END;
$$;

