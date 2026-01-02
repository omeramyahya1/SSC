DECLARE
    v_distributor_user_id uuid;
    v_owner_id uuid;
    v_owner_name text;
    v_subscription_type text;
    v_license_code text;
BEGIN
    SELECT 
        s.user_id,
        u.username,          
        s.type,
        s.license_code,
        d.id             
    INTO 
        v_owner_id,
        v_owner_name,
        v_subscription_type,
        v_license_code,
        v_distributor_user_id
    FROM public.subscriptions s
    JOIN public.users u ON s.user_id = u.id
    LEFT JOIN public.distributor_financials df ON s.user_id = df.user_id
    LEFT JOIN public.distributors d ON df.distributor_id = d.id
    WHERE s.id = NEW.subscription_id
    LIMIT 1;

    -- ==================================================
    -- CASE: Approved
BEGIN
  IF OLD.device_id IS DISTINCT FROM NEW.device_id THEN
    INSERT INTO public.notification_jobs (
                event_type,
                recipient_user_id,
                recipient_role,
                payload,
                status
            ) VALUES (
      'new_device_login',
      NEW.user_id,
      'user',
      json_build_object(
        'old_device_id', OLD.device_id,
        'new_device_id', NEW.device_id
      ),
      'pending'
    );
  END IF;
  RETURN NEW;
END;

    -- ==================================================
    IF NEW.status = 'approved' THEN
        
        -- Notify User
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
                'license_code', v_license_code,
                'subscription_payment_id', NEW.id
            ),
            'pending'
        );

        -- Notify Distributor (if exists)
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
    ELSIF NEW.status = 'declined' THEN

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