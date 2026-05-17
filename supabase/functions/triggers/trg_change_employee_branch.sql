-- Create the trigger function
CREATE OR REPLACE FUNCTION public.fn_change_employee_branch()
RETURNS TRIGGER AS $$
DECLARE
    v_old_branch_name text;
    v_new_branch_name text;
    v_org_name text;
BEGIN
    -- Only proceed if branch_id has changed and it's an employee
    IF (OLD.branch_id IS DISTINCT FROM NEW.branch_id) AND NEW.role = 'employee' THEN

        -- Get branch names
        SELECT name INTO v_old_branch_name FROM public.branches WHERE id = OLD.branch_id;
        SELECT name INTO v_new_branch_name FROM public.branches WHERE id = NEW.branch_id;

        -- Get organization name
        SELECT name INTO v_org_name FROM public.organizations WHERE id = NEW.organization_id;

        -- Insert a job for the Edge Function to send the email
        INSERT INTO public.notification_jobs (
            event_type,
            recipient_user_id,
            recipient_role,
            payload,
            status
        ) VALUES (
            'employee_branch_change',
            NEW.id,
            NEW.role,
            json_build_object(
                'username', NEW.username,
                'old_branch_name', COALESCE(v_old_branch_name, 'N/A'),
                'new_branch_name', COALESCE(v_new_branch_name, 'N/A'),
                'org_name', COALESCE(v_org_name, 'Our Organization')
            ),
            'pending'
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_change_employee_branch ON public.users;
CREATE TRIGGER trg_change_employee_branch
AFTER UPDATE ON public.users
FOR EACH ROW
WHEN (NEW.role = 'employee')
EXECUTE FUNCTION public.fn_change_employee_branch();

