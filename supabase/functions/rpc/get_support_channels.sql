CREATE OR REPLACE FUNCTION public.get_support_channels()
RETURNS json
LANGUAGE plpgsql
security definer
AS $$
begin
  return json_build_object(
    'email', 'omeramyahya@protonmail.com',
    'whatsapp', '+249 12 345 6789'
  );
end;
$$;
