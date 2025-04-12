-- RLS helper function to check if a user is active
create or replace function is_active_user(user_id uuid)
returns boolean
language sql
security definer
set search_path = public -- Required for security definer functions
as $$
  select exists (
    select 1
    from user_profiles
    where user_profiles.user_id = is_active_user.user_id and user_profiles.is_active = true
  );
$$;

-- RLS helper function to check if a user is staff
create or replace function is_staff_user(user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from user_profiles
    where user_profiles.user_id = is_staff_user.user_id and user_profiles.is_staff = true and user_profiles.is_active = true
  );
$$;

-- RLS helper function to check if a user is a member of a specific company
create or replace function is_member_of_company(user_id uuid, company_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from company_users cu
    join user_profiles up on cu.user_id = up.user_id
    where cu.user_id = is_member_of_company.user_id
      and cu.company_id = is_member_of_company.company_id
      and up.is_active = true
  );
$$;

-- RLS helper function to check if a user has a specific permission within a company context
-- This checks both the role's base permissions and user-specific overrides.
create or replace function has_permission(user_id uuid, company_id uuid, permission_key text)
returns boolean
language plpgsql -- Using plpgsql for more complex logic
security definer
set search_path = public
as $$
declare
  base_perms jsonb;
  custom_perms jsonb;
  effective_perm boolean;
begin
  -- Ensure the user is active first
  if not is_active_user(user_id) then
    return false;
  end if;

  -- Staff users have all permissions implicitly (adjust if needed)
  if is_staff_user(user_id) then
    return true;
  end if;

  -- Get the user's role and custom permissions for the company
  select
    r.base_permissions,
    cu.custom_permissions
  into
    base_perms,
    custom_perms
  from company_users cu
  join roles r on cu.role = r.role_name
  where cu.user_id = has_permission.user_id and cu.company_id = has_permission.company_id;

  -- If no association found, no permission
  if not found then
    return false;
  end if;

  -- Check custom permissions first (override)
  if custom_perms is not null and custom_perms ? permission_key then
    effective_perm := (custom_perms ->> permission_key)::boolean;
    -- Ensure we handle null JSON values correctly, treating them as false
    return coalesce(effective_perm, false);
  end if;

  -- Check base role permissions if no custom override
  if base_perms is not null and base_perms ? permission_key then
    effective_perm := (base_perms ->> permission_key)::boolean;
    -- Ensure we handle null JSON values correctly, treating them as false
    return coalesce(effective_perm, false);
  end if;

  -- Default to false if permission key not found in either
  return false;
end;
$$;

-- Grant execute permission on the helper functions to the authenticated role
grant execute on function is_active_user(uuid) to authenticated;
grant execute on function is_staff_user(uuid) to authenticated;
grant execute on function is_member_of_company(uuid, uuid) to authenticated;
grant execute on function has_permission(uuid, uuid, text) to authenticated;

-- Note: The 'anon' role typically should NOT be granted execute on these functions,
-- unless a specific public-facing feature requires a very carefully scoped check.
