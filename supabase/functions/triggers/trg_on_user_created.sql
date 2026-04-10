-- Create the trigger function
CREATE OR REPLACE FUNCTION public.fn_on_user_created()
RETURNS TRIGGER AS $$
DECLARE
    v_registration_data jsonb;
    v_temp_password text;
    v_org_name text;
BEGIN
    -- Only proceed for non-standard, non-active users (Employees/Admins being registered)
    IF NEW.account_type != 'standard' AND NEW.status != 'active' THEN
        -- Attempt to get the registration data from the session variable
        BEGIN
            v_registration_data := current_setting('app.registration_data', true)::jsonb;
            v_temp_password := v_registration_data->>'temp_password';
            v_org_name := v_registration_data->>'org_name';
        EXCEPTION WHEN OTHERS THEN
            -- If not set, we can't send the email with the password
            RETURN NEW;
        END;

        IF v_temp_password IS NOT NULL THEN
            -- Insert a job for the Edge Function to send the email
            INSERT INTO public.notification_jobs (
                event_type,
                recipient_user_id,
                recipient_role,
                payload,
                status
            ) VALUES (
                'employee_registration',
                NEW.id,
                NEW.role,
                json_build_object(
                    'username', NEW.username,
                    'temp_password', v_temp_password,
                    'org_name', COALESCE(v_org_name, 'Our Organization')
                ),
                'pending'
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_on_user_created ON public.users;
CREATE TRIGGER trg_on_user_created
AFTER INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.fn_on_user_created();
