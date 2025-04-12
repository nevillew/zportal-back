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
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Get user data
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
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
        const pathParts = url.pathname.split('/').filter(part => part); 
        const companyId = pathParts[3]; 
        const usersSubPath = pathParts[4]; // Should be 'users' if accessing users
        const userIdParam = pathParts[5]; // Specific user ID for DELETE

        if (companyId && usersSubPath === 'users') {
            // Handle /companies/{id}/users endpoints
            if (req.method === 'GET' && !userIdParam) {
              // Implement GET /companies/{id}/users (List users in company)
              console.log(`Fetching users for company ${companyId}, requested by user ${user.id}`);

              // Permission check: Staff or Company Admin
              const { data: permissionData, error: permissionError } = await supabaseClient.rpc(
                 'has_permission',
                 { user_id: user.id, company_id: companyId, permission_key: 'admin:manage_company_users' }
               );
              if (permissionError) throw permissionError;

              const { data: profile, error: profileError } = await supabaseClient
                 .from('user_profiles').select('is_staff').eq('user_id', user.id).single();
              if (profileError) throw profileError;

              if (!profile?.is_staff && !permissionData) {
                console.error(`User ${user.id} not authorized to list users for company ${companyId}.`);
                return new Response(JSON.stringify({ error: 'Forbidden: Not authorized' }), {
                  status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
              }

              // Fetch users associated with the company
              const { data: companyUsers, error: usersError } = await supabaseClient
                .from('company_users')
                .select(`
                  role,
                  user_profiles ( user_id, full_name, avatar_url, is_active )
                `)
                .eq('company_id', companyId);

              if (usersError) {
                console.error(`Error fetching users for company ${companyId}:`, usersError.message);
                throw usersError;
              }

              // Format the response
              const usersList = companyUsers?.map(cu => ({
                  ...cu.user_profiles,
                  role: cu.role,
              })) || [];

              console.log(`Found ${usersList.length} users for company ${companyId}`);
              return new Response(JSON.stringify(usersList), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
              });
            
            // TODO (TS2367): This block is inside 'case GET' but checks for 'POST'. Logic should be restructured.
            } else if (req.method === 'POST' && !userIdParam) {
              // Implement POST /companies/{id}/users (Invite user)
              console.log(`Attempting to invite user to company ${companyId}, requested by user ${user.id}`);

              // Permission check: Staff or Company Admin
              const { data: permissionData, error: permissionError } = await supabaseClient.rpc(
                 'has_permission',
                 { user_id: user.id, company_id: companyId, permission_key: 'admin:manage_company_users' }
               );
              if (permissionError) throw permissionError;
              const { data: profile, error: profileError } = await supabaseClient
                 .from('user_profiles').select('is_staff').eq('user_id', user.id).single();
              if (profileError) throw profileError;

              if (!profile?.is_staff && !permissionData) {
                console.error(`User ${user.id} not authorized to invite users to company ${companyId}.`);
                return new Response(JSON.stringify({ error: 'Forbidden: Not authorized' }), {
                  status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
              }

              // Parse request body for email and role
              let inviteData;
              try {
                inviteData = await req.json();
                if (!inviteData.email || !inviteData.role) {
                  throw new Error('Email and role are required for invitation');
                }
                // TODO: Validate email format
                // TODO: Validate role exists in roles table
              } catch (e) {
                const errorMessage = e instanceof Error ? e.message : 'Unknown error';
                console.error('Error parsing invite request body:', errorMessage);
                return new Response(JSON.stringify({ error: `Bad Request: ${errorMessage}` }), {
                  status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
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
                 console.error(`Error creating invitation for ${inviteData.email} to company ${companyId}:`, inviteError.message);
                 // Handle potential unique constraint violations (e.g., email already invited)
                 if (inviteError.code === '23505') { // Unique violation
                    return new Response(JSON.stringify({ error: 'User already invited or member' }), {
                      status: 409, // Conflict
                      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                 }
                 throw inviteError;
              }

              // TODO: Send invitation email with the token/link
              console.log(`Successfully created invitation ${invitation.id} for ${inviteData.email} to company ${companyId}`);

              // Return minimal confirmation, not the full invitation details including token
              return new Response(JSON.stringify({ message: 'Invitation sent successfully' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 201, // Created
              });

            // TODO (TS2367): This block is inside 'case GET' but checks for 'DELETE'. Logic should be restructured.
            } else if (req.method === 'DELETE' && userIdParam) {
              // Implement DELETE /companies/{id}/users/{userId} (Remove user from company)
              const userToRemoveId = userIdParam;
              console.log(`Attempting to remove user ${userToRemoveId} from company ${companyId}, requested by user ${user.id}`);

              // Permission check: Staff or Company Admin
              const { data: permissionData, error: permissionError } = await supabaseClient.rpc(
                 'has_permission',
                 { user_id: user.id, company_id: companyId, permission_key: 'admin:manage_company_users' }
               );
              if (permissionError) throw permissionError;
              const { data: profile, error: profileError } = await supabaseClient
                 .from('user_profiles').select('is_staff').eq('user_id', user.id).single();
              if (profileError) throw profileError;

              if (!profile?.is_staff && !permissionData) {
                console.error(`User ${user.id} not authorized to remove users from company ${companyId}.`);
                return new Response(JSON.stringify({ error: 'Forbidden: Not authorized' }), {
                  status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
              }
              
              // Prevent removing self if not staff? Or prevent removing last admin? - Consider business logic
              // For now, allow removal if authorized. RLS policy might have further checks.

              // Delete the company_users record
              const { error: deleteError } = await supabaseClient
                .from('company_users')
                .delete()
                .eq('company_id', companyId)
                .eq('user_id', userToRemoveId);

              if (deleteError) {
                 console.error(`Error removing user ${userToRemoveId} from company ${companyId}:`, deleteError.message);
                 // Handle cases where the user might not be in the company
                 throw deleteError;
              }
              
              // Check if deletion happened (optional, count might be needed)
              // Assuming success if no error due to permission checks

              console.log(`Successfully removed user ${userToRemoveId} from company ${companyId}`);
              return new Response(null, { // No content response
                headers: { ...corsHeaders }, status: 204, // No Content
              });

            } else {
               // Catch other methods or invalid paths under /users
               console.log(`Invalid request for /companies/${companyId}/users: ${req.method} ${userIdParam || ''}`);
               return new Response(JSON.stringify({ error: 'Method Not Allowed or Invalid Path' }), {
                 status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
               });
            }

        } else if (companyId) {
          // Handle GET /companies/{id} (Get specific company details)
          console.log(`Fetching details for company ${companyId} for user ${user.id}`);

          // Fetch the company and check if the user is a member or staff
          const { data: companyData, error: companyError } = await supabaseClient
            .from('companies')
            .select(`
              *,
              company_users!inner ( user_id )
            `)
            .eq('id', companyId)
            .eq('company_users.user_id', user.id)
            .maybeSingle(); // Use maybeSingle to return null if no match (incl. RLS failure)

          if (companyError) {
            console.error(`Error fetching company ${companyId}:`, companyError.message);
            throw companyError;
          }

          if (!companyData) {
            // Could be not found OR RLS prevented access
            // Check if the company exists at all (for staff override potentially, or better error message)
             const { data: existsCheck, error: existsError } = await supabaseClient
               .from('companies')
               .select('id')
               .eq('id', companyId)
               .maybeSingle();

             if (existsError) {
               console.error(`Error checking company existence ${companyId}:`, existsError.message);
               // Fall through to generic 404 for security
             }

            console.log(`Company ${companyId} not found or access denied for user ${user.id}`);
            return new Response(JSON.stringify({ error: `Company not found or access denied` }), {
              status: 404, // Not Found or Forbidden - use 404 for security
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // Remove the join table data before returning
          const { company_users, ...companyDetails } = companyData;

          console.log(`Successfully fetched company ${companyId} for user ${user.id}`);
          return new Response(JSON.stringify(companyDetails), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });

        } else {
          // Implement GET /companies (List companies for the user)
          console.log(`Fetching companies for user ${user.id}`);
          const { data: companies, error: companiesError } = await supabaseClient
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

          console.log(`Found ${companies?.length || 0} companies for user ${user.id}`);
          // We only need company data, not the join table info in the response
          const userCompanies = companies?.map(({ company_users, ...companyData }) => companyData) || [];

          return new Response(JSON.stringify(userCompanies), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }
      }
      case 'POST': {
        // Implement POST /companies (Create company - Staff only)
        console.log(`Attempting to create a new company by user ${user.id}`);

        // Check if user is staff
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles')
          .select('is_staff')
          .eq('user_id', user.id)
          .single();

        if (profileError || !profile?.is_staff) {
          console.error(`User ${user.id} is not authorized to create companies.`);
          return new Response(JSON.stringify({ error: 'Forbidden: Only staff can create companies' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Parse request body
        let newCompanyData;
        try {
          newCompanyData = await req.json();
          if (!newCompanyData.name) {
            throw new Error('Company name is required');
          }
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Unknown error';
          console.error('Error parsing request body:', errorMessage);
          return new Response(JSON.stringify({ error: `Bad Request: ${errorMessage}` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Insert new company
        const { data: createdCompany, error: insertError } = await supabaseClient
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
          // Check for specific errors like unique constraints if needed
          throw insertError;
        }

        console.log(`Successfully created company ${createdCompany.id} by user ${user.id}`);
        return new Response(JSON.stringify(createdCompany), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 201, // Created
        });
      }
      case 'PUT': {
        // Implement PUT /companies/{id} (Update company - Staff/Admin)
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/').filter(part => part);
        const companyId = pathParts[3];

        if (!companyId) {
           return new Response(JSON.stringify({ error: 'Bad Request: Company ID missing in URL' }), {
             status: 400,
             headers: { ...corsHeaders, 'Content-Type': 'application/json' },
           });
        }
        console.log(`Attempting to update company ${companyId} by user ${user.id}`);

        // Check if user is staff or company admin (using RLS helper function)
        // Note: RLS will ultimately enforce this, but checking here provides a clearer error.
        const { data: permissionData, error: permissionError } = await supabaseClient.rpc(
           'has_permission',
           { user_id: user.id, company_id: companyId, permission_key: 'admin:manage_company' }
         );

        if (permissionError) {
           console.error(`Error checking permissions for user ${user.id} on company ${companyId}:`, permissionError.message);
           throw permissionError; // Let RLS handle final enforcement, but log the check error
        }
        
        // Also check if staff
         const { data: profile, error: profileError } = await supabaseClient
           .from('user_profiles')
           .select('is_staff')
           .eq('user_id', user.id)
           .single();

         if (profileError) {
            console.error(`Error fetching profile for user ${user.id}:`, profileError.message);
            throw profileError;
         }

        if (!profile?.is_staff && !permissionData) {
          console.error(`User ${user.id} is not authorized to update company ${companyId}.`);
          return new Response(JSON.stringify({ error: 'Forbidden: Not authorized to update this company' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
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
          const errorMessage = e instanceof Error ? e.message : 'Unknown error';
          console.error('Error parsing request body:', errorMessage);
          return new Response(JSON.stringify({ error: `Bad Request: ${errorMessage}` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
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
        // Using type assertion to handle TS7053
        Object.keys(allowedUpdates).forEach(key => {
            if (allowedUpdates[key as keyof typeof allowedUpdates] === undefined) {
                delete allowedUpdates[key as keyof typeof allowedUpdates];
            }
        });


        // Update the company
        const { data: updatedCompany, error: updateError } = await supabaseClient
          .from('companies')
          .update(allowedUpdates)
          .eq('id', companyId)
          .select()
          .single(); // RLS policy should prevent unauthorized updates

        if (updateError) {
          console.error(`Error updating company ${companyId}:`, updateError.message);
          // Handle potential errors like company not found (PostgREST returns error)
          if (updateError.code === 'PGRST204') { // PostgREST code for no rows updated/selected
             return new Response(JSON.stringify({ error: 'Company not found or update failed' }), {
               status: 404,
               headers: { ...corsHeaders, 'Content-Type': 'application/json' },
             });
          }
          throw updateError;
        }

        console.log(`Successfully updated company ${companyId} by user ${user.id}`);
        return new Response(JSON.stringify(updatedCompany), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      case 'DELETE': {
        // Implement DELETE /companies/{id} (Delete company - Staff only)
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/').filter(part => part);
        const companyId = pathParts[3];

        if (!companyId) {
           return new Response(JSON.stringify({ error: 'Bad Request: Company ID missing in URL' }), {
             status: 400,
             headers: { ...corsHeaders, 'Content-Type': 'application/json' },
           });
        }
        console.log(`Attempting to delete company ${companyId} by user ${user.id}`);

        // Check if user is staff
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles')
          .select('is_staff')
          .eq('user_id', user.id)
          .single();

        if (profileError || !profile?.is_staff) {
          console.error(`User ${user.id} is not authorized to delete companies.`);
          return new Response(JSON.stringify({ error: 'Forbidden: Only staff can delete companies' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Delete the company
        // RLS policy "Staff can delete companies" should enforce this,
        // but the check above provides a clearer error message.
        const { error: deleteError } = await supabaseClient
          .from('companies')
          .delete()
          .eq('id', companyId);

        if (deleteError) {
          console.error(`Error deleting company ${companyId}:`, deleteError.message);
          // Handle potential errors like company not found (PostgREST might return error or just 0 rows affected)
          // Check if the error indicates the row wasn't found (e.g., based on code or message if available)
          // For simplicity, we'll rely on RLS and assume success if no error, or return 500 otherwise.
          // A more robust check might involve verifying the count of deleted rows if the client library supports it.
          throw deleteError;
        }

        // Check if the company was actually deleted (optional, depends on PostgREST behavior)
        // Supabase delete doesn't typically return the deleted record or count easily without specific headers/settings.
        // We assume success if no error occurred due to RLS/staff check.

        console.log(`Successfully deleted company ${companyId} by user ${user.id}`);
        return new Response(null, { // No content response
          headers: { ...corsHeaders },
          status: 204, // No Content
        });
      }
      default:
        console.warn(`Method ${req.method} not allowed`);
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown internal server error';
    console.error('Internal Server Error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
