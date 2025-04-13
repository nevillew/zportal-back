-- Migration to create an RPC function for securely fetching secrets from Vault

CREATE OR REPLACE FUNCTION public.get_decrypted_secret(p_secret_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER -- Essential for accessing the vault schema
SET search_path = supabase_vault, public -- Ensure vault schema is searched
AS $$
DECLARE
    v_decrypted_secret text;
BEGIN
    -- Check if the calling user is authenticated (basic security check)
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated to fetch secrets.';
    END IF;

    -- Fetch the decrypted secret from the vault
    SELECT decrypted_secret INTO v_decrypted_secret
    FROM supabase_vault.secrets
    WHERE name = p_secret_name;

    IF NOT FOUND THEN
        RAISE WARNING 'Secret "%" not found in Vault.', p_secret_name;
        RETURN NULL;
    END IF;

    RETURN v_decrypted_secret;

EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE WARNING 'Permission denied accessing Vault for secret "%". Ensure function owner (postgres) has USAGE on supabase_vault schema.', p_secret_name;
        RETURN NULL; -- Return null on permission errors
    WHEN others THEN
        RAISE WARNING 'Error accessing Vault for secret "%": %', p_secret_name, SQLERRM;
        RETURN NULL; -- Return null on other errors
END;
$$;

-- Grant execute permission to the authenticated role
GRANT EXECUTE ON FUNCTION public.get_decrypted_secret(text) TO authenticated;

COMMENT ON FUNCTION public.get_decrypted_secret(text) IS 'Securely fetches a decrypted secret from Supabase Vault. Requires the function owner (postgres) to have USAGE permission on the supabase_vault schema.';
