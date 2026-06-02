-- Utility function to calculate subscription status based on dates
-- This can be used in views or other functions to consistently determine status
CREATE OR REPLACE FUNCTION public.calculate_subscription_status(
    p_expiration_date timestamptz,
    p_grace_period_end timestamptz,
    p_current_status text DEFAULT 'active'
)
RETURNS text AS $$
DECLARE
    v_now timestamptz := now();
BEGIN
    -- If already pending or trial, respect that until explicitly changed
    IF p_current_status IN ('pending', 'trial') THEN
        RETURN p_current_status;
    END IF;

    -- Lifetime or No expiration
    IF p_expiration_date IS NULL THEN
        RETURN 'active';
    END IF;

    -- Expired (Past Grace Period)
    IF v_now > COALESCE(p_grace_period_end, p_expiration_date + interval '7 days') THEN
        RETURN 'expired';
    END IF;

    -- Grace Period (Past Expiration but Before Grace End)
    IF v_now > p_expiration_date THEN
        RETURN 'grace';
    END IF;

    -- Normal active state
    RETURN 'active';
END;
$$ LANGUAGE plpgsql;
