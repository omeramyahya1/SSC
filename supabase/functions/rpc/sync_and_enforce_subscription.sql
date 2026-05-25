-- RPC for the app to trigger a server-side status re-evaluation
CREATE OR REPLACE FUNCTION public.sync_and_enforce_subscription(p_user_id uuid)
RETURNS json AS $$
DECLARE
    v_sub_id uuid;
    v_expires timestamptz;
    v_grace_end timestamptz;
    v_new_status public.subscriptions.status%TYPE;
    v_now timestamptz := now();
BEGIN
    -- Get the most recent non-pending subscription for the user
    SELECT id, expiration_date, grace_period_end INTO v_sub_id, v_expires, v_grace_end
    FROM public.subscriptions
    WHERE user_id = p_user_id AND status != 'pending'
    ORDER BY created_at DESC LIMIT 1;

    IF v_sub_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'No subscription found');
    END IF;

    -- Default grace_period_end to expiration_date + 7 days if NULL
    IF v_grace_end IS NULL AND v_expires IS NOT NULL THEN
        v_grace_end := v_expires + interval '7 days';
    END IF;

    -- Calculate Status
    IF v_expires IS NULL THEN
        -- Likely a lifetime subscription or one without expiration
        v_new_status := 'active';
    ELSIF v_now > v_grace_end THEN
        v_new_status := 'expired';
    ELSIF v_now > v_expires THEN
        v_new_status := 'grace';
    ELSE
        v_new_status := 'active';
    END IF;

    -- Update only if status changed to avoid redundant trigger firing
    UPDATE public.subscriptions
    SET status = v_new_status,
        grace_period_end = v_grace_end, -- Ensure grace period is persisted if it was null
        updated_at = v_now
    WHERE id = v_sub_id AND status != v_new_status;

    RETURN json_build_object(
        'success', true,
        'new_status', v_new_status,
        'expiration_date', v_expires,
        'grace_period_end', v_grace_end
    );
END;
$$ LANGUAGE plpgsql;
