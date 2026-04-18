-- supabase/functions/rpc/support_ticket.sql
CREATE OR REPLACE FUNCTION public.support_ticket(subject text, body text, user_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_record record;
BEGIN
  -- 1. Fetch user details from public.users based on auth.uid()
  SELECT username, email, business_name
  INTO v_user_record
  FROM public.users
  WHERE id = user_uuid;

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
