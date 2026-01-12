CREATE OR REPLACE FUNCTION public.check_referral_code(
    p_referral_code text
)
RETURNS TABLE(distributor_id uuid, discount_percent integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id,
        d.discount_percent
    FROM
        public.distributors d
    WHERE
        d.referral_code = p_referral_code;
END;
$$;