-- Migration to set up Full-Text Search (FTS)

-- 1. Create the search_index table
CREATE TABLE public.search_index (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type text NOT NULL CHECK (entity_type IN ('project', 'task', 'document', 'issue', 'risk')), -- Type of the source entity
    entity_id uuid NOT NULL, -- ID of the source entity
    company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE, -- Company context for RLS
    title text, -- Title/Name of the entity for display in search results
    description text, -- Short description/snippet for display
    search_vector tsvector NOT NULL, -- The indexed text vector
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT unique_entity_search_entry UNIQUE (entity_type, entity_id)
);

-- Add comments
COMMENT ON TABLE public.search_index IS 'Stores indexed text content from various tables for full-text search.';
COMMENT ON COLUMN public.search_index.entity_type IS 'Type of the source entity (e.g., project, task).';
COMMENT ON COLUMN public.search_index.entity_id IS 'UUID of the source entity record.';
COMMENT ON COLUMN public.search_index.company_id IS 'Company associated with the entity for RLS filtering.';
COMMENT ON COLUMN public.search_index.title IS 'Display title for the search result.';
COMMENT ON COLUMN public.search_index.description IS 'Display description snippet for the search result.';
COMMENT ON COLUMN public.search_index.search_vector IS 'Weighted tsvector containing searchable text content.';

-- Add indexes
CREATE INDEX idx_search_index_entity ON public.search_index(entity_type, entity_id);
CREATE INDEX idx_search_index_company_id ON public.search_index(company_id);
-- Create a GIN index on the tsvector column for efficient FTS queries
CREATE INDEX idx_search_index_search_vector_gin ON public.search_index USING GIN (search_vector);

-- Trigger for updated_at
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.search_index
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);


-- 2. Create the trigger function to update the search_index table
CREATE OR REPLACE FUNCTION public.update_search_index()
RETURNS TRIGGER AS $$
DECLARE
    v_entity_type text := TG_TABLE_NAME; -- e.g., 'projects', 'tasks'
    v_entity_id uuid;
    v_company_id uuid;
    v_title text;
    v_description text;
    v_search_text text;
    v_search_vector tsvector;
    v_record RECORD;
BEGIN
    -- Determine entity_id and record based on operation
    IF (TG_OP = 'DELETE') THEN
        v_entity_id := OLD.id;
        v_record := OLD;
    ELSE
        v_entity_id := NEW.id;
        v_record := NEW;
    END IF;

    -- Map table name to entity type string used in search_index
    CASE v_entity_type
        WHEN 'projects' THEN v_entity_type := 'project';
        WHEN 'tasks' THEN v_entity_type := 'task';
        WHEN 'documents' THEN v_entity_type := 'document';
        WHEN 'issues' THEN v_entity_type := 'issue';
        WHEN 'risks' THEN v_entity_type := 'risk';
        ELSE RETURN NULL; -- Ignore other tables
    END CASE;

    -- Handle DELETE operation
    IF (TG_OP = 'DELETE') THEN
        DELETE FROM public.search_index WHERE entity_type = v_entity_type AND entity_id = v_entity_id;
        RETURN OLD;
    END IF;

    -- Handle INSERT or UPDATE operations
    -- Extract common fields and determine company_id
    v_title := COALESCE(v_record.name, v_record.title, v_record.description); -- Use name, title, or description as title
    v_description := COALESCE(v_record.description, '');

    -- Determine company_id based on the table
    IF v_entity_type = 'project' THEN
        v_company_id := v_record.company_id;
    ELSIF v_entity_type = 'task' THEN
        SELECT p.company_id INTO v_company_id
        FROM public.sections s JOIN public.projects p ON s.project_id = p.id
        WHERE s.id = v_record.section_id;
    ELSIF v_entity_type = 'document' THEN
        -- Documents can be global, company, or project scoped
        IF v_record.project_id IS NOT NULL THEN
            SELECT p.company_id INTO v_company_id FROM public.projects p WHERE p.id = v_record.project_id;
        ELSE
            v_company_id := v_record.company_id; -- Could be NULL for global docs
        END IF;
        -- Skip indexing global documents for now, as they lack company context for RLS
        IF v_company_id IS NULL THEN RETURN NEW; END IF;
    ELSIF v_entity_type IN ('issue', 'risk') THEN
        SELECT p.company_id INTO v_company_id
        FROM public.projects p WHERE p.id = v_record.project_id;
    ELSE
        -- Should not happen due to initial CASE statement, but good practice
        RETURN NEW;
    END IF;

    -- If company_id couldn't be determined (e.g., orphaned record), skip indexing
    IF v_company_id IS NULL THEN
        RAISE WARNING 'Could not determine company_id for %:% - skipping search index update.', v_entity_type, v_entity_id;
        -- Attempt to delete any existing index entry for safety
        DELETE FROM public.search_index WHERE entity_type = v_entity_type AND entity_id = v_entity_id;
        RETURN NEW;
    END IF;

    -- Concatenate relevant text fields for indexing (adjust fields per table as needed)
    v_search_text := COALESCE(v_title, '') || ' ' || COALESCE(v_description, '');
    -- Add more fields specific to entity types if desired
    -- IF v_entity_type = 'task' THEN v_search_text := v_search_text || ' ' || COALESCE(v_record.status, ''); END IF;

    -- Create the tsvector with weighting (A=highest, D=lowest)
    v_search_vector := setweight(to_tsvector('english', COALESCE(v_title, '')), 'A') ||
                       setweight(to_tsvector('english', COALESCE(v_description, '')), 'B');

    -- Upsert into search_index table
    INSERT INTO public.search_index (entity_type, entity_id, company_id, title, description, search_vector)
    VALUES (v_entity_type, v_entity_id, v_company_id, v_title, left(v_description, 200), v_search_vector) -- Truncate description snippet
    ON CONFLICT (entity_type, entity_id)
    DO UPDATE SET
        company_id = EXCLUDED.company_id,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        search_vector = EXCLUDED.search_vector,
        updated_at = now();

    RETURN NEW;

EXCEPTION
    WHEN others THEN
        RAISE WARNING 'Error in update_search_index trigger for %:% - %', v_entity_type, v_entity_id, SQLERRM;
        RETURN NEW; -- Don't block the original operation
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.update_search_index() IS 'Trigger function to update the search_index table when relevant source tables change.';


-- 3. Apply the trigger to relevant tables
-- Note: Assumes the 'id' column is the primary key for all these tables.

-- Projects
DROP TRIGGER IF EXISTS update_project_search_index_trigger ON public.projects;
CREATE TRIGGER update_project_search_index_trigger
AFTER INSERT OR UPDATE OF name, company_id OR DELETE ON public.projects -- Add relevant text columns
FOR EACH ROW EXECUTE FUNCTION public.update_search_index();
COMMENT ON TRIGGER update_project_search_index_trigger ON public.projects IS 'Updates search_index when projects are changed.';

-- Tasks
DROP TRIGGER IF EXISTS update_task_search_index_trigger ON public.tasks;
CREATE TRIGGER update_task_search_index_trigger
AFTER INSERT OR UPDATE OF name, description, section_id OR DELETE ON public.tasks -- Add relevant text/context columns
FOR EACH ROW EXECUTE FUNCTION public.update_search_index();
COMMENT ON TRIGGER update_task_search_index_trigger ON public.tasks IS 'Updates search_index when tasks are changed.';

-- Documents
DROP TRIGGER IF EXISTS update_document_search_index_trigger ON public.documents;
CREATE TRIGGER update_document_search_index_trigger
AFTER INSERT OR UPDATE OF name, company_id, project_id OR DELETE ON public.documents -- Add relevant text/context columns
FOR EACH ROW EXECUTE FUNCTION public.update_search_index();
COMMENT ON TRIGGER update_document_search_index_trigger ON public.documents IS 'Updates search_index when documents are changed.';
-- TODO: Consider indexing document 'pages.content' as well, might require a separate trigger/logic.

-- Issues
DROP TRIGGER IF EXISTS update_issue_search_index_trigger ON public.issues;
CREATE TRIGGER update_issue_search_index_trigger
AFTER INSERT OR UPDATE OF description, resolution, project_id OR DELETE ON public.issues -- Add relevant text/context columns
FOR EACH ROW EXECUTE FUNCTION public.update_search_index();
COMMENT ON TRIGGER update_issue_search_index_trigger ON public.issues IS 'Updates search_index when issues are changed.';

-- Risks
DROP TRIGGER IF EXISTS update_risk_search_index_trigger ON public.risks;
CREATE TRIGGER update_risk_search_index_trigger
AFTER INSERT OR UPDATE OF description, mitigation_plan, contingency_plan, project_id OR DELETE ON public.risks -- Add relevant text/context columns
FOR EACH ROW EXECUTE FUNCTION public.update_search_index();
COMMENT ON TRIGGER update_risk_search_index_trigger ON public.risks IS 'Updates search_index when risks are changed.';


-- 4. Add RLS Policies for search_index table
ALTER TABLE public.search_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_index FORCE ROW LEVEL SECURITY;

-- Allow users to SELECT search results for companies they are members of, or if they are staff.
CREATE POLICY "Allow SELECT based on company membership or staff status"
ON public.search_index
FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        is_member_of_company(auth.uid(), company_id)
        -- Note: This provides access to *all* indexed items within the company.
        -- More granular checks (e.g., can access specific project/task) would need to be applied
        -- either here (making the policy much more complex) or in the RPC function that queries this table.
        -- For simplicity, we rely on company membership here.
    )
);

-- Disallow direct modifications by users (handled by triggers)
CREATE POLICY "Disallow direct INSERT" ON public.search_index FOR INSERT WITH CHECK (false);
CREATE POLICY "Disallow direct UPDATE" ON public.search_index FOR UPDATE USING (false);
CREATE POLICY "Disallow direct DELETE" ON public.search_index FOR DELETE USING (false);

COMMENT ON POLICY "Allow SELECT based on company membership or staff status" ON public.search_index IS 'Allows staff or members of the associated company to view search index entries.';
COMMENT ON POLICY "Disallow direct INSERT" ON public.search_index IS 'Prevents direct inserts; handled by triggers.';
COMMENT ON POLICY "Disallow direct UPDATE" ON public.search_index IS 'Prevents direct updates; handled by triggers.';
COMMENT ON POLICY "Disallow direct DELETE" ON public.search_index IS 'Prevents direct deletes; handled by triggers.';
