-- supabase/functions/rpc/tier2_ticket.sql
CREATE OR REPLACE FUNCTION public.tier2_ticket(
    p_enterprise_name text,
    p_location text,
    p_email text,
    p_phone text,
    p_meeting_preference text,
    p_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Basic validation
    IF nullif(btrim(p_enterprise_name), '') IS NULL OR
       nullif(btrim(p_email), '') IS NULL OR
       nullif(btrim(p_phone), '') IS NULL THEN
        RAISE EXCEPTION 'Enterprise name, email, and phone are required';
    END IF;

    -- Cooldown check: 5 minutes
    IF EXISTS (
        SELECT 1
        FROM public.notification_jobs
        WHERE event_type = 'tier2_sales_request'
          AND lower(btrim(payload->>'email')) = lower(btrim(p_email))
          AND created_at > now() - interval '5 minutes'
    ) THEN
        RAISE EXCEPTION 'Please wait before sending another request';
    END IF;

    -- Insert the notification job for the admin
    INSERT INTO public.notification_jobs (
        event_type,
        recipient_role,
        status,
        payload
    ) VALUES (
        'tier2_sales_request',
        'superadmin',
        'pending',
        json_build_object(
            'enterprise_name', p_enterprise_name,
            'location', p_location,
            'email', lower(btrim(p_email)),
            'phone', p_phone,
            'meeting_preference', p_meeting_preference,
            'body', p_body,
            'submitted_at', now()
        )
    );
END;
$$;
