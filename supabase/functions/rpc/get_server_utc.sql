create or replace function public.get_server_utc()
returns timestamptz
language sql
security definer
stable
as $$
  select now() at time zone 'utc';
$$;
