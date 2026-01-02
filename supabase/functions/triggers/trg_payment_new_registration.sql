
DECLARE v_owner_id uuid;
BEGIN
  SELECT user_id INTO v_owner_id 
  FROM public.subscriptions 
  WHERE id = NEW.subscription_id;

  -- Insert the notification job for the superadmin
  INSERT INTO public.notification_jobs (
    event_type,
    recipient_user_id,
    recipient_role,
    payload,
    status
  )
  VALUES (
    'payment_new_registration',
    v_owner_id, -- This is now the user_id fetched from the subscriptions table
    'superadmin',
    json_build_object(
      'subscription_payment_id', NEW.id,
      'user_id', v_owner_id,
      'amount', NEW.amount,
      'payment_method', NEW.payment_method
    ),
    'pending'
  );
  RETURN NEW;
END;
