-- Function to cascade status to all users in the organization
CREATE OR REPLACE FUNCTION public.cascade_subscription_status()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id uuid;
BEGIN
    -- Find the organization_id of the owner of the subscription
    SELECT organization_id INTO v_org_id FROM public.users WHERE id = NEW.user_id;

    -- Update the status of all users in that organization
    IF v_org_id IS NOT NULL THEN
        UPDATE public.users SET status = NEW.status WHERE organization_id = v_org_id;
    ELSE
        -- Update only the individual user if no organization
        UPDATE public.users SET status = NEW.status WHERE id = NEW.user_id;
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
