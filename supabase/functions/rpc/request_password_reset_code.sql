/* RPC: GENERATE AND EMAIL CODE */
CREATE OR REPLACE FUNCTION public.request_password_reset_code(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid;
    v_role text;
    v_code varchar(6);
BEGIN
    -- 1. Get User
    SELECT id, role INTO v_user_id, v_role FROM public.users WHERE email = p_email AND deleted_at IS NULL;
    
    IF v_user_id IS NOT NULL THEN
        -- 2. Generate random 6-digit code
        v_code := floor(random() * 900000 + 100000)::text;
        
        -- 3. Save to DB (Clear old codes first)
        DELETE FROM public.password_reset_requests WHERE user_id = v_user_id;
        INSERT INTO public.password_reset_requests (user_id, verification_code, role, expires_at) VALUES (v_user_id, v_code, v_role, (now() + interval '10 minutes'));
    END IF;
END;
$$;



