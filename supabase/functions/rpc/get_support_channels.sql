CREATE OR REPLACE FUNCTION public.get_support_channels()
RETURNS json
LANGUAGE plpgsql
security definer
AS $$
DECLARE
    ADMIN_EMAIL text;
    ADMIN_PHONE text;


begin
  SELECT decrypted_secret INTO ADMIN_EMAIL
  FROM vault.decrypted_secrets
  WHERE name = 'ADMIN_EMAIL';

  SELECT decrypted_secret INTO ADMIN_PHONE
  FROM vault.decrypted_secrets
  WHERE name = 'ADMIN_PHONE';
  return json_build_object(
    'email', ADMIN_EMAIL,
    'whatsapp', ADMIN_PHONE
  );
end;
$$;
