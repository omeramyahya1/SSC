CREATE OR REPLACE FUNCTION public.handle_payment_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_distributor_user_id uuid;
    v_owner_id uuid;
    v_owner_name text;
    v_subscription_type text;
    v_generated_license_code text; -- Use a new variable for generated license
    v_sub_grace_period_end timestamp with time zone;
    v_sub_expiration_date timestamp with time zone;
BEGIN
    -- Get user and subscription details for both approved and declined paths
    SELECT
        s.user_id,
        u.username,
        s.type,
        d.id,
        s.grace_period_end, -- Fetch current grace_period_end
        s.expiration_date   -- Fetch current expiration_date
    INTO
        v_owner_id,
        v_owner_name,
        v_subscription_type,
        v_distributor_user_id,
        v_sub_grace_period_end,
        v_sub_expiration_date
    FROM public.subscriptions s
    JOIN public.users u ON s.user_id = u.id
    LEFT JOIN public.distributor_financials df ON s.user_id = df.user_id
    LEFT JOIN public.distributors d ON df.distributor_id = d.id
    WHERE s.id = NEW.subscription_id
    ORDER BY df.created_at DESC NULLS LAST
    LIMIT 1;

    -- ==================================================
    -- CASE: Approved
    -- ==================================================
    IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
        -- 1. Issue License and Update Subscription
        -- Generate license code
        v_generated_license_code := public.generate_license_code(); -- Assuming this function exists

        -- Calculate new expiration and grace period based on subscription type
        CASE v_subscription_type
            WHEN 'monthly' THEN
                v_sub_expiration_date := NOW() + INTERVAL '1 month';
                v_sub_grace_period_end := NOW() + INTERVAL '1 month 7 days';
            WHEN 'annual' THEN
                v_sub_expiration_date := NOW() + INTERVAL '1 year';
                v_sub_grace_period_end := NOW() + INTERVAL '1 year 7 days';
            WHEN 'lifetime' THEN
                v_sub_expiration_date := NULL; -- Lifetime has no expiration
                v_sub_grace_period_end := NULL;
            WHEN 'trial' THEN -- Assuming trial can also be "approved" to an active state
                v_sub_expiration_date := NOW() + INTERVAL '14 days';
                v_sub_grace_period_end := NOW() + INTERVAL '14 days 7 days';
            ELSE
                -- Default or error handling for unknown types
                v_sub_expiration_date := NOW() + INTERVAL '30 days'; -- Default to monthly if type not specified
                v_sub_grace_period_end := NOW() + INTERVAL '37 days';
        END CASE;

        UPDATE public.subscriptions
        SET
            license_code = v_generated_license_code,
            status = 'active', -- Set subscription to active
            expiration_date = v_sub_expiration_date,
            grace_period_end = v_sub_grace_period_end,
            updated_at = NOW()
        WHERE id = NEW.subscription_id;

        -- 2. Notify User
        INSERT INTO public.notification_jobs (
            event_type, recipient_user_id, recipient_role, payload, status
        ) VALUES (
            'payment_approved',
            v_owner_id,
            'user',
            json_build_object(
                'username', v_owner_name,
                'subscription_type', v_subscription_type,
                'amount', NEW.amount,
                'method', NEW.payment_method,
                'status', NEW.status,
                'license_code', v_generated_license_code, -- Use the generated license code
                'subscription_payment_id', NEW.id
            ),
            'pending'
        );

        -- 3. Notify Distributor (if exists)
        IF v_distributor_user_id IS NOT NULL THEN
            INSERT INTO public.notification_jobs (
                event_type, recipient_user_id, recipient_role, payload, status
            ) VALUES (
                'distributor_user_approved',
                v_distributor_user_id,
                'distributor',
                json_build_object(
                    'user_id', v_owner_id,
                    'username', v_owner_name,
                    'subscription_type', v_subscription_type,
                    'amount', NEW.amount,
                    'method', NEW.payment_method,
                    'status', NEW.status,
                    'subscription_payment_id', NEW.id
                ),
                'pending'
            );
        END IF;

    -- ==================================================
    -- CASE: Declined
    -- ==================================================
    ELSIF NEW.status = 'declined' AND OLD.status IS DISTINCT FROM 'declined' THEN
        -- Set subscription status to null (or an appropriate 'declined' state)
        UPDATE public.subscriptions
        SET status = NULL, updated_at = NOW()
        WHERE id = NEW.subscription_id;

        -- Notify User
        INSERT INTO public.notification_jobs (
            event_type, recipient_user_id, recipient_role, payload, status
        ) VALUES (
            'payment_declined',
            v_owner_id,
            'user',
            json_build_object(
                'username', v_owner_name,
                'subscription_type', v_subscription_type,
                'amount', NEW.amount,
                'method', NEW.payment_method,
                'status', NEW.status,
                'subscription_payment_id', NEW.id
            ),
            'pending'
        );

        -- Notify Distributor (if exists)
        IF v_distributor_user_id IS NOT NULL THEN
            INSERT INTO public.notification_jobs (
                event_type, recipient_user_id, recipient_role, payload, status
            ) VALUES (
                'distributor_user_declined',
                v_distributor_user_id,
                'distributor',
                json_build_object(
                    'user_id', v_owner_id,
                    'username', v_owner_name,
                    'subscription_type', v_subscription_type,
                    'amount', NEW.amount,
                    'method', NEW.payment_method,
                    'status', NEW.status,
                    'subscription_payment_id', NEW.id
                ),
                'pending'
            );
        END IF;

    END IF;

    RETURN NEW;
END;
$$;

-- Drop the old trigger if it exists
DROP TRIGGER IF EXISTS trg_payment_status_change ON public.subscription_payments;
-- Create the new trigger
CREATE TRIGGER trg_payment_status_change
AFTER UPDATE OF status ON public.subscription_payments
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status AND NEW.deleted_at IS NULL)
EXECUTE FUNCTION public.handle_payment_status_change();
