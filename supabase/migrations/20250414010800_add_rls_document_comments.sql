-- Enable RLS
ALTER TABLE public.document_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_comments FORCE ROW LEVEL SECURITY;

-- Allow SELECT if user can access parent document, respecting is_internal flag
CREATE POLICY "Allow SELECT based on parent document access and internal flag"
ON public.document_comments
FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    EXISTS (
        SELECT 1 FROM public.pages p
        WHERE p.id = document_comments.page_id AND can_access_document(auth.uid(), p.document_id)
    ) AND
    (is_internal = false OR is_staff_user(auth.uid()))
);

-- Allow INSERT if user can access parent document
CREATE POLICY "Allow INSERT if user can access parent document"
ON public.document_comments
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated' AND
    user_id = auth.uid() AND -- Can only insert as self
    EXISTS (
        SELECT 1 FROM public.pages p
        WHERE p.id = document_comments.page_id AND can_access_document(auth.uid(), p.document_id)
    ) AND
    -- Prevent non-staff from creating internal comments
    (is_internal = false OR is_staff_user(auth.uid()))
);

-- Allow UPDATE for comment author or staff
CREATE POLICY "Allow UPDATE for author or staff"
ON public.document_comments
FOR UPDATE
USING (
    auth.role() = 'authenticated' AND
    (user_id = auth.uid() OR is_staff_user(auth.uid()))
)
WITH CHECK (
    user_id = auth.uid() -- Only author can change content
    -- Staff might only be allowed to change is_internal? Requires more complex logic if so.
);

-- Allow DELETE for comment author or staff
CREATE POLICY "Allow DELETE for author or staff"
ON public.document_comments
FOR DELETE
USING (
    auth.role() = 'authenticated' AND
    (user_id = auth.uid() OR is_staff_user(auth.uid()))
);

COMMENT ON POLICY "Allow SELECT based on parent document access and internal flag" ON public.document_comments IS 'Users can view comments on documents they can access, respecting internal flag for non-staff.';
COMMENT ON POLICY "Allow INSERT if user can access parent document" ON public.document_comments IS 'Users can comment on documents they can access, non-staff cannot create internal comments.';
COMMENT ON POLICY "Allow UPDATE for author or staff" ON public.document_comments IS 'Users can update their own comments; staff can potentially update any (e.g., moderate).';
COMMENT ON POLICY "Allow DELETE for author or staff" ON public.document_comments IS 'Users can delete their own comments; staff can delete any.';
