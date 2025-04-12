-- Enable RLS for the user_profiles table
alter table user_profiles enable row level security;

-- Allow users to SELECT their own profile
create policy "Allow SELECT own profile"
on user_profiles for select
using (
    user_id = auth.uid()
);

-- Allow staff users to SELECT any active profile (for user management, assignments, etc.)
create policy "Allow SELECT for staff users"
on user_profiles for select
using (
    is_staff_user(auth.uid()) and is_active = true -- Staff can see active users
);

-- Allow users to UPDATE their own profile (excluding sensitive fields like is_staff, is_active)
create policy "Allow UPDATE own profile"
on user_profiles for update
using (
    user_id = auth.uid()
)
with check (
    user_id = auth.uid()
    -- Add checks here if certain fields should not be updatable by the user themselves
    -- e.g., and is_staff = (select is_staff from user_profiles where user_id = auth.uid()) -- Prevent self-promotion
);

-- Allow staff users to UPDATE profiles (e.g., deactivate users, potentially change staff status)
-- Requires specific permissions check for safety.
create policy "Allow UPDATE for staff users with permission"
on user_profiles for update
using (
    is_staff_user(auth.uid()) and has_permission(auth.uid(), null::uuid, 'admin:manage_users') -- Using null company_id for global permission check
)
with check (
    is_staff_user(auth.uid()) and has_permission(auth.uid(), null::uuid, 'admin:manage_users')
);

-- Disallow DELETE operations generally (use is_active flag for deactivation)
-- If deletion is ever needed, it should be highly restricted, possibly only via SECURITY DEFINER function.
create policy "Disallow DELETE"
on user_profiles for delete
using (false);


-- Force RLS for table owners (recommended)
alter table user_profiles force row level security;

-- Note: The has_permission function currently assumes staff have all permissions.
-- The 'admin:manage_users' check in the staff UPDATE policy might need adjustment
-- if a more granular global permission system is implemented later, or if the
-- has_permission function is modified to handle null company_id for global checks.
-- For now, this restricts profile updates by staff to those who are staff AND have the permission.
