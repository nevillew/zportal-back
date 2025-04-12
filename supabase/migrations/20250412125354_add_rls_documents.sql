-- Enable RLS for the documents table
alter table documents enable row level security;

-- Allow SELECT access based on document scope and user permissions
create policy "Allow SELECT based on scope"
on documents for select
using (
    -- Global documents are visible to all authenticated users
    (company_id is null and project_id is null and auth.role() = 'authenticated')
    -- Company-scoped documents are visible to staff or members of that company
    or (company_id is not null and project_id is null and (is_staff_user(auth.uid()) or is_member_of_company(auth.uid(), company_id)))
    -- Project-scoped documents are visible to users who can access the project
    or (project_id is not null and can_access_project(auth.uid(), project_id))
);

-- Allow INSERT access based on scope and 'document:create' permission
create policy "Allow INSERT based on scope and permission"
on documents for insert
with check (
    -- Staff can create any scope
    is_staff_user(auth.uid())
    -- Or, members can create company-scoped docs if they have permission in that company
    or (company_id is not null and project_id is null and is_member_of_company(auth.uid(), company_id) and has_permission(auth.uid(), company_id, 'document:create'))
    -- Or, members can create project-scoped docs if they have permission in the project's company
    or (project_id is not null and exists (
            select 1 from projects p where p.id = documents.project_id and is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'document:create')
        ))
    -- Note: Creating global docs (both null) might be restricted to staff only implicitly by the above, or explicitly added if needed.
);

-- Allow UPDATE access based on scope and 'document:edit' permission
create policy "Allow UPDATE based on scope and permission"
on documents for update
using (
    -- Staff can update any scope
    is_staff_user(auth.uid())
    -- Or, members can update company-scoped docs if they have permission in that company
    or (company_id is not null and project_id is null and is_member_of_company(auth.uid(), company_id) and has_permission(auth.uid(), company_id, 'document:edit'))
    -- Or, members can update project-scoped docs if they have permission in the project's company
    or (project_id is not null and exists (
            select 1 from projects p where p.id = documents.project_id and is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'document:edit')
        ))
    -- Or, members can update global docs if they have a global 'document:edit' permission (requires a global permission check function if needed)
    -- For now, assuming only staff can edit global docs.
)
with check (
    -- Re-check the same conditions for the updated row
    is_staff_user(auth.uid())
    or (company_id is not null and project_id is null and is_member_of_company(auth.uid(), company_id) and has_permission(auth.uid(), company_id, 'document:edit'))
    or (project_id is not null and exists (
            select 1 from projects p where p.id = documents.project_id and is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'document:edit')
        ))
);

-- Allow DELETE access based on scope and 'document:delete' permission
create policy "Allow DELETE based on scope and permission"
on documents for delete
using (
    -- Staff can delete any scope
    is_staff_user(auth.uid())
    -- Or, members can delete company-scoped docs if they have permission in that company
    or (company_id is not null and project_id is null and is_member_of_company(auth.uid(), company_id) and has_permission(auth.uid(), company_id, 'document:delete'))
    -- Or, members can delete project-scoped docs if they have permission in the project's company
    or (project_id is not null and exists (
            select 1 from projects p where p.id = documents.project_id and is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'document:delete')
        ))
    -- Assuming only staff can delete global docs.
);

-- Force RLS for table owners (recommended)
alter table documents force row level security;
