
CREATE OR REPLACE FUNCTION public.log_user_in(
    p_email text,
    p_device_id uuid -- Not used, but included for future use or consistency
)
RETURNS json -- Return a single JSON object
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_record record;
    v_auth_record record;
    v_subscription_record record;
    v_result json;
BEGIN
    -- 1. Find the user by email
    SELECT * INTO v_user_record FROM public.users WHERE email = p_email LIMIT 1;

    -- 2. If user not found, return null (which becomes JSON null)
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- 3. Find the latest authentication record for that user
    SELECT * INTO v_auth_record FROM public.authentications WHERE user_id = v_user_record.id ORDER BY created_at DESC LIMIT 1;
    
    -- It's possible a user exists without an auth record, though unlikely.
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- 4. Find the latest subscription record
    SELECT * INTO v_subscription_record FROM public.subscriptions WHERE user_id = v_user_record.id ORDER BY created_at DESC LIMIT 1;

    -- 5. Construct the JSON response object, including user, auth (hash/salt), and subscription
    v_result := json_build_object(
        'user', row_to_json(v_user_record),
        'authentication', json_build_object(
            'password_hash', v_auth_record.password_hash,
            'password_salt', v_auth_record.password_salt,
            'user_id', v_auth_record.user_id,
            'id', v_auth_record.id
        ),
        'subscription', row_to_json(v_subscription_record)
    );

    RETURN v_result;
END;
$$;
