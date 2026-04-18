-- supabase/functions/rpc/support_ticket.sql
CREATE OR REPLACE FUNCTION public.support_ticket(subject text, body text, user_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_record record;
BEGIN
  IF public.jwt_user_id() IS NULL OR public.jwt_user_id() <> user_uuid THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF nullif(btrim(subject), '') IS NULL OR nullif(btrim(body), '') IS NULL THEN
    RAISE EXCEPTION 'Subject and body are required';
  END IF;

  -- 1. Fetch user details from public.users based on auth.uid()
  SELECT username, email, business_name
  INTO v_user_record
  FROM public.users
  WHERE id = user_uuid;


  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notification_jobs
    WHERE event_type = 'support_ticket_submitted'
      AND payload->>'user_id' = user_uuid::text
      AND created_at > now() - interval '10 minutes'
  ) THEN
    RAISE EXCEPTION 'Please wait before sending another ticket';
  END IF;

  -- 2. Insert the notification job for the admin
  INSERT INTO public.notification_jobs (
    event_type,
    recipient_role,
    status,
    payload
  ) VALUES (
    'support_ticket_submitted',
    'superadmin',
    'pending',
    json_build_object(
      'user_id', user_uuid,
      'username', v_user_record.username,
      'user_email', v_user_record.email,
      'business_name', v_user_record.business_name,
      'subject', subject,
      'body', body,
      'submitted_at', now()
    )
  );
END;
$$;
