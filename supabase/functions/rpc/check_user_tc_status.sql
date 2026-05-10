CREATE OR REPLACE FUNCTION check_user_tc_status(p_user_id uuid)
RETURNS TABLE (
    needs_update boolean,
    latest_tc_id uuid,
    latest_tc_content jsonb,
    latest_version int
) AS $$
DECLARE
    v_latest_id uuid;
    v_latest_version int;
    v_latest_content jsonb;
    v_user_agreed_version int;
BEGIN
    -- SECURITY DEFINER: Required to allow all authenticated users to read T&C
    -- regardless of RLS policies on terms_and_conditions table.

    -- 1. Get the latest active T&C version
    SELECT id, version, content
    INTO v_latest_id, v_latest_version, v_latest_content
    FROM terms_and_conditions
    WHERE is_active = true
    ORDER BY version DESC
    LIMIT 1;

    -- Early return if no active T&C exists
    IF v_latest_id IS NULL THEN
        RETURN QUERY
        SELECT true, NULL::uuid, NULL::jsonb, NULL::int;
        RETURN;
    END IF;

    -- 2. Get the highest version the user has agreed to
    SELECT MAX(tc.version)
    INTO v_user_agreed_version
    FROM user_tc_agreements uta
    JOIN terms_and_conditions tc ON uta.tc_id = tc.id
    WHERE uta.user_id = p_user_id;

    -- 3. Return results
    RETURN QUERY
    SELECT
        COALESCE(v_user_agreed_version, 0) < v_latest_version AS needs_update,
        v_latest_id,
        v_latest_content,
        v_latest_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
