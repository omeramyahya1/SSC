CREATE OR REPLACE FUNCTION public.handle_license_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_email_val TEXT;
  user_name_val TEXT;
BEGIN
  -- Get user details for the notification payload
  SELECT u.email, u.username
  INTO user_email_val, user_name_val
  FROM public.users u
  WHERE u.id = NEW.user_id;

  -- Create a notification job for the user
  INSERT INTO public.notification_jobs (event_type, recipient_user_id, recipient_role, payload, status)
  VALUES (
    'license_tamper_detected_user',
    NEW.user_id,
    'user',
    jsonb_build_object(
      'username', user_name_val
    ),
    'pending'
  );

  -- Create a notification job for the superadmin
  INSERT INTO public.notification_jobs (event_type, recipient_user_id, recipient_role, payload, status)
  VALUES (
    'license_tamper_detected_admin',
    NULL, -- No specific user ID for a role-based notification
    'superadmin',
    jsonb_build_object(
      'user_id', NEW.user_id,
      'user_email', user_email_val,
      'username', user_name_val,
      'subscription_id', NEW.id,
      'tampered_at', now()
    ),
    'pending'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_license_tampered
  AFTER UPDATE OF tampered ON public.subscriptions
  FOR EACH ROW
  WHEN (OLD.tampered IS DISTINCT FROM NEW.tampered AND NEW.tampered = true)
  EXECUTE FUNCTION public.handle_license_tampering();
