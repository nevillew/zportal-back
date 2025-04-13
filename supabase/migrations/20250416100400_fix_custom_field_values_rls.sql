-- Migration to fix the RLS policy on custom_field_values

-- Drop the overly permissive existing policy
DROP POLICY IF EXISTS "Allow access if definition is readable" ON public.custom_field_values;

-- Recreate the policy using the correct helper function for checking parent entity access
-- This policy covers SELECT, INSERT, UPDATE, DELETE
DROP POLICY IF EXISTS "Allow modification based on parent entity management" ON public.custom_field_values; -- Drop if exists from previous attempt
CREATE POLICY "Allow access based on parent entity management"
ON public.custom_field_values
FOR ALL -- Covers SELECT, INSERT, UPDATE, DELETE
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        -- Check management permission based on the specific parent entity
        -- Note: The entity_type is derived from the definition_id JOIN
        EXISTS (
            SELECT 1
            FROM public.custom_field_definitions cfd
            WHERE cfd.id = custom_field_values.definition_id
              AND can_manage_entity_for_custom_field(auth.uid(), cfd.entity_type, custom_field_values.entity_id)
        )
    )
)
WITH CHECK (
    -- Re-check permission for the row being modified/inserted
    is_staff_user(auth.uid()) OR
    EXISTS (
        SELECT 1
        FROM public.custom_field_definitions cfd
        WHERE cfd.id = custom_field_values.definition_id
          AND can_manage_entity_for_custom_field(auth.uid(), cfd.entity_type, custom_field_values.entity_id)
    )
);

COMMENT ON POLICY "Allow access based on parent entity management" ON public.custom_field_values IS 'Allows users to access/modify custom field values if they have management permissions on the associated entity, or if they are staff.';
