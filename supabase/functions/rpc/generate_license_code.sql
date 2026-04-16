CREATE OR REPLACE FUNCTION public.generate_license_code()
RETURNS text
LANGUAGE plpgsql
AS $$
begin
  return upper(
    substr(gen_random_uuid()::text, 1, 8) || '-' ||
    substr(gen_random_uuid()::text, 1, 4)
  );
end;
$$;
