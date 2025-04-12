-- supabase/migrations/20250412213000_add_task_files_rls.sql

-- 1. Enable RLS on the table
ALTER TABLE public.task_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_files FORCE ROW LEVEL SECURITY; -- Ensure RLS is enforced for table owner

-- 2. Allow users to view file records for tasks they can access
--    Assumes RLS is correctly set on 'tasks' table.
DROP POLICY IF EXISTS "Users can view files for accessible tasks" ON public.task_files;
CREATE POLICY "Users can view files for accessible tasks"
    ON public.task_files FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tasks WHERE id = task_files.task_id
            -- RLS on tasks applies implicitly here
        )
    );

-- 3. Allow users to insert file records for tasks they can manage
--    Checks if the user has 'task:manage' permission or is staff.
--    Ensures the uploaded_by_user_id matches the authenticated user.
DROP POLICY IF EXISTS "Users can insert files for manageable tasks" ON public.task_files;
CREATE POLICY "Users can insert files for manageable tasks"
    ON public.task_files FOR INSERT
    WITH CHECK (
        (
            task_files.uploaded_by_user_id = auth.uid()
        ) AND (
            -- Check permission on the associated task's project/company
            EXISTS (
                SELECT 1
                FROM public.tasks t
                JOIN public.sections s ON t.section_id = s.id
                JOIN public.projects p ON s.project_id = p.id
                WHERE t.id = task_files.task_id
                  AND (
                    public.is_staff_user(auth.uid()) -- Check if user is staff
                    OR
                    public.has_permission(auth.uid(), p.company_id, 'task:manage') -- Check specific permission
                  )
            )
        )
    );

-- 4. Allow users to delete files if they uploaded them OR can manage the task
DROP POLICY IF EXISTS "Users can delete own files or if can manage task" ON public.task_files;
CREATE POLICY "Users can delete own files or if can manage task"
    ON public.task_files FOR DELETE
    USING (
        (
            task_files.uploaded_by_user_id = auth.uid() -- Uploader can delete
        ) OR (
            -- User has 'task:manage' permission or is staff
            EXISTS (
                SELECT 1
                FROM public.tasks t
                JOIN public.sections s ON t.section_id = s.id
                JOIN public.projects p ON s.project_id = p.id
                WHERE t.id = task_files.task_id
                  AND (
                    public.is_staff_user(auth.uid())
                    OR
                    public.has_permission(auth.uid(), p.company_id, 'task:manage')
                  )
            )
        )
    );

-- Note: UPDATE policy is omitted for now, as typically file records aren't updated directly.
-- If needed, an UPDATE policy similar to DELETE could be added.
