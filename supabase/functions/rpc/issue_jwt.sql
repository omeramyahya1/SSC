CREATE OR REPLACE FUNCTION public.issue_jwt(
    p_user_id uuid,
    p_device_id uuid
)
RETURNS TABLE(jwt_info json, issued_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_catalog
AS
$$
DECLARE
    v_jwt text;
    v_issued_at timestamptz := now();
    v_secret text;
    u RECORD;
    v_latest_auth RECORD; -- To hold the user's most recent auth record
BEGIN
    -- 1. Fetch User Metadata
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

    -- 2. ADDED: Fetch the latest auth record to get the hash and salt
    SELECT * INTO v_latest_auth
    FROM public.authentications
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- If the user exists but has no auth records, something is wrong.
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existing authentication record found for user to copy hash from.';
    END IF;

    -- 3. Invalidate previous sessions for this specific user
    UPDATE public.authentications
    SET is_logged_in = false
    WHERE user_id = p_user_id AND device_id <> p_device_id;

    -- 4. Retrieve Secret from Vault
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'jwt_secret';

    IF v_secret IS NULL THEN
        RAISE EXCEPTION 'JWT Secret not found in Vault';
    END IF;

    -- 5. Sign the Token
    v_jwt := extensions.sign(
        json_build_object(
            'sub', p_user_id::text,
            'role', 'authenticated',
            'aud', 'authenticated',
            'app_role', u.role,
            'iss', 'https://igmwwmtacuedbexsslco.supabase.co/auth/v1',
            'organization_id', u.organization_id,
            'branch_id', u.branch_id,
            'distributor_id', u.distributor_id,
            'device_id', p_device_id,
            'iat', extract(epoch from v_issued_at)::integer,
            'exp', extract(epoch from (v_issued_at + interval '14 days'))::integer
        )::json,
        v_secret::text,
        'HS256'
    );

    -- 6. MODIFIED: Upsert the authentication record, now including hash and salt on INSERT
    INSERT INTO public.authentications (
        user_id, device_id,
        password_hash, password_salt, -- Ensure these are included
        current_jwt, jwt_issued_at, is_logged_in, updated_at
    )
    VALUES (
        p_user_id, p_device_id,
        v_latest_auth.password_hash, v_latest_auth.password_salt, -- Copy from latest record
        v_jwt, v_issued_at, true, now()
    )
    ON CONFLICT (user_id, device_id)
    DO UPDATE SET
        current_jwt = EXCLUDED.current_jwt,
        jwt_issued_at = EXCLUDED.jwt_issued_at,
        is_logged_in = true,
        updated_at = now();

    -- 7. Return as JSON object and timestamp
    RETURN QUERY SELECT
        json_build_object('token', v_jwt) as jwt_info,
        v_issued_at as issued_at;
END;
$$
