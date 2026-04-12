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
  v_discount_percent integer;
  v_commission_amount double precision;
BEGIN
  -- 1. Get the user_id associated with the subscription
  SELECT user_id INTO v_user_id
  FROM public.subscriptions
  WHERE id = p_subscription_uuid;

  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Subscription not found');
  END IF;

  -- 2. Insert the payment record using the provided UUID
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

  -- 3. If a distributor is provided, handle commission/linkage
  IF p_distributor_id IS NOT NULL THEN
    -- Get distributor discount/commission info
    SELECT discount_percent INTO v_discount_percent
    FROM public.distributors
    WHERE id = p_distributor_id;

    IF v_discount_percent IS NOT NULL THEN
      -- Calculate commission (example: 10% of the amount)
      v_commission_amount := p_amount * 0.1; 

      INSERT INTO public.distributor_financials (
        distributor_id,
        user_id,
        commission_amount,
        payment_status,
        notes
      )
      VALUES (
        p_distributor_id,
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
