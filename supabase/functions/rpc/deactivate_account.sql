CREATE OR REPLACE FUNCTION public.deactivate_account(
    p_user_id uuid,
    p_actor_user_id uuid,
    p_user_email text,
    p_username text,
    p_account_type text,
    p_role text,
    p_organization_id uuid DEFAULT NULL,
    p_organization_name text DEFAULT NULL,
    p_distributor_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_payload jsonb;
    v_deactivated_by_admin boolean;
    v_user_org_name text := p_organization_name;
BEGIN
    -- Determine if deactivated by admin
    v_deactivated_by_admin := (p_user_id IS DISTINCT FROM p_actor_user_id);

    -- Ensure organization name is fetched if not provided, but organization_id is.
    IF v_user_org_name IS NULL AND p_organization_id IS NOT NULL THEN
        SELECT name INTO v_user_org_name FROM public.organizations WHERE id = p_organization_id;
    END IF;

    -- 1. Insert notification for the deactivated user
    v_payload := jsonb_build_object(
        'user_id', p_user_id,
        'actor_user_id', p_actor_user_id,
        'user_email', p_user_email,
        'username', p_username,
        'account_type', p_account_type,
        'role', p_role,
        'organization_id', p_organization_id,
        'organization_name', v_user_org_name,
        'distributor_id', p_distributor_id,
        'deactivated_by_admin', v_deactivated_by_admin
    );

    INSERT INTO public.notification_jobs (
        event_type,
        recipient_user_id,
        recipient_role,
        payload,
        status
    )
    VALUES (
        'account_deactivated_user',
        p_user_id,
        'user',
        v_payload,
        'pending'
    );

    -- 2. Insert notification for Super Admin
    v_payload := jsonb_build_object(
        'deactivated_user_id', p_user_id,
        'deactivated_username', p_username,
        'deactivated_user_email', p_user_email,
        'account_type', p_account_type,
        'role', p_role,
        'organization_id', p_organization_id,
        'organization_name', v_user_org_name,
        'deactivated_by_admin', v_deactivated_by_admin,
        'actor_user_id', p_actor_user_id
    );

    INSERT INTO public.notification_jobs (
        event_type,
        recipient_role,
        payload,
        status
    )
    VALUES (
        'account_deactivated_superadmin',
        'superadmin',
        v_payload,
        'pending'
    );

    -- 3. Insert notification for Distributor (if applicable)
    IF p_distributor_id IS NOT NULL THEN
        v_payload := jsonb_build_object(
            'deactivated_user_id', p_user_id,
            'deactivated_username', p_username,
            'deactivated_account_type', p_account_type
        );

        INSERT INTO public.notification_jobs (
            event_type,
            recipient_user_id,
            recipient_role,
            payload,
            status
        )
        VALUES (
            'account_deactivated_distributor',
            p_distributor_id,
            'distributor',
            v_payload,
            'pending'
        );
    END IF;

    RETURN TRUE;
END;
$$;