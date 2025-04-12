-- Add company_id column to documents table if it doesn't exist
alter table documents
add column if not exists company_id uuid references companies(id) on delete cascade;

-- Add project_id column to documents table if it doesn't exist
alter table documents
add column if not exists project_id uuid references projects(id) on delete cascade;

-- Add indexes for the new foreign key columns if they don't exist
create index if not exists idx_documents_company_id on documents(company_id);
create index if not exists idx_documents_project_id on documents(project_id);

-- Add the CHECK constraint for valid scoping if it doesn't exist
-- Ensures that a document is either global (both null), company-scoped (company_id set, project_id null),
-- or project-scoped (project_id set).
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'documents_scope_check' and conrelid = 'documents'::regclass
    ) then
        alter table documents
        add constraint documents_scope_check check (
            (company_id is null and project_id is null) or -- Global scope
            (company_id is not null and project_id is null) or -- Company scope
            (project_id is not null) -- Project scope (company_id might be null or derived)
        );
    end if;
end;
$$;
