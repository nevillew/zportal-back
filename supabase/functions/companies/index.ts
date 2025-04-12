import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

console.log('Companies function started');

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client with auth header
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      },
    );

    // Get user data
    const { data: { user }, error: userError } = await supabaseClient.auth
      .getUser();
    if (userError || !user) {
      console.error('User not authenticated:', userError?.message);
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Handling ${req.method} request for user ${user.id}`);

    // Routing based on HTTP method
    switch (req.method) {
      case 'GET': {
        // Check if requesting a specific company or listing companies
        const url = new URL(req.url);
        // Path: /functions/v1/companies/{companyId} OR /functions/v1/companies/{companyId}/users/{userId}
        const pathParts = url.pathname.split('/').filter((part) => part);
        const companyId = pathParts[3];
        const usersSubPath = pathParts[4]; // Should be 'users' if accessing users
        const userIdParam = pathParts[5]; // Specific user ID for DELETE/PUT on users

        if (companyId && usersSubPath === 'users') {
          // Handle GET /companies/{id}/users endpoint
          if (!userIdParam) { // Only handle listing users here
            console.log(
              `Fetching users for company ${companyId}, requested by user ${user.id}`,
            );
            // Permission check: Staff or Company Admin
            const { data: permissionData, error: permissionError } =
              await supabaseClient.rpc(
                'has_permission',
                {
                  user_id: user.id,
                  company_id: companyId,
                  permission_key: 'admin:manage_company_users',
                },
              );
            if (permissionError) throw permissionError;

            const { data: profile, error: profileError } = await supabaseClient
              .from('user_profiles').select('is_staff').eq('user_id', user.id)
              .single();
            if (profileError) throw profileError;

            if (!profile?.is_staff && !permissionData) {
              console.error(
                `User ${user.id} not authorized to list users for company ${companyId}.`,
              );
              return new Response(
                JSON.stringify({ error: 'Forbidden: Not authorized' }),
                {
                  status: 403,
                  headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                  },
                },
              );
            }

            // Fetch users associated with the company
            const { data: companyUsers, error: usersError } =
              await supabaseClient
                .from('company_users')
                .select(`
                  role,
                  user_profiles ( user_id, full_name, avatar_url, is_active )
                `)
                .eq('company_id', companyId);

            if (usersError) {
              console.error(
                `Error fetching users for company ${companyId}:`,
                usersError.message,
              );
              throw usersError;
            }

            // Format the response
            const usersList = companyUsers?.map((cu) => ({
              ...cu.user_profiles,
              role: cu.role,
            })) || [];

            console.log(
              `Found ${usersList.length} users for company ${companyId}`,
            );
            return new Response(JSON.stringify(usersList), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            });
          } else {
            // Invalid GET path under /users (e.g., /companies/{id}/users/{userId})
            console.log(
              `Invalid GET request for /companies/${companyId}/users path: ${url.pathname}`,
            );
            return new Response(JSON.stringify({ error: 'Not Found' }), {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } else if (companyId && !usersSubPath) {
          // Handle GET /companies/{id} (Get specific company details)
          console.log(
            `Fetching details for company ${companyId} for user ${user.id}`,
          );

          // Fetch the company and check if the user is a member or staff
          const { data: companyData, error: companyError } =
            await supabaseClient
              .from('companies')
              .select(`
              *,
              company_users!inner ( user_id )
            `)
              .eq('id', companyId)
              .eq('company_users.user_id', user.id)
              .maybeSingle(); // Use maybeSingle to return null if no match (incl. RLS failure)

          if (companyError) {
            console.error(
              `Error fetching company ${companyId}:`,
              companyError.message,
            );
            throw companyError;
          }

          if (!companyData) {
            // Could be not found OR RLS prevented access
            // Check if the company exists at all (for staff override potentially, or better error message)
            const { data: existsCheck, error: existsError } =
              await supabaseClient
                .from('companies')
                .select('id')
                .eq('id', companyId)
                .maybeSingle();

            if (existsError) {
              console.error(
                `Error checking company existence ${companyId}:`,
                existsError.message,
              );
              // Fall through to generic 404 for security
            }

            console.log(
              `Company ${companyId} not found or access denied for user ${user.id}`,
            );
            return new Response(
              JSON.stringify({ error: `Company not found or access denied` }),
              {
                status: 404, // Not Found or Forbidden - use 404 for security
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }

          // Remove the join table data before returning
          const { company_users, ...companyDetails } = companyData;

          // Fetch associated custom fields for this company
          const { data: customFields, error: cfError } = await supabaseClient
            .from('custom_field_values')
            .select(`
              value,
              custom_field_definitions ( name, label, field_type, options )
            `)
            .eq('entity_id', companyId); // Use companyId as entity_id

          if (cfError) {
            console.error(
              `Error fetching custom fields for company ${companyId}:`,
              cfError,
            );
          }

          // Format custom fields
          const formattedCustomFields: { [key: string]: any } = {};
          if (customFields !== null) {
            customFields?.forEach((cf) => {
              const definition = cf.custom_field_definitions?.[0];
              if (definition) {
                formattedCustomFields[definition.name] = {
                  label: definition.label,
                  value: cf.value,
                  type: definition.field_type,
                  options: definition.options,
                };
              }
            });
          }
          companyDetails.custom_fields = formattedCustomFields; // Add to response

          console.log(
            `Successfully fetched company ${companyId} with custom fields for user ${user.id}`,
          );
          return new Response(JSON.stringify(companyDetails), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } else {
          // Implement GET /companies (List companies for the user)
          console.log(`Fetching companies for user ${user.id}`);
          const { data: companies, error: companiesError } =
            await supabaseClient
              .from('companies')
              .select(`
              id,
              name,
              logo_url,
              company_users!inner ( user_id, role )
            `)
              .eq('company_users.user_id', user.id);

          if (companiesError) {
            console.error('Error fetching companies:', companiesError.message);
            throw companiesError;
          }

          console.log(
            `Found ${companies?.length || 0} companies for user ${user.id}`,
          );
          // We only need company data, not the join table info in the response
          const userCompanies =
            companies?.map(({ company_users, ...companyData }) =>
              companyData
            ) || [];

          return new Response(JSON.stringify(userCompanies), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }
      }
      case 'POST': {
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/').filter((part) => part);
        const companyId = pathParts[3];
        const usersSubPath = pathParts[4];
        const userIdParam = pathParts[5];

        if (companyId && usersSubPath === 'users' && !userIdParam) {
          // Implement POST /companies/{id}/users (Invite user) - MOVED HERE
          console.log(
            `Attempting to invite user to company ${companyId}, requested by user ${user.id}`,
          );

          // Permission check: Staff or Company Admin
          const { data: permissionData, error: permissionError } =
            await supabaseClient.rpc(
              'has_permission',
              {
                user_id: user.id,
                company_id: companyId,
                permission_key: 'admin:manage_company_users',
              },
            );
          if (permissionError) {
            console.error(`Error checking permissions for user ${user.id}:`, permissionError.message);
            throw permissionError;
          }

          if (!permissionData) { // has_permission already returns true for staff
            console.error(
              `User ${user.id} not authorized to invite users to company ${companyId}.`,
            );
            return new Response(
              JSON.stringify({ error: 'Forbidden: Not authorized' }),
              {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }

          // Parse request body for email and role
          let inviteData;
          try {
            inviteData = await req.json();
            if (!inviteData.email || !inviteData.role) {
              throw new Error('Email and role are required for invitation');
            }
            // TODO(validation): Validate email format
            // TODO(validation): Validate role exists in roles table
          } catch (e) {
            const errorMessage = e instanceof Error
              ? e.message
              : 'Unknown error';
            console.error('Error parsing invite request body:', errorMessage);
            return new Response(
              JSON.stringify({ error: `Bad Request: ${errorMessage}` }),
              {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }

          // Generate invitation token and expiry
          const token = crypto.randomUUID(); // Use crypto for better randomness
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days expiry

          // Create invitation record
          const { data: invitation, error: inviteError } = await supabaseClient
            .from('invitations')
            .insert({
              email: inviteData.email,
              company_id: companyId,
              role: inviteData.role,
              invited_by_user_id: user.id,
              token: token,
              expires_at: expiresAt.toISOString(),
            })
            .select()
            .single();

          if (inviteError) {
            console.error(
              `Error creating invitation for ${inviteData.email} to company ${companyId}:`,
              inviteError.message,
            );
            // TODO(db-error): Handle potential unique constraint violations (e.g., email already invited) with 409 Conflict.
            if (inviteError.code === '23505') { // Unique violation
              return new Response(
                JSON.stringify({ error: 'User already invited or member' }),
                {
                  status: 409, // Conflict
                  headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                  },
                },
              );
            }
            throw inviteError;
          }

          // TODO(email): Send invitation email with the token/link (using Resend or similar).
          console.log(
            `Successfully created invitation ${invitation.id} for ${inviteData.email} to company ${companyId}`,
          );

          // Return minimal confirmation, not the full invitation details including token
          return new Response(
            JSON.stringify({ message: 'Invitation sent successfully' }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 201, // Created
            },
          );
        } else if (!companyId) {
          // Implement POST /companies (Create company - Staff only)
          console.log(`Attempting to create a new company by user ${user.id}`);

          // Check if user has permission to create companies (staff only)
          const { data: hasPermission, error: permissionError } = await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: '00000000-0000-0000-0000-000000000000', // System-wide permission check
              permission_key: 'admin:create_company',
            },
          );
          
          if (permissionError) {
            console.error(
              `Error checking permissions for user ${user.id}:`,
              permissionError.message,
            );
            throw permissionError;
          }

          if (!hasPermission) {
            console.error(
              `User ${user.id} is not authorized to create companies.`,
            );
            return new Response(
              JSON.stringify({
                error: 'Forbidden: Only staff can create companies',
              }),
              {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }

          // Parse request body
          let newCompanyData;
          try {
            newCompanyData = await req.json();
            if (!newCompanyData.name) {
              throw new Error('Company name is required');
            }
          } catch (e) {
            const errorMessage = e instanceof Error
              ? e.message
              : 'Unknown error';
            console.error('Error parsing request body:', errorMessage);
            return new Response(
              JSON.stringify({ error: `Bad Request: ${errorMessage}` }),
              {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }

          // Insert new company
          const { data: createdCompany, error: insertError } =
            await supabaseClient
              .from('companies')
              .insert({
                name: newCompanyData.name,
                logo_url: newCompanyData.logo_url, // Optional fields
                primary_color: newCompanyData.primary_color,
                secondary_color: newCompanyData.secondary_color,
                client_portal_logo_url: newCompanyData.client_portal_logo_url,
                project_retention_days: newCompanyData.project_retention_days,
                log_retention_days: newCompanyData.log_retention_days,
              })
              .select()
              .single();

          if (insertError) {
            console.error('Error creating company:', insertError.message);
            
            // Handle specific database errors
            if (insertError.code === '23505') { // PostgreSQL unique violation code
              const constraintMatch = insertError.message.match(/violates unique constraint "(.+?)"/);
              const constraint = constraintMatch ? constraintMatch[1] : 'unknown';
              
              if (constraint.includes('name')) {
                return new Response(
                  JSON.stringify({ error: 'A company with this name already exists' }),
                  {
                    status: 409, // Conflict
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                  },
                );
              }
            }
            
            throw insertError;
          }

          // Handle custom fields provided in the request
          if (
            newCompanyData.custom_fields &&
            typeof newCompanyData.custom_fields === 'object'
          ) {
            // Fetch relevant definitions for 'company' entity type
            const { data: definitions, error: defError } = await supabaseClient
              .from('custom_field_definitions')
              .select('id, name')
              .eq('entity_type', 'company');

            if (defError) {
              console.error(
                'Error fetching custom field definitions for company:',
                defError.message,
              );
            } else if (definitions) {
              const valuesToUpsert: any[] = [];
              const definitionMap = new Map(
                definitions.map((d) => [d.name, d.id]),
              );

              for (const fieldName in newCompanyData.custom_fields) {
                if (definitionMap.has(fieldName)) {
                  valuesToUpsert.push({
                    definition_id: definitionMap.get(fieldName),
                    entity_id: createdCompany.id, // Use the ID of the created company
                    value: newCompanyData.custom_fields[fieldName],
                  });
                } else {
                  console.warn(
                    `Custom field definition not found for company field: ${fieldName}`,
                  );
                }
              }

              if (valuesToUpsert.length > 0) {
                const { error: upsertError } = await supabaseClient
                  .from('custom_field_values')
                  .upsert(valuesToUpsert, {
                    onConflict: 'definition_id, entity_id',
                  });

                if (upsertError) {
                  console.error(
                    'Error upserting custom field values for company:',
                    upsertError.message,
                  );
                }
              }
            }
          }

          console.log(
            `Successfully created company ${createdCompany.id} by user ${user.id}`,
          );
          return new Response(JSON.stringify(createdCompany), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 201, // Created
          });
        } else {
          // Invalid POST path
          console.log(`Invalid POST request for path: ${url.pathname}`);
          return new Response(JSON.stringify({ error: 'Not Found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } // End POST case
      case 'PUT': {
        // Implement PUT /companies/{id} (Update company - Staff/Admin)
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/').filter((part) => part);
        const companyId = pathParts[3];
        const usersSubPath = pathParts[4]; // Check if trying to PUT /users

        if (companyId && !usersSubPath) {
          // This is the correct path for updating a company
          console.log(
            `Attempting to update company ${companyId} by user ${user.id}`,
          );

          // Check if user is staff or company admin (using RLS helper function)
          const { data: permissionData, error: permissionError } =
            await supabaseClient.rpc(
              'has_permission',
              {
                user_id: user.id,
                company_id: companyId,
                permission_key: 'admin:manage_company',
              },
            );

          if (permissionError) {
            console.error(
              `Error checking permissions for user ${user.id} on company ${companyId}:`,
              permissionError.message,
            );
            throw permissionError; // Let RLS handle final enforcement, but log the check error
          }

          // Also check if staff
          const { data: profile, error: profileError } = await supabaseClient
            .from('user_profiles')
            .select('is_staff')
            .eq('user_id', user.id)
            .single();

          if (profileError) {
            console.error(
              `Error fetching profile for user ${user.id}:`,
              profileError.message,
            );
            throw profileError;
          }

          if (!profile?.is_staff && !permissionData) {
            console.error(
              `User ${user.id} is not authorized to update company ${companyId}.`,
            );
            return new Response(
              JSON.stringify({
                error: 'Forbidden: Not authorized to update this company',
              }),
              {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }

          // Parse request body
          let updateData;
          try {
            updateData = await req.json();
            // Basic validation: ensure at least one field is being updated
            if (Object.keys(updateData).length === 0) {
              throw new Error('No update data provided');
            }
          } catch (e) {
            const errorMessage = e instanceof Error
              ? e.message
              : 'Unknown error';
            console.error('Error parsing request body:', errorMessage);
            return new Response(
              JSON.stringify({ error: `Bad Request: ${errorMessage}` }),
              {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }

          // Prepare allowed update fields (prevent updating ID, created_at etc.)
          const allowedUpdates = {
            name: updateData.name,
            logo_url: updateData.logo_url,
            primary_color: updateData.primary_color,
            secondary_color: updateData.secondary_color,
            client_portal_logo_url: updateData.client_portal_logo_url,
            project_retention_days: updateData.project_retention_days,
            log_retention_days: updateData.log_retention_days,
          };
          // Remove undefined fields so they don't overwrite existing values with null
          Object.keys(allowedUpdates).forEach((key) => {
            const typedKey = key as keyof typeof allowedUpdates;
            if (allowedUpdates[typedKey] === undefined) {
              delete allowedUpdates[typedKey];
            }
          });

          // Update the company
          const { data: updatedCompany, error: updateError } =
            await supabaseClient
              .from('companies')
              .update(allowedUpdates)
              .eq('id', companyId)
              .select()
              .single(); // RLS policy should prevent unauthorized updates

          if (updateError) {
            console.error(
              `Error updating company ${companyId}:`,
              updateError.message,
            );
            
            // Handle company not found (PostgREST returns error)
            if (updateError.code === 'PGRST204') { // PostgREST code for no rows updated/selected
              return new Response(
                JSON.stringify({ error: 'Company not found or update failed' }),
                {
                  status: 404,
                  headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                  },
                },
              );
            }
            
            // Handle specific database errors
            if (updateError.code === '23505') { // PostgreSQL unique violation code
              const constraintMatch = updateError.message.match(/violates unique constraint "(.+?)"/);
              const constraint = constraintMatch ? constraintMatch[1] : 'unknown';
              
              if (constraint.includes('name')) {
                return new Response(
                  JSON.stringify({ error: 'A company with this name already exists' }),
                  {
                    status: 409, // Conflict
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                  },
                );
              }
            }
            
            throw updateError;
          }

          // Handle custom fields provided in the request
          if (
            updateData.custom_fields &&
            typeof updateData.custom_fields === 'object'
          ) {
            // Fetch relevant definitions for 'company' entity type
            const { data: definitions, error: defError } = await supabaseClient
              .from('custom_field_definitions')
              .select('id, name')
              .eq('entity_type', 'company');

            if (defError) {
              console.error(
                'Error fetching custom field definitions during company update:',
                defError.message,
              );
            } else if (definitions) {
              const valuesToUpsert: any[] = [];
              const definitionMap = new Map(
                definitions.map((d) => [d.name, d.id]),
              );

              for (const fieldName in updateData.custom_fields) {
                if (definitionMap.has(fieldName)) {
                  valuesToUpsert.push({
                    definition_id: definitionMap.get(fieldName),
                    entity_id: updatedCompany.id, // Use the ID of the updated company
                    value: updateData.custom_fields[fieldName],
                  });
                } else {
                  console.warn(
                    `Custom field definition not found for company field during update: ${fieldName}`,
                  );
                }
              }

              if (valuesToUpsert.length > 0) {
                const { error: upsertError } = await supabaseClient
                  .from('custom_field_values')
                  .upsert(valuesToUpsert, {
                    onConflict: 'definition_id, entity_id',
                  });

                if (upsertError) {
                  console.error(
                    'Error upserting custom field values during company update:',
                    upsertError.message,
                  );
                }
              }
            }
          }

          console.log(
            `Successfully updated company ${companyId} by user ${user.id}`,
          );
          return new Response(JSON.stringify(updatedCompany), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } else {
          // Invalid PUT path (e.g., /companies or /companies/{id}/users)
          console.log(`Invalid PUT request for path: ${url.pathname}`);
          return new Response(
            JSON.stringify({ error: 'Method Not Allowed or Not Found' }),
            {
              status: 405,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
      } // End PUT case
      case 'DELETE': {
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/').filter((part) => part);
        const companyId = pathParts[3];
        const usersSubPath = pathParts[4];
        const userIdParam = pathParts[5];

        if (companyId && usersSubPath === 'users' && userIdParam) {
          // Implement DELETE /companies/{id}/users/{userId} (Remove user from company) - MOVED HERE
          const userToRemoveId = userIdParam;
          console.log(
            `Attempting to remove user ${userToRemoveId} from company ${companyId}, requested by user ${user.id}`,
          );

          // Permission check: Staff or Company Admin
          const { data: permissionData, error: permissionError } =
            await supabaseClient.rpc(
              'has_permission',
              {
                user_id: user.id,
                company_id: companyId,
                permission_key: 'admin:manage_company_users',
              },
            );
          if (permissionError) throw permissionError;
          const { data: profile, error: profileError } = await supabaseClient
            .from('user_profiles').select('is_staff').eq('user_id', user.id)
            .single();
          if (profileError) throw profileError;

          if (!profile?.is_staff && !permissionData) {
            console.error(
              `User ${user.id} not authorized to remove users from company ${companyId}.`,
            );
            return new Response(
              JSON.stringify({ error: 'Forbidden: Not authorized' }),
              {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }

          // TODO(permissions): Consider business logic for preventing self-removal or removal of the last admin.
          // For now, allow removal if authorized. RLS policy might have further checks.

          // Delete the company_users record
          const { error: deleteError } = await supabaseClient
            .from('company_users')
            .delete()
            .eq('company_id', companyId)
            .eq('user_id', userToRemoveId);

          if (deleteError) {
            console.error(
              `Error removing user ${userToRemoveId} from company ${companyId}:`,
              deleteError.message,
            );
            // TODO(db-error): Handle cases where the user might not be in the company (e.g., return 404).
            throw deleteError;
          }

          // Check if deletion happened (optional, count might be needed)
          // Assuming success if no error due to permission checks

          console.log(
            `Successfully removed user ${userToRemoveId} from company ${companyId}`,
          );
          return new Response(null, { // No content response
            headers: { ...corsHeaders },
            status: 204, // No Content
          });
        } else if (companyId && !usersSubPath) {
          // Implement DELETE /companies/{id} (Delete company - Staff only)
          console.log(
            `Attempting to delete company ${companyId} by user ${user.id}`,
          );

          // Check if user has permission to delete companies (staff only)
          const { data: hasPermission, error: permissionError } = await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: companyId,
              permission_key: 'admin:delete_company',
            },
          );
          
          if (permissionError) {
            console.error(
              `Error checking permissions for user ${user.id}:`,
              permissionError.message,
            );
            throw permissionError;
          }

          if (!hasPermission) {
            console.error(
              `User ${user.id} is not authorized to delete companies.`,
            );
            return new Response(
              JSON.stringify({
                error: 'Forbidden: Only staff can delete companies',
              }),
              {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }

          // Delete the company
          const { error: deleteError } = await supabaseClient
            .from('companies')
            .delete()
            .eq('id', companyId);

          if (deleteError) {
            console.error(
              `Error deleting company ${companyId}:`,
              deleteError.message,
            );
            
            // Handle specific database errors
            if (deleteError.code === '23503') { // PostgreSQL foreign key violation code
              return new Response(
                JSON.stringify({ 
                  error: 'Cannot delete this company because it has related records. Remove all projects and users first.' 
                }),
                {
                  status: 409, // Conflict
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                },
              );
            }
            
            // Handle company not found
            if (deleteError.code === 'PGRST204') { // PostgREST code for no rows deleted
              return new Response(
                JSON.stringify({ error: 'Company not found or already deleted' }),
                {
                  status: 404, 
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                },
              );
            }
            
            throw deleteError;
          }

          console.log(
            `Successfully deleted company ${companyId} by user ${user.id}`,
          );
          return new Response(null, { // No content response
            headers: { ...corsHeaders },
            status: 204, // No Content
          });
        } else {
          // Invalid DELETE path
          console.log(`Invalid DELETE request for path: ${url.pathname}`);
          return new Response(
            JSON.stringify({ error: 'Method Not Allowed or Not Found' }),
            {
              status: 405,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
      } // End DELETE case
      default:
        console.warn(`Method ${req.method} not allowed for path ${req.url}`);
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : 'Unknown internal server error';
    console.error('Internal Server Error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
