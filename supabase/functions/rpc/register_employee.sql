CREATE OR REPLACE FUNCTION public.register_employee(
    p_user_uuid uuid,
    p_username text,
    p_email text,
    p_org_id uuid,
    p_branch_id uuid,
    p_role text,
    p_password_hash text,
    p_password_salt text,
    p_temp_password text,
    p_org_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_auth_id uuid;
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

    -- Strict Conditional Check: Only proceed if the previous INSERT affected 1 or more rows
    IF FOUND THEN
        -- Insert into public.authentications
        INSERT INTO public.authentications (
            user_id, password_hash, password_salt, is_logged_in
        ) VALUES (
            p_user_uuid, p_password_hash, p_password_salt, false
        );
        v_auth_id := (
            SELECT a.id
            FROM public.authentications a
            WHERE a.user_id = p_user_uuid
            ORDER BY a.created_at DESC
            LIMIT 1
        );
    ELSE
        RAISE EXCEPTION 'User insertion failed. Aborting authentication setup.';
    END IF;

    RETURN json_build_object(
        'user_id', p_user_uuid,
        'auth_created', (v_auth_id IS NOT NULL),
        'auth_id', v_auth_id
    );

EXCEPTION
    -- Catch hidden constraints, foreign key errors, or trigger failures
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Registration rolled back: % (Error Code: %)', SQLERRM, SQLSTATE;
END;
$$;
