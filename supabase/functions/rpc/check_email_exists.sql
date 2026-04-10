CREATE OR REPLACE FUNCTION public.check_email_exists(email_to_check text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Returns TRUE if the email is NOT found (available)
    -- Returns FALSE if the email IS found (not available)
    RETURN NOT EXISTS (
        SELECT 1
        FROM public.users
        WHERE LOWER(email) = LOWER(email_to_check)
    );
END;
$$;

-- Re-apply permissions
GRANT EXECUTE ON FUNCTION public.check_email_exists(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_email_exists(text) TO authenticated;
