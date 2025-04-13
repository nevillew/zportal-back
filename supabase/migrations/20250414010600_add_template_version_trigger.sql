-- Function to ensure only one version is marked as latest for a template
CREATE OR REPLACE FUNCTION public.enforce_single_latest_template_version()
RETURNS TRIGGER AS $$
BEGIN
    -- If the inserted/updated row is marked as latest
    IF NEW.is_latest_version = true THEN
        -- Set all other versions of the same template to not latest
        UPDATE public.project_template_versions
        SET is_latest_version = false
        WHERE project_template_id = NEW.project_template_id
          AND id != NEW.id -- Don't update the row that triggered the function
          AND is_latest_version = true; -- Only update rows that are currently marked as latest
    END IF;

    -- If the updated row is being marked as NOT latest, ensure at least one other version IS latest
    -- (This prevents accidentally having NO latest version, though might be desired in some cases)
    -- Optional: Add logic here if needed to enforce at least one latest version.

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to enforce the single latest version rule
DROP TRIGGER IF EXISTS enforce_single_latest_version_trigger ON public.project_template_versions;
CREATE TRIGGER enforce_single_latest_version_trigger
AFTER INSERT OR UPDATE OF is_latest_version ON public.project_template_versions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_single_latest_template_version();

COMMENT ON TRIGGER enforce_single_latest_version_trigger ON public.project_template_versions IS 'Ensures only one version of a project template can be marked as the latest.';
