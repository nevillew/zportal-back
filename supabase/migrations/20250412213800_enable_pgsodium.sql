
-- supabase/migrations/20250412213800_enable_pgsodium.sql

-- Enable the pgsodium extension required for Supabase Vault
-- It must be installed in its own schema, typically 'pgsodium'.
-- Omitting 'WITH SCHEMA' allows it to use its default or create 'pgsodium'.
CREATE EXTENSION IF NOT EXISTS pgsodium;

COMMENT ON EXTENSION pgsodium IS 'Pgsodium cryptographic extension for Supabase Vault.';
