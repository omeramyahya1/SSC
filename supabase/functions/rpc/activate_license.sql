-- supabase/functions/rpc/activate_license.sql

CREATE OR REPLACE FUNCTION public.activate_license(
  p_license_code text,
  p_user_uuid uuid
)
RETURNS jsonb  -- Changed to jsonb for faster validation and consistency
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription_id uuid;
  v_current_status text;
  v_type text;
  v_expiry timestamp with time zone;
BEGIN
  -- 1. Find the subscription matching the user and license code
  SELECT id, status, type, expiration_date
  INTO v_subscription_id, v_current_status, v_type, v_expiry
  FROM public.subscriptions
  WHERE user_id = p_user_uuid
    AND license_code = p_license_code
    AND deleted_at IS NULL;

  -- Condition A: No matching subscription row found
  IF v_subscription_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Invalid license code or user mismatch'
    );
  END IF;

  -- Condition B: Found record but status column is empty/corrupted
  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'License is not eligible for activation'
    );
  END IF;

  -- Condition C: License validation has exceeded expiration bounds
  IF v_type <> 'lifetime' AND v_expiry IS NOT NULL AND v_expiry < now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'License has expired'
    );
  END IF;

  -- 2a. Expire any previous subscriptions for this user
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

  -- Return clean success structure
  RETURN jsonb_build_object(
    'success', true,
    'message', 'License activated successfully',
    'subscription_id', v_subscription_id
  );

EXCEPTION
  -- FIX: Intercepts unhandled physical system faults and packages them inside valid JSON
  WHEN OTHERS THEN
    RAISE LOG 'activate_license failed for user %: %', p_user_uuid, SQLERRM;
    RETURN jsonb_build_object(
      'message', 'Internal activation failure'
    );
END;
$$;
