
begin
  return upper(
    substr(gen_random_uuid()::text, 1, 8) || '-' ||
    substr(gen_random_uuid()::text, 1, 4)
  );
end;
