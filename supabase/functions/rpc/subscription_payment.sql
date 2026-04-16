-- supabase/functions/rpc/subscription_payment.sql

CREATE OR REPLACE FUNCTION public.subscription_payment(
  p_payment_uuid uuid,
  p_subscription_uuid uuid,
  p_amount double precision,
  p_payment_method text,
  p_trx_no text,
  p_trx_screenshot text DEFAULT NULL,
  p_distributor_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_existing_distributor_id uuid;
  v_final_distributor_id uuid;
  v_commission_percent integer;
  v_commission_amount double precision;
BEGIN
  -- 1. Get the user_id and existing distributor_id associated with the subscription
  SELECT s.user_id, u.distributor_id
  INTO v_user_id, v_existing_distributor_id
  FROM public.subscriptions s
  JOIN public.users u ON s.user_id = u.id
  WHERE s.id = p_subscription_uuid;

  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Subscription or User not found');
  END IF;

  -- 2. Determine the final distributor_id to use
  -- Priority: 1. Existing ID in users table, 2. Passed parameter
  v_final_distributor_id := COALESCE(v_existing_distributor_id, p_distributor_id);

  -- 3. If user has no distributor yet but one was passed, link them now
  IF v_existing_distributor_id IS NULL AND p_distributor_id IS NOT NULL THEN
    UPDATE public.users SET distributor_id = p_distributor_id WHERE id = v_user_id;
  END IF;

  -- 4. Insert the payment record
  INSERT INTO public.subscription_payments (
    id,
    subscription_id,
    amount,
    payment_method,
    trx_no,
    trx_screenshot,
    status
  )
  VALUES (
    p_payment_uuid,
    p_subscription_uuid,
    p_amount,
    p_payment_method,
    p_trx_no,
    p_trx_screenshot,
    'under_processing'
  );

  -- 5. Handle commission if a distributor is linked
  IF v_final_distributor_id IS NOT NULL THEN
    SELECT commission INTO v_commission_percent
    FROM public.distributors
    WHERE id = v_final_distributor_id;

    IF v_commission_percent IS NOT NULL THEN
      -- Calculate commission based on distributor's discount percent
      v_commission_amount := p_amount * (v_commission_percent::double precision / 100.0);

      INSERT INTO public.distributor_financials (
        distributor_id,
        user_id,
        commission_amount,
        payment_status,
        notes
      )
      VALUES (
        v_final_distributor_id,
        v_user_id,
        v_commission_amount,
        'pending',
        'Payment for subscription ' || p_subscription_uuid
      );
    END IF;
  END IF;

  RETURN json_build_object(
    'success', true,
    'message', 'Payment recorded successfully',
    'payment_id', p_payment_uuid
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;
