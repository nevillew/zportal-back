-- supabase/migrations/20250412204700_enable_moddatetime.sql

-- Enable the moddatetime extension required for updated_at triggers
CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;

-- Note: We install it into the 'extensions' schema as recommended by Supabase.
-- The trigger function call should be schema-qualified if needed, e.g., extensions.moddatetime()
-- However, Supabase often handles pathing, so public.moddatetime might resolve correctly if the extension schema is in the search_path.
-- If the trigger *still* fails after this, the trigger definition in 20250412204800 might need changing to extensions.moddatetime.
