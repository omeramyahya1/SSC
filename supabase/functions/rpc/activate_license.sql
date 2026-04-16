-- supabase/functions/rpc/activate_license.sql

CREATE OR REPLACE FUNCTION public.activate_license(
  p_license_code text,
  p_user_uuid uuid
)
RETURNS json -- Changed from json to jsonb for robustness
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription_id uuid;
  v_current_status text;
  v_type text;
  v_expiry timestamp with time zone;
  v_new_expiry timestamp with time zone;
BEGIN
  -- 1. Find the subscription matching the user and license code
  SELECT id, status, type, expiration_date
  INTO v_subscription_id, v_current_status, v_type, v_expiry
  FROM public.subscriptions
  WHERE user_id = p_user_uuid AND license_code = p_license_code;

  IF v_subscription_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Invalid license code or user mismatch');
  END IF;

  -- 2. Calculate new expiry if needed (if it's a renewal or new activation)
  -- For this demo, we'll just set it to active. In a real system,
  -- the admin might have set the license_code after approving payment.

  -- 2a. Expire any previous subscriptions for this user (to keep cloud consistent across devices)
  UPDATE public.subscriptions
  SET
    status = 'expired',
    updated_at = now(),
    is_dirty = true
  WHERE user_id = p_user_uuid
    AND id <> v_subscription_id
    AND status <> 'expired';

  -- 2b. Activate the matched subscription
  UPDATE public.subscriptions
  SET
    status = 'active',
    updated_at = now(),
    is_dirty = true
  WHERE id = v_subscription_id;

  -- 3. Update User status
  UPDATE public.users
  SET
    status = 'active',
    updated_at = now(),
    is_dirty = true
  WHERE id = p_user_uuid;

  RETURN json_build_object(
    'success', true,
    'message', 'License activated successfully',
    'subscription_id', v_subscription_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;
