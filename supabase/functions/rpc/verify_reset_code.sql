CREATE OR REPLACE FUNCTION public.verify_reset_code(p_email text, p_code text)
RETURNS boolean AS $$
BEGIN
    UPDATE public.password_reset_requests
    SET is_verified = true
    WHERE user_id = (SELECT id FROM public.users WHERE email = p_email)
      AND verification_code = p_code
      AND expires_at > now();

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;
