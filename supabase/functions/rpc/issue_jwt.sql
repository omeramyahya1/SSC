CREATE OR REPLACE FUNCTION public.issue_jwt(
    p_user_id uuid,
    p_device_id uuid
)
RETURNS TABLE(jwt_info json, issued_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_catalog
AS $$
DECLARE
    v_jwt text;
    v_issued_at timestamptz := now();
    v_secret text;
    u RECORD;
BEGIN
    -- 1. Fetch User Metadata (Including Distributor and Branch)
    SELECT
        organization_id,
        branch_id,
        role,
        distributor_id
    INTO u
    FROM public.users
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    -- 2. Invalidate previous sessions for this specific user
    -- (Only if it's a different device, as per your Case 2a/2b logic)
    UPDATE public.authentication
    SET is_logged_in = false
    WHERE user_id = p_user_id AND device_id <> p_device_id::text;

    -- 3. Retrieve Secret from Vault
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'jwt_secret';

    IF v_secret IS NULL THEN
        RAISE EXCEPTION 'JWT Secret not found in Vault';
    END IF;

    -- 4. Sign the Token with your exact payload structure
    v_jwt := sign(
        json_build_object(
            'sub', p_user_id,
            'role', 'authenticated',
            'app_role', u.role,
            'organization_id', u.organization_id,
            'branch_id', u.branch_id,
            'distributor_id', u.distributor_id,
            'device_id', p_device_id,
            'iat', extract(epoch from v_issued_at)::integer,
            'exp', extract(epoch from (v_issued_at + interval '14 days'))::integer
        ),
        v_secret
    );

    -- 5. Upsert the authentication record
    INSERT INTO public.authentication (
        user_id, device_id, current_jwt, jwt_issued_at, is_logged_in, updated_at
    )
    VALUES (
        p_user_id, p_device_id::text, v_jwt, v_issued_at, true, now()
    )
    ON CONFLICT (user_id, device_id) -- Assumes you have a unique constraint here
    DO UPDATE SET
        current_jwt = EXCLUDED.current_jwt,
        jwt_issued_at = EXCLUDED.jwt_issued_at,
        is_logged_in = true,
        updated_at = now();

    -- 6. Return as JSON object and timestamp
    RETURN QUERY SELECT
        json_build_object('token', v_jwt) as jwt_info,
        v_issued_at as issued_at;
END;
$$;
