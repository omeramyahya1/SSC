-- Function to handle distributor commission on approved subscription payments
CREATE OR REPLACE FUNCTION public.handle_new_distributor_commission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid;
    v_distributor_id uuid;
    v_discount_percent integer;
    v_commission_amount double precision;
BEGIN
    -- Get user_id from the subscription linked to the new payment
    SELECT user_id INTO v_user_id
    FROM public.subscriptions
    WHERE id = NEW.subscription_id;

    -- Get distributor_id and discount_percent from the user and distributor tables
    SELECT
        u.distributor_id
    INTO
        v_distributor_id
    FROM
        public.users u
    JOIN
        public.distributors d ON u.distributor_id = d.id
    WHERE
        u.id = v_user_id
    AND
        u.distributor_id IS NOT NULL; -- Ensure user is associated with a distributor

    -- If a distributor is found, calculate and insert the commission
    IF v_distributor_id IS NOT NULL THEN
        -- Commission is NEW.amount * (commission_percent / 100.0) as discussed
        v_commission_amount := NEW.amount * (40 / 100.0);

        INSERT INTO public.distributor_financials (
            distributor_id,
            user_id,
            commission_amount,
            payment_status
        ) VALUES (
            v_distributor_id,
            v_user_id,
            v_commission_amount,
            'pending_payment' -- Assuming 'pending_payment' is a valid status
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger to call the function after a subscription payment is approved
CREATE OR REPLACE TRIGGER trg_new_distributor_user
AFTER UPDATE ON public.subscription_payments
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved') -- Assuming 'approved' is a valid status for subscription_payments
EXECUTE FUNCTION public.handle_new_distributor_commission();
