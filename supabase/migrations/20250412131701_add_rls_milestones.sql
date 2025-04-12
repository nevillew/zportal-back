-- Enable RLS for the milestones table
alter table milestones enable row level security;

-- Allow SELECT access if the user can access the parent project
create policy "Allow SELECT for users who can access the project"
on milestones for select
using (
    can_access_project(auth.uid(), project_id)
);

-- Allow INSERT access if the user has 'milestone:manage' permission for the project's company
create policy "Allow INSERT for users with permission"
on milestones for insert
with check (
    exists (
        select 1
        from projects p
        where p.id = milestones.project_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'milestone:manage'))
        )
    )
);

-- Allow UPDATE access if the user has 'milestone:manage' or 'milestone:approve' permission
-- Separate checks might be needed in application logic for specific field updates (e.g., only approvers can change status to 'Approved')
create policy "Allow UPDATE for users with permission"
on milestones for update
using (
     exists (
        select 1
        from projects p
        where p.id = milestones.project_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and
                (has_permission(auth.uid(), p.company_id, 'milestone:manage') or has_permission(auth.uid(), p.company_id, 'milestone:approve'))
            )
        )
    )
)
with check (
     exists (
        select 1
        from projects p
        where p.id = milestones.project_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and
                (has_permission(auth.uid(), p.company_id, 'milestone:manage') or has_permission(auth.uid(), p.company_id, 'milestone:approve'))
            )
        )
    )
);

-- Allow DELETE access if the user has 'milestone:manage' permission for the project's company
create policy "Allow DELETE for users with permission"
on milestones for delete
using (
     exists (
        select 1
        from projects p
        where p.id = milestones.project_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'milestone:manage'))
        )
    )
);

-- Force RLS for table owners (recommended)
alter table milestones force row level security;
