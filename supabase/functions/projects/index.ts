import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

console.log('Projects function started');

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

    const url = new URL(req.url);
    // Path: /functions/v1/projects/{projectId}/...
    const pathParts = url.pathname.split('/').filter((part) => part);
    const projectId = pathParts[3];
    // Further path segments can be extracted for nested resources like milestones, risks, issues

    // Routing based on HTTP method and path
    switch (req.method) {
      case 'GET': {
        if (projectId) {
          // Implement GET /projects/{id} (Get specific project details)
          console.log(
            `Fetching details for project ${projectId} for user ${user.id}`,
          );

          // Fetch the project - RLS policy "Users can view projects of their companies" enforces access
          const { data: project, error: projectError } = await supabaseClient
            .from('projects')
            .select(`
              *,
              companies ( name ),
              user_profiles ( full_name )
            `)
            .eq('id', projectId)
            .maybeSingle(); // Use maybeSingle to handle RLS denial or not found gracefully

          if (projectError) {
            console.error(
              `Error fetching project ${projectId}:`,
              projectError.message,
            );
            throw projectError;
          }

          if (!project) {
            console.log(
              `Project ${projectId} not found or access denied for user ${user.id}`,
            );
            return new Response(
              JSON.stringify({ error: `Project not found or access denied` }),
              {
                status: 404, // Not Found or Forbidden - use 404 for security
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }

          // Rename related fields for clarity
          const projectDetails = {
            ...project,
            company_name: project.companies?.name,
            project_owner_name: project.user_profiles?.full_name,
          };
          delete projectDetails.companies; // Remove nested object
          delete projectDetails.user_profiles; // Remove nested object

          console.log(
            `Successfully fetched project ${projectId} for user ${user.id}`,
          );
          return new Response(JSON.stringify(projectDetails), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } else {
          // Implement GET /projects (List projects for the user's companies)
          console.log(`Fetching projects for user ${user.id}`);

          // Fetch projects where the user is a member of the associated company
          // RLS policy "Users can view projects of their companies" enforces this
          const { data: projects, error: projectsError } = await supabaseClient
            .from('projects')
            .select(`
              id,
              name,
              status,
              stage,
              health_status,
              company_id,
              companies ( name ) 
            `);
          // RLS implicitly filters based on company_users join

          if (projectsError) {
            console.error('Error fetching projects:', projectsError.message);
            throw projectsError;
          }

          console.log(
            `Found ${projects?.length || 0} projects for user ${user.id}`,
          );
          return new Response(JSON.stringify(projects || []), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }
      }
      case 'POST': {
        // Implement POST /projects (Create project)
        console.log(`Attempting to create a new project by user ${user.id}`);

        // Parse request body
        let newProjectData;
        try {
          newProjectData = await req.json();
          if (
            !newProjectData.name || !newProjectData.company_id ||
            !newProjectData.status || !newProjectData.stage
          ) {
            throw new Error(
              'Missing required fields: name, company_id, status, stage',
            );
          }
          // TODO: Add validation for status, stage enums
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Unknown error';
          console.error('Error parsing request body:', errorMessage);
          return new Response(
            JSON.stringify({ error: `Bad Request: ${errorMessage}` }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Permission check: Staff or user with 'project:create' permission for the target company
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: newProjectData.company_id,
              permission_key: 'project:create',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(
            `User ${user.id} not authorized to create projects in company ${newProjectData.company_id}.`,
          );
          return new Response(
            JSON.stringify({ error: 'Forbidden: Not authorized' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Insert new project
        const { data: createdProject, error: insertError } =
          await supabaseClient
            .from('projects')
            .insert({
              name: newProjectData.name,
              company_id: newProjectData.company_id,
              status: newProjectData.status,
              stage: newProjectData.stage,
              health_status: newProjectData.health_status || 'Unknown', // Default if not provided
              project_owner_id: newProjectData.project_owner_id, // Optional
              project_template_version_id:
                newProjectData.project_template_version_id, // Optional
              // created_at, updated_at are handled by default/trigger
            })
            .select()
            .single();

        if (insertError) {
          console.error('Error creating project:', insertError.message);
          throw insertError;
        }

        // TODO: If project_template_version_id is provided, automatically create sections/tasks based on the template. This requires more complex logic.

        console.log(
          `Successfully created project ${createdProject.id} by user ${user.id}`,
        );
        return new Response(JSON.stringify(createdProject), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 201, // Created
        });
      }
      case 'PUT': {
        if (!projectId) {
          return new Response(
            JSON.stringify({ error: 'Bad Request: Project ID missing in URL' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        console.log(
          `Attempting to update project ${projectId} by user ${user.id}`,
        );

        // First, fetch the project to get its company_id for permission check
        const { data: projectToCheck, error: checkError } = await supabaseClient
          .from('projects')
          .select('company_id')
          .eq('id', projectId)
          .single(); // Use single to ensure project exists

        if (checkError || !projectToCheck) {
          console.error(
            `Error fetching project ${projectId} for permission check or project not found:`,
            checkError?.message,
          );
          return new Response(JSON.stringify({ error: 'Project not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const projectCompanyId = projectToCheck.company_id;

        // Permission check: Staff or user with 'project:edit_settings'
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'project:edit_settings',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(
            `User ${user.id} not authorized to update project ${projectId}.`,
          );
          return new Response(
            JSON.stringify({ error: 'Forbidden: Not authorized' }),
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
          if (Object.keys(updateData).length === 0) {
            throw new Error('No update data provided');
          }
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Unknown error';
          console.error('Error parsing request body:', errorMessage);
          return new Response(
            JSON.stringify({ error: `Bad Request: ${errorMessage}` }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Prepare allowed update fields
        const allowedUpdates = {
          name: updateData.name,
          status: updateData.status,
          stage: updateData.stage,
          health_status: updateData.health_status,
          project_owner_id: updateData.project_owner_id,
          project_template_version_id: updateData.project_template_version_id,
          // company_id should generally not be changed via this endpoint
        };
        // Using type assertion to handle TS7053
        Object.keys(allowedUpdates).forEach((key) => {
          if (allowedUpdates[key as keyof typeof allowedUpdates] === undefined) {
            delete allowedUpdates[key as keyof typeof allowedUpdates];
          }
        });

        // Update the project
        const { data: updatedProject, error: updateError } =
          await supabaseClient
            .from('projects')
            .update(allowedUpdates)
            .eq('id', projectId)
            .select() // Select the updated record
            .single(); // RLS should prevent unauthorized updates

        if (updateError) {
          console.error(
            `Error updating project ${projectId}:`,
            updateError.message,
          );
          if (updateError.code === 'PGRST204') { // No rows updated/selected
            return new Response(
              JSON.stringify({ error: 'Project not found or update failed' }),
              {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }
          throw updateError;
        }

        console.log(
          `Successfully updated project ${projectId} by user ${user.id}`,
        );
        return new Response(JSON.stringify(updatedProject), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      case 'DELETE': {
        if (!projectId) {
          return new Response(
            JSON.stringify({ error: 'Bad Request: Project ID missing in URL' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        console.log(
          `Attempting to delete project ${projectId} by user ${user.id}`,
        );

        // Fetch project company_id for permission check
        const { data: projectToCheck, error: checkError } = await supabaseClient
          .from('projects')
          .select('company_id')
          .eq('id', projectId)
          .single();

        if (checkError || !projectToCheck) {
          console.error(
            `Error fetching project ${projectId} for permission check or project not found:`,
            checkError?.message,
          );
          return new Response(JSON.stringify({ error: 'Project not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const projectCompanyId = projectToCheck.company_id;

        // Permission check: Staff or user with 'project:delete'
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'project:delete',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(
            `User ${user.id} not authorized to delete project ${projectId}.`,
          );
          return new Response(
            JSON.stringify({ error: 'Forbidden: Not authorized' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Delete the project
        const { error: deleteError } = await supabaseClient
          .from('projects')
          .delete()
          .eq('id', projectId);

        if (deleteError) {
          console.error(
            `Error deleting project ${projectId}:`,
            deleteError.message,
          );
          throw deleteError;
        }

        console.log(
          `Successfully deleted project ${projectId} by user ${user.id}`,
        );
        return new Response(null, { // No content response
          headers: { ...corsHeaders },
          status: 204, // No Content
        });
      }
      // TODO: Add routes for nested resources like /projects/{id}/milestones, /risks, /issues
      default:
        // Handle other methods for specific project ID if applicable
        if (projectId) {
          // TODO: Route to nested resource handlers (milestones, risks, issues) based on pathParts[4]
          console.warn(
            `Nested resource or method ${req.method} for project ${projectId} not implemented yet.`,
          );
          return new Response(
            JSON.stringify({
              message:
                `Endpoint for project ${projectId} not fully implemented`,
            }),
            {
              status: 501,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        // If no projectId, it's a general /projects request with an unhandled method
        console.warn(`Method ${req.method} not allowed for /projects`);
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
