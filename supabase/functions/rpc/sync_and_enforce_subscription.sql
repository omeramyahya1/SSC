-- RPC for the app to trigger a server-side status re-evaluation
CREATE OR REPLACE FUNCTION public.sync_and_enforce_subscription(p_user_id uuid)
RETURNS json AS $$
DECLARE
    v_caller_user_id uuid;
    v_target_user_id uuid;
    v_org_id uuid;
    v_sub_id uuid;
    v_expires timestamptz;
    v_grace_end timestamptz;
    v_new_status text;
    v_user_effective_status text;
    v_now timestamptz := now();
    v_debug_msg text;
    v_rows_updated integer := 0;
BEGIN
    v_caller_user_id := jwt_user_id();

    -- Caller must be authenticated, and can only request enforcement for themselves.
    IF v_caller_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Unauthenticated', 'debug', 'jwt_user_id() is NULL');
    END IF;
    IF p_user_id IS DISTINCT FROM v_caller_user_id THEN
        RETURN json_build_object('success', false, 'message', 'Forbidden: p_user_id mismatch', 'debug', 'caller=' || v_caller_user_id::text || ', p_user_id=' || COALESCE(p_user_id::text, 'NULL'));
    END IF;

    -- 1. Identify the target user who owns the subscription
    SELECT organization_id INTO v_org_id FROM public.users WHERE id = v_caller_user_id;

    IF v_org_id IS NOT NULL THEN
        -- Find the admin of this organization
        SELECT id INTO v_target_user_id FROM public.users 
        WHERE organization_id = v_org_id AND role = 'admin'
        LIMIT 1;
        
        v_debug_msg := 'Org flow. OrgID: ' || v_org_id || ', AdminID: ' || COALESCE(v_target_user_id::text, 'NULL');
        
        -- Fallback to the provided user if no admin found
        IF v_target_user_id IS NULL THEN
            v_target_user_id := v_caller_user_id;
        END IF;
    ELSE
        -- Individual user
        v_target_user_id := v_caller_user_id;
        v_debug_msg := 'Individual flow. UserID: ' || v_caller_user_id;
    END IF;

    -- 2. Get the most recent non-pending subscription for the target user
    SELECT id, expiration_date, grace_period_end INTO v_sub_id, v_expires, v_grace_end
    FROM public.subscriptions
    WHERE user_id = v_target_user_id AND status != 'pending'
    ORDER BY created_at DESC LIMIT 1;

    IF v_sub_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'No subscription found', 'debug', v_debug_msg);
    END IF;

    -- Default grace_period_end to expiration_date + 7 days if NULL
    IF v_grace_end IS NULL AND v_expires IS NOT NULL THEN
        v_grace_end := v_expires + interval '7 days';
    END IF;

    -- 3. Calculate Status
    -- subscriptions.status does NOT have a grace state. Once expiration_date passes, it becomes expired.
    IF v_expires IS NULL THEN
        v_new_status := 'active';
    ELSIF v_now > v_expires THEN
        v_new_status := 'expired';
    ELSE
        v_new_status := 'active';
    END IF;

    -- User effective status: grace is represented on users.status, not subscriptions.status.
    IF v_expires IS NULL THEN
        v_user_effective_status := 'active';
    ELSIF v_now > v_grace_end THEN
        v_user_effective_status := 'expired';
    ELSIF v_now > v_expires THEN
        v_user_effective_status := 'grace';
    ELSE
        v_user_effective_status := 'active';
    END IF;

    v_debug_msg := v_debug_msg || '. SubID: ' || v_sub_id || ', SubStatus: ' || v_new_status || ', UserStatus: ' || v_user_effective_status;

    -- 4. Update only if status changed to avoid redundant trigger firing
    -- Use explicit casting to the USER-DEFINED enum type
    UPDATE public.subscriptions
    SET status = v_new_status::public.subscriptions.status,
        grace_period_end = v_grace_end,
        updated_at = v_now
    WHERE id = v_sub_id AND status::text != v_new_status;
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    RETURN json_build_object(
        'success', true,
        'new_status', v_new_status,
        'effective_user_status', v_user_effective_status,
        'caller_user_id', v_caller_user_id,
        'target_user_id', v_target_user_id,
        'rows_updated', v_rows_updated,
        'expiration_date', v_expires,
        'grace_period_end', v_grace_end,
        'debug', v_debug_msg
    );
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;
