-- Function to cascade status to all users in the organization and create notifications
CREATE OR REPLACE FUNCTION public.cascade_subscription_status()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id uuid;
    v_user record;
    v_event_type text;
BEGIN
    -- Find the organization_id of the owner of the subscription
    SELECT organization_id INTO v_org_id FROM public.users WHERE id = NEW.user_id;

    -- 1. Update the status of all users in that organization
    IF v_org_id IS NOT NULL THEN
        UPDATE public.users SET status = NEW.status WHERE organization_id = v_org_id;
    ELSE
        -- Update only the individual user if no organization
        UPDATE public.users SET status = NEW.status WHERE id = NEW.user_id;
    END IF;

    -- 2. Create notification jobs if status is grace or expired
    IF NEW.status IN ('grace', 'expired') THEN
        v_event_type := CASE 
            WHEN NEW.status = 'grace' THEN 'subscription_grace_period'
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
                        'grace_period_end', NEW.grace_period_end,
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
                        'grace_period_end', NEW.grace_period_end,
                        'role', v_user.role
                    ),
                    'pending'
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to keep users in sync with subscription
DROP TRIGGER IF EXISTS trg_cascade_subscription_status ON public.subscriptions;
CREATE TRIGGER trg_cascade_subscription_status
AFTER UPDATE OF status ON public.subscriptions
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.cascade_subscription_status();
