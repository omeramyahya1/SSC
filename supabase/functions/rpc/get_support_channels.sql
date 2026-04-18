CREATE OR REPLACE FUNCTION public.get_support_channels()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

  IF admin_email IS NULL OR admin_phone IS NULL THEN
    RAISE EXCEPTION 'Support channel secrets are not configured';
  END IF;

  return pg_catalog.json_build_object(
    'email', admin_email,
    'whatsapp', admin_phone
  );
end;
$$;
