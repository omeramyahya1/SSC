-- Periodic subscription enforcement (cloud)
-- - Subscriptions have no "grace" status; they become "expired" once expiration_date passes.
-- - Users can be "grace" between expiration_date and grace_period_end.

CREATE OR REPLACE FUNCTION public.enforce_subscription_statuses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    r RECORD;
    v_now timestamptz := now();
    v_expires timestamptz;
    v_grace_end timestamptz;
    v_org_id uuid;
BEGIN
    -------------------------------------------------------------------
    -- STEP 1: Expire subscriptions whose expiration_date has passed.
    -- This fires the cascade trigger (status update) for each row changed.
    -------------------------------------------------------------------
    UPDATE public.subscriptions s
    SET status = 'expired'::public.subscriptions.status,
        grace_period_end = COALESCE(s.grace_period_end, s.expiration_date + interval '7 days'),
        updated_at = v_now
    WHERE s.expiration_date IS NOT NULL
      AND v_now > s.expiration_date
      AND s.status::text IN ('active', 'trial');

    -------------------------------------------------------------------
    -- STEP 2: For subscriptions already expired, advance users from grace -> expired
    -- once grace_period_end has passed. This is required because subscription.status
    -- does not change during grace end.
    -------------------------------------------------------------------
    FOR r IN
        SELECT s.user_id, s.expiration_date, COALESCE(s.grace_period_end, s.expiration_date + interval '7 days') AS grace_end
        FROM public.subscriptions s
        WHERE s.expiration_date IS NOT NULL
          AND s.status::text = 'expired'
    LOOP
        v_expires := r.expiration_date;
        v_grace_end := r.grace_end;

        IF v_now <= v_grace_end THEN
            CONTINUE;
        END IF;

        SELECT u.organization_id INTO v_org_id
        FROM public.users u
        WHERE u.id = r.user_id;

        IF v_org_id IS NOT NULL THEN
            UPDATE public.users
            SET status = 'expired'::public.users.status
            WHERE organization_id = v_org_id
              AND status::text = 'grace';
        ELSE
            UPDATE public.users
            SET status = 'expired'::public.users.status
            WHERE id = r.user_id
              AND status::text = 'grace';
        END IF;
    END LOOP;
END;
$$;


DO $$
BEGIN
  PERFORM cron.unschedule('subscription-enforcement');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Run every 15 minutes
SELECT cron.schedule(
  'subscription-enforcement',
  '*/15 * * * *',
  'SELECT public.enforce_subscription_statuses();'
);

