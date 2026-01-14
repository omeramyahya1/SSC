CREATE OR REPLACE FUNCTION public.register_organization(
    p_org_name TEXT,
    p_plan_type TEXT,
    p_branch_name TEXT
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_org_id uuid;
    new_branch_id uuid;
BEGIN
    -- Insert new organization
    INSERT INTO public.organizations (name, plan_type)
    VALUES (p_org_name, p_plan_type)
    RETURNING id INTO new_org_id;

    -- Insert new branch (e.g., HQ)
    INSERT INTO public.branches (name, organization_id)
    VALUES (p_branch_name, new_org_id)
    RETURNING id INTO new_branch_id;

    -- Return the new IDs
    RETURN json_build_object(
        'organization_id', new_org_id,
        'branch_id', new_branch_id
    );
END;
$$;
