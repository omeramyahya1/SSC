CREATE OR REPLACE FUNCTION public.register_employee(
    p_user_uuid uuid,
    p_username text,
    p_email text,
    p_org_id uuid,
    p_branch_id uuid,
    p_role text,
    p_auth_uuid uuid,
    p_password_hash text,
    p_password_salt text,
    p_temp_password text,
    p_org_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    -- Prevent duplicate emails (case-insensitive)
    IF EXISTS (
        SELECT 1
        FROM public.users
        WHERE LOWER(email) = LOWER(p_email)
    ) THEN
        RAISE EXCEPTION 'Email already in use'
            USING ERRCODE = '23505';
    END IF;

    -- Set the temporary password and org name in a session variable for the trigger
    -- We use a JSON object to pass multiple values
    PERFORM set_config('app.registration_data', json_build_object(
        'temp_password', p_temp_password,
        'org_name', p_org_name
    )::text, true);

    -- Insert into public.users
    INSERT INTO public.users (
        id, username, email, organization_id, branch_id, role, status, account_type
    ) VALUES (
        p_user_uuid, p_username, p_email, p_org_id, p_branch_id, p_role, 'trial', 'enterprise_tier1'
    );

    -- Insert into public.authentications
    INSERT INTO public.authentications (
        id, user_id, password_hash, password_salt, is_logged_in
    ) VALUES (
        p_auth_uuid, p_user_uuid, p_password_hash, p_password_salt, false
    );
END;
$$;
