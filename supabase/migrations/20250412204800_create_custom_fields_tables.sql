-- Migration: create_custom_fields_tables
-- Date: 2025-04-12 20:48:00 UTC+10

-- 1. Create custom_field_definitions table
CREATE TABLE public.custom_field_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE CHECK (name ~ '^[a-z0-9_]+$' AND length(name) > 0 AND length(name) <= 50), -- Machine-readable name (snake_case)
    label text NOT NULL CHECK (length(label) > 0 AND length(label) <= 100), -- Human-readable label for UI
    entity_type text NOT NULL CHECK (entity_type IN ('company', 'project', 'task', 'user', 'document')), -- Entity this field applies to
    field_type text NOT NULL CHECK (field_type IN ('text', 'textarea', 'number', 'date', 'boolean', 'select', 'multi_select', 'url')), -- Data type of the field
    options jsonb, -- For 'select', 'multi_select': [{"value": "option_1", "label": "Option 1"}, ...]
    validation_rules jsonb, -- For validation: {"required": true, "minLength": 5, "maxValue": 100, "pattern": "^[A-Za-z]+$"}
    is_filterable boolean NOT NULL DEFAULT false, -- Can be used in list filters?
    is_sortable boolean NOT NULL DEFAULT false, -- Can lists be sorted by this field? (Use with caution)
    "order" integer NOT NULL DEFAULT 0, -- Display order in forms/UI
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    -- Ensure options are provided only for relevant types
    CONSTRAINT options_for_select_types CHECK (
        (field_type IN ('select', 'multi_select') AND options IS NOT NULL) OR
        (field_type NOT IN ('select', 'multi_select') AND options IS NULL)
    )
);

-- Add comments to explain columns
COMMENT ON COLUMN public.custom_field_definitions.name IS 'Unique machine-readable identifier for the custom field (e.g., client_tier).';
COMMENT ON COLUMN public.custom_field_definitions.label IS 'Human-readable name displayed in the UI (e.g., Client Tier).';
COMMENT ON COLUMN public.custom_field_definitions.entity_type IS 'The type of entity this custom field belongs to (e.g., company, project, task).';
COMMENT ON COLUMN public.custom_field_definitions.field_type IS 'The data type and corresponding UI input type (e.g., text, number, date, select).';
COMMENT ON COLUMN public.custom_field_definitions.options IS 'JSON array of options for select/multi_select types, e.g., [{"value": "opt_1", "label": "Option 1"}].';
COMMENT ON COLUMN public.custom_field_definitions.validation_rules IS 'JSON object defining validation rules (e.g., {"required": true, "maxLength": 50}).';
COMMENT ON COLUMN public.custom_field_definitions.is_filterable IS 'Indicates if this field can be used for filtering lists in the UI.';
COMMENT ON COLUMN public.custom_field_definitions.is_sortable IS 'Indicates if lists can be sorted by this field''s value (may impact performance).';
COMMENT ON COLUMN public.custom_field_definitions."order" IS 'Controls the display order of the field in forms.';

-- Indexes
CREATE INDEX idx_custom_field_definitions_entity_type ON public.custom_field_definitions(entity_type);

-- Enable RLS
ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_definitions FORCE ROW LEVEL SECURITY; -- Ensure RLS is enforced for table owner

-- RLS Policies (Staff can manage, others can read)
-- Assuming is_staff_user function exists from previous migrations or setup
CREATE POLICY "Allow staff full access on definitions" ON public.custom_field_definitions
    FOR ALL
    USING (public.is_staff_user(auth.uid()))
    WITH CHECK (public.is_staff_user(auth.uid()));

CREATE POLICY "Allow authenticated read access on definitions" ON public.custom_field_definitions
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Trigger for updated_at (Assuming moddatetime function exists)
-- CREATE EXTENSION IF NOT EXISTS moddatetime; -- Ensure the extension is enabled (might be in another migration)
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.custom_field_definitions
  FOR EACH ROW EXECUTE PROCEDURE extensions.moddatetime (updated_at); -- Changed schema


-- 2. Create custom_field_values table
CREATE TABLE public.custom_field_values (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    definition_id uuid NOT NULL REFERENCES public.custom_field_definitions(id) ON DELETE CASCADE,
    entity_id uuid NOT NULL, -- The ID of the specific company, project, task, etc.
    value jsonb, -- Stores the actual value, type depends on definition.field_type
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    -- Ensure only one value per definition per entity
    CONSTRAINT unique_custom_field_value UNIQUE (definition_id, entity_id)
);

-- Add comments
COMMENT ON COLUMN public.custom_field_values.definition_id IS 'Link to the definition of this custom field.';
COMMENT ON COLUMN public.custom_field_values.entity_id IS 'The ID of the specific entity instance (e.g., project_id, task_id) this value belongs to.';
COMMENT ON COLUMN public.custom_field_values.value IS 'The actual value stored as JSONB (e.g., "text", 123, true, ["option1"], "2023-10-27T00:00:00Z"). Type consistency enforced by application logic.';

-- Indexes
CREATE INDEX idx_custom_field_values_definition_id ON public.custom_field_values(definition_id);
CREATE INDEX idx_custom_field_values_entity_id ON public.custom_field_values(entity_id);
-- GIN index for searching within JSONB values if needed
CREATE INDEX idx_custom_field_values_value_gin ON public.custom_field_values USING GIN (value);

-- Enable RLS
ALTER TABLE public.custom_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_values FORCE ROW LEVEL SECURITY; -- Ensure RLS is enforced for table owner

-- RLS Policies (Simplified for now: Allow access if user can read the definition)
-- A more robust policy would check permissions on the specific entity_id based on entity_type
CREATE POLICY "Allow access if definition is readable" ON public.custom_field_values
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.custom_field_definitions d
            WHERE d.id = definition_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.custom_field_definitions d
            WHERE d.id = definition_id
        )
    );
-- NOTE: This simplified RLS for values is likely too permissive for non-staff users.
-- It allows anyone who can read *any* definition to potentially read/write *any* value.
-- A proper implementation needs a function like `can_access_entity_for_custom_field(auth.uid(), entity_id, definition_id)`
-- which checks permissions based on the entity type associated with the definition_id.
-- This will be addressed in a subsequent step or requires defining that helper function first.

-- Trigger for updated_at (Assuming moddatetime function exists)
-- CREATE EXTENSION IF NOT EXISTS moddatetime; -- Ensure the extension is enabled (might be in another migration)
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.custom_field_values
  FOR EACH ROW EXECUTE PROCEDURE extensions.moddatetime (updated_at); -- Changed schema
