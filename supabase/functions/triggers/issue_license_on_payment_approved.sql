
declare
  v_license varchar;
  v_sub_type varchar;
begin
  -- Only react to status change → approved
  if new.status = 'approved'
     and old.status is distinct from 'approved'
     and new.deleted_at is null then

    -- Lock subscription row
    select type
    into v_sub_type
    from subscriptions
    where id = new.subscription_id
      and deleted_at is null
    for update;

    -- Generate license
    v_license := generate_license_code();

    -- Apply subscription logic
    update subscriptions
    set
      license_code = v_license,
      status = 'active',
      grace_period_end = now() + interval '7 days',
      expiration_date = case
        when v_sub_type = 'monthly'  then now() + interval '1 month'
        when v_sub_type = 'annual'   then now() + interval '1 year'
        when v_sub_type = 'lifetime' then null
        when v_sub_type = 'trial'    then now() + interval '14 days'
      end,
      updated_at = now()
    where id = new.subscription_id;
  end if;

  return new;
end;
