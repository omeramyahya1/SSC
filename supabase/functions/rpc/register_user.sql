CREATE OR REPLACE FUNCTION public.register_user(
    p_user_uuid uuid,
    p_username text,
    p_email text,
    p_auth_uuid uuid,
    p_password_hash text,
    p_password_salt text,
    p_device_id uuid,
    p_distributor_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    -- Insert into public.users
    INSERT INTO public.users (
        id, username, email, distributor_id
    ) VALUES (
        p_user_uuid, p_username, p_email, p_distributor_id
    );

    -- Insert into public.authentication
    INSERT INTO public.authentications (
        id, user_id, password_hash, password_salt, device_id
    ) VALUES (
        p_auth_uuid, p_user_uuid, p_password_hash, p_password_salt, p_device_id
    );
END;
$$;
