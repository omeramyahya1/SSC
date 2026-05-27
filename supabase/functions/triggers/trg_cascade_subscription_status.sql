-- Function to cascade status to all users in the organization and create notifications
CREATE OR REPLACE FUNCTION public.cascade_subscription_status()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id uuid;
    v_user record;
    v_event_type text;
    v_effective_user_status text;
    v_now timestamptz := now();
    v_expires timestamptz := NEW.expiration_date;
    v_grace_end timestamptz := NEW.grace_period_end;
BEGIN
    -- Default grace_period_end to expiration_date + 7 days if NULL
    IF v_grace_end IS NULL AND v_expires IS NOT NULL THEN
        v_grace_end := v_expires + interval '7 days';
    END IF;

    -- subscriptions.status has no "grace". Map subscription status + dates -> users.status.
    IF NEW.status = 'expired' AND v_expires IS NOT NULL THEN
        IF v_now > v_grace_end THEN
            v_effective_user_status := 'expired';
        ELSIF v_now > v_expires THEN
            v_effective_user_status := 'grace';
        ELSE
            v_effective_user_status := 'active';
        END IF;
    ELSE
        v_effective_user_status := NEW.status::text;
    END IF;

    -- Find the organization_id of the owner of the subscription
    SELECT organization_id INTO v_org_id FROM public.users WHERE id = NEW.user_id;

    -- 1. Update the status of all users in that organization
    IF v_org_id IS NOT NULL THEN
        UPDATE public.users SET status = v_effective_user_status::public.users.status WHERE organization_id = v_org_id;
    ELSE
        -- Update only the individual user if no organization
        UPDATE public.users SET status = v_effective_user_status::public.users.status WHERE id = NEW.user_id;
    END IF;

    -- 2. Create notification jobs if status is grace or expired
    IF v_effective_user_status IN ('grace', 'expired') THEN
        v_event_type := CASE 
            WHEN v_effective_user_status = 'grace' THEN 'subscription_grace_period'
            ELSE 'subscription_expired'
        END;

        -- Create a job for each affected user
        IF v_org_id IS NOT NULL THEN
            FOR v_user IN SELECT id, role, username FROM public.users WHERE organization_id = v_org_id AND deleted_at IS NULL LOOP
                INSERT INTO public.notification_jobs (
                    event_type,
                    recipient_user_id,
                    recipient_role,
                    payload,
                    status
                ) VALUES (
                    v_event_type,
                    v_user.id,
                    v_user.role,
                    json_build_object(
                        'username', v_user.username,
                        'expiration_date', NEW.expiration_date,
                        'grace_period_end', v_grace_end,
                        'role', v_user.role
                    ),
                    'pending'
                );
            END LOOP;
        ELSE
            -- For individual user
            SELECT role, username INTO v_user FROM public.users WHERE id = NEW.user_id;
            IF FOUND THEN
                INSERT INTO public.notification_jobs (
                    event_type,
                    recipient_user_id,
                    recipient_role,
                    payload,
                    status
                ) VALUES (
                    v_event_type,
                    NEW.user_id,
                    v_user.role,
                    json_build_object(
                        'username', v_user.username,
                        'expiration_date', NEW.expiration_date,
                        'grace_period_end', v_grace_end,
                        'role', v_user.role
                    ),
                    'pending'
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;

-- Trigger to keep users in sync with subscription
DROP TRIGGER IF EXISTS trg_cascade_subscription_status ON public.subscriptions;
CREATE TRIGGER trg_cascade_subscription_status
AFTER UPDATE OF status ON public.subscriptions
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.cascade_subscription_status();
