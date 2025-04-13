-- 1. Add GIN index to pages.content
CREATE INDEX idx_pages_content_fts ON public.pages USING GIN (to_tsvector('english', content));
COMMENT ON INDEX idx_pages_content_fts IS 'GIN index for full-text search on page content.';

-- 2. Update the search index trigger function to include page content
-- Drop existing function first
DROP FUNCTION IF EXISTS public.update_search_index();

-- Recreate the function with added logic for pages
CREATE OR REPLACE FUNCTION public.update_search_index()
RETURNS TRIGGER AS $$
DECLARE
    v_entity_type text := TG_TABLE_NAME;
    v_entity_id uuid;
    v_company_id uuid;
    v_title text;
    v_description text;
    v_search_text text;
    v_search_vector tsvector;
    v_record RECORD;
    v_page_content text;
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
        WHEN 'pages' THEN v_entity_type := 'page'; -- Add page type
        ELSE RETURN NULL; -- Ignore other tables
    END CASE;

    -- Handle DELETE operation
    IF (TG_OP = 'DELETE') THEN
        DELETE FROM public.search_index WHERE entity_type = v_entity_type AND entity_id = v_entity_id;
        RETURN OLD;
    END IF;

    -- Handle INSERT or UPDATE operations
    -- Extract common fields and determine company_id
    v_title := COALESCE(v_record.name, v_record.title, v_record.description);
    v_description := COALESCE(v_record.description, '');

    -- Determine company_id based on the table
    IF v_entity_type = 'project' THEN
        v_company_id := v_record.company_id;
    ELSIF v_entity_type = 'task' THEN
        SELECT p.company_id INTO v_company_id
        FROM public.sections s JOIN public.projects p ON s.project_id = p.id
        WHERE s.id = v_record.section_id;
    ELSIF v_entity_type = 'document' THEN
        IF v_record.project_id IS NOT NULL THEN
            SELECT p.company_id INTO v_company_id FROM public.projects p WHERE p.id = v_record.project_id;
        ELSE
            v_company_id := v_record.company_id;
        END IF;
        IF v_company_id IS NULL THEN RETURN NEW; END IF; -- Skip global docs
    ELSIF v_entity_type IN ('issue', 'risk') THEN
        SELECT p.company_id INTO v_company_id
        FROM public.projects p WHERE p.id = v_record.project_id;
    ELSIF v_entity_type = 'page' THEN
        -- Get company_id from the parent document
        SELECT COALESCE(d.company_id, p.company_id) INTO v_company_id
        FROM public.documents d LEFT JOIN public.projects p ON d.project_id = p.id
        WHERE d.id = v_record.document_id;
        IF v_company_id IS NULL THEN RETURN NEW; END IF; -- Skip pages of global docs
        -- Use page name as title, document name as part of description?
        v_title := v_record.name;
        SELECT name INTO v_description FROM public.documents WHERE id = v_record.document_id;
        v_page_content := v_record.content; -- Get page content
    ELSE
        RETURN NEW;
    END IF;

    IF v_company_id IS NULL THEN
        RAISE WARNING 'Could not determine company_id for %:% - skipping search index update.', v_entity_type, v_entity_id;
        DELETE FROM public.search_index WHERE entity_type = v_entity_type AND entity_id = v_entity_id;
        RETURN NEW;
    END IF;

    -- Concatenate relevant text fields
    v_search_text := COALESCE(v_title, '') || ' ' || COALESCE(v_description, '');
    IF v_entity_type = 'page' THEN
        v_search_text := v_search_text || ' ' || COALESCE(v_page_content, '');
    END IF;

    -- Create the tsvector with weighting
    v_search_vector := setweight(to_tsvector('english', COALESCE(v_title, '')), 'A') ||
                       setweight(to_tsvector('english', COALESCE(v_description, '')), 'B');
    IF v_entity_type = 'page' THEN
        v_search_vector := v_search_vector || setweight(to_tsvector('english', COALESCE(v_page_content, '')), 'C'); -- Add page content with lower weight
    END IF;

    -- Upsert into search_index table
    INSERT INTO public.search_index (entity_type, entity_id, company_id, title, description, search_vector)
    VALUES (v_entity_type, v_entity_id, v_company_id, v_title, left(v_description, 200), v_search_vector)
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
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Apply the trigger to the pages table
DROP TRIGGER IF EXISTS update_page_search_index_trigger ON public.pages;
CREATE TRIGGER update_page_search_index_trigger
AFTER INSERT OR UPDATE OF name, content, document_id OR DELETE ON public.pages -- Trigger on content change
FOR EACH ROW EXECUTE FUNCTION public.update_search_index();
COMMENT ON TRIGGER update_page_search_index_trigger ON public.pages IS 'Updates search_index when pages are changed.';
