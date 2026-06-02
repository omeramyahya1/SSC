CREATE OR REPLACE FUNCTION public.register_user(
    p_user_uuid uuid,
    p_username text,
    p_email text,
    p_auth_uuid uuid,
    p_password_hash text,
    p_password_salt text,
    p_device_id uuid,
    p_distributor_id uuid DEFAULT NULL,
    p_account_type text DEFAULT 'standard',
    p_business_name text DEFAULT NULL,
    p_location text DEFAULT NULL,
    p_org_id uuid DEFAULT NULL,
    p_branch_id uuid DEFAULT NULL,
    p_role text DEFAULT 'admin',
    p_plan_type text DEFAULT 'trial',
    p_sub_uuid uuid DEFAULT gen_random_uuid(),
    p_user_status text DEFAULT 'trial'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_sub_status text;
    v_exp_date timestamptz;
BEGIN
    -- Determine sub status and expiration
    IF p_plan_type = 'trial' THEN
        v_sub_status := 'trial';
        v_exp_date := now() + interval '14 days';
    ELSE
        v_sub_status := 'pending';
        v_exp_date := now() + interval '30 days'; -- Default placeholder
    END IF;

    -- Insert into public.users
    INSERT INTO public.users (
        id, 
        username, 
        email, 
        distributor_id, 
        account_type, 
        business_name, 
        location, 
        organization_id, 
        branch_id,
        role,
        status
    ) VALUES (
        p_user_uuid, 
        p_username, 
        p_email, 
        p_distributor_id, 
        p_account_type::public.account_type, 
        p_business_name, 
        p_location, 
        p_org_id, 
        p_branch_id,
        p_role,
        p_user_status::public.user_status
    );

    -- Insert into public.authentications
    INSERT INTO public.authentications (
        id, user_id, password_hash, password_salt, device_id
    ) VALUES (
        p_auth_uuid, p_user_uuid, p_password_hash, p_password_salt, p_device_id
    );

    -- Insert into public.subscriptions
    INSERT INTO public.subscriptions (
        id,
        user_id,
        type,
        status,
        expiration_date
    ) VALUES (
        p_sub_uuid,
        p_user_uuid,
        p_plan_type::public.subscription_type,
        v_sub_status::public.subscription_status,
        v_exp_date
    );
END;
$$;
