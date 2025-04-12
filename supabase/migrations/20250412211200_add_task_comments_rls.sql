-- supabase/migrations/20250412211200_add_task_comments_rls.sql

-- 1. Enable RLS on the table
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

-- 2. Allow users to view comments on tasks they can access, respecting 'is_internal'
--    Assumes RLS is already correctly set on 'tasks' table.
--    Checks if the user can SELECT the associated task.
--    Additionally checks if the comment is not internal OR if the user is staff.
DROP POLICY IF EXISTS "Users can view comments on accessible tasks" ON public.task_comments;
CREATE POLICY "Users can view comments on accessible tasks"
    ON public.task_comments FOR SELECT
    USING (
        (
            -- Check if the user can view the parent task (relies on task RLS)
            EXISTS (
                SELECT 1 FROM public.tasks WHERE id = task_comments.task_id
                -- RLS on tasks applies implicitly here when SELECT is performed by the user
            )
        ) AND (
            -- Check internal visibility
            task_comments.is_internal = false OR
            (SELECT is_staff FROM public.user_profiles WHERE user_id = auth.uid()) = true
        )
    );

-- 3. Allow users to insert comments on tasks they can access
--    Checks if the user can SELECT the associated task.
--    Ensures the user_id being inserted matches the authenticated user.
DROP POLICY IF EXISTS "Users can insert comments on accessible tasks" ON public.task_comments;
CREATE POLICY "Users can insert comments on accessible tasks"
    ON public.task_comments FOR INSERT
    WITH CHECK (
        (
            -- Check if the user can view the parent task (relies on task RLS)
            EXISTS (
                SELECT 1 FROM public.tasks WHERE id = task_comments.task_id
            )
        ) AND (
            -- Ensure the comment's user_id matches the current user
            task_comments.user_id = auth.uid()
        )
    );

-- 4. Allow users to update their own comments
DROP POLICY IF EXISTS "Users can update their own comments" ON public.task_comments;
CREATE POLICY "Users can update their own comments"
    ON public.task_comments FOR UPDATE
    USING (
        task_comments.user_id = auth.uid()
    )
    WITH CHECK (
        task_comments.user_id = auth.uid()
    );

-- 5. Allow users to delete their own comments
--    (Admins/Staff might need a separate policy later if they should bypass this)
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.task_comments;
CREATE POLICY "Users can delete their own comments"
    ON public.task_comments FOR DELETE
    USING (
        task_comments.user_id = auth.uid()
    );
