-- DO NOT USE IN PRODUCTION AS-IS. See security notes below.
create or replace function upload_blob_and_get_url(
    bucket_path text,
    blob_data bytea,
    content_type text,
    -- SECURITY WARNING: Passing project_url and service_key as parameters is insecure.
    -- These values may be logged or exposed in monitoring tools.
    -- For production, consider using Supabase secrets management or, preferably,
    -- handle uploads from a trusted server-side environment (like the Python backend)
    -- directly to the Storage API, rather than through a database RPC.
    project_url text,
    service_key text
)
returns text language plpgsql as $$
declare
    storage_url text;
    request_id bigint;
    response_status int;
    response_body jsonb;
    public_url text;
begin
    -- Construct the Storage API URL for the upload.
    -- The bucket is hardcoded to 'SSC' as per the requirements.
    storage_url := project_url || '/storage/v1/object/SSC/' || bucket_path;

    -- Perform the HTTP POST request to upload the file using pg_net.
    -- The `pg_net` extension must be enabled in your Supabase project.
    select id into request_id from net.http_post(
        url := storage_url,
        body := blob_data,
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || service_key,
            'Content-Type', content_type,
            'X-Upsert', 'true' -- To overwrite file if it exists. Set to 'false' to prevent overwrites.
        )
    );

    -- Fetch the response from the request.
    select status, body into response_status, response_body from net.http_collect_response(request_id, timeout_milliseconds := 30000);

    -- Check if the upload was successful (HTTP 2xx status codes).
    if response_status < 200 or response_status >= 300 then
        raise exception 'Storage upload failed. Status: %, Body: %', response_status, response_body;
    end if;

    -- Construct the public URL for the uploaded file.
    -- This assumes the 'SSC' bucket is public.
    public_url := project_url || '/storage/v1/object/public/SSC/' || bucket_path;

    -- Return the public URL.
    return public_url;
end;
$$;
