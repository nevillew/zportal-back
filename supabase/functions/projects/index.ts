import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  createBadRequestResponse,
  createForbiddenResponse,
  createInternalServerErrorResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  createUnauthorizedResponse,
  createValidationErrorResponse,
} from '../_shared/validation.ts'; // Import helpers

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
      return createUnauthorizedResponse(userError?.message);
    }
    // Store user ID after the null check
    const userId = user.id;

    console.log(`Handling ${req.method} request for user ${userId}`);

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
            // Use 404 for security (don't reveal existence if forbidden)
            return createNotFoundResponse(`Project not found or access denied`);
          }

          // Rename related fields for clarity
          const projectDetails = {
            ...project,
            company_name: project.companies?.name,
            project_owner_name: project.user_profiles?.full_name,
            // Keep original nested objects or remove them based on frontend needs
            // companies: undefined, // Example: Remove nested object
            // user_profiles: undefined, // Example: Remove nested object
          };
          // Remove the join helper data if not needed directly
          // delete projectDetails.companies;
          // delete projectDetails.user_profiles;

          // Fetch associated custom fields for this project
          const { data: customFields, error: cfError } = await supabaseClient
            .from('custom_field_values')
            .select(`
              value,
              custom_field_definitions ( name, label, field_type, options )
            `)
            .eq('entity_id', projectId)
            // Add filter for project entity type if definition table has it
            .eq('custom_field_definitions.entity_type', 'project');

          if (cfError) {
            // Log the whole error object for safety
            console.error(
              `Error fetching custom fields for project ${projectId}:`,
              cfError,
            );
            // Don't fail the whole request, just log and return project details without custom fields
          }

          // Format custom fields into a more usable structure (e.g., object keyed by name)
          // deno-lint-ignore no-explicit-any
          const formattedCustomFields: { [key: string]: any } = {};
          // Explicit null check and optional chaining for forEach
          if (customFields !== null) {
            customFields?.forEach((cf) => {
              // Access the first element of the potential array from the join
              // deno-lint-ignore no-explicit-any
              const definition = (cf.custom_field_definitions as any)?.[0];
              if (definition) {
                formattedCustomFields[definition.name] = {
                  label: definition.label,
                  value: cf.value, // Value is already JSONB
                  type: definition.field_type,
                  options: definition.options,
                };
              }
            });
          }

          // deno-lint-ignore no-explicit-any
          (projectDetails as any).custom_fields = formattedCustomFields; // Add to the response object

          console.log(
            `Successfully fetched project ${projectId} with custom fields for user ${userId}`, // Use stored userId
          );
          return new Response(JSON.stringify(projectDetails), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } else {
          // Implement GET /projects (List projects for the user's companies)
          // Add redundant check again to satisfy type checker
          if (!user) {
            // This should theoretically never be reached due to the initial check
            console.error(
              'User became null unexpectedly before listing projects',
            );
            // This should theoretically never happen due to the initial check
            return createInternalServerErrorResponse('User context lost');
          }
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

          // Format the list response for consistency
          const projectList = projects?.map((p) => ({
            ...p,
            // Use type assertion for the join result
            company_name: (p.companies as { name: string })?.name,
            companies: undefined, // Remove nested object
          })) || [];

          console.log(
            `Found ${projectList.length} projects for user ${user.id}`,
          );
          return new Response(JSON.stringify(projectList), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }
      }
      case 'POST': {
        // Implement POST /projects (Create project)
        console.log(`Attempting to create a new project by user ${user.id}`);

        // Parse request body
        // deno-lint-ignore no-explicit-any
        let newProjectData: any;
        try {
          newProjectData = await req.json();
          const errors: { [field: string]: string[] } = {};
          if (!newProjectData.name) errors.name = ['Project name is required'];
          if (!newProjectData.company_id) {
            errors.company_id = ['Company ID is required'];
          }
          const allowedStatuses = [
            'Planning',
            'Active',
            'On Hold',
            'Completed',
            'Cancelled',
          ];
          const allowedStages = [
            'Kick-off',
            'Discovery',
            'Build',
            'UAT',
            'Go Live',
            'Post Go Live',
          ];
          if (!newProjectData.status) {
            errors.status = ['Status is required'];
          } else if (!allowedStatuses.includes(newProjectData.status)) {
            errors.status = [
              `Status must be one of: ${allowedStatuses.join(', ')}`,
            ];
          }
          if (!newProjectData.stage) {
            errors.stage = ['Stage is required'];
          } else if (!allowedStages.includes(newProjectData.stage)) {
            errors.stage = [`Stage must be one of: ${allowedStages.join(', ')}`];
          }

          if (Object.keys(errors).length > 0) {
            return createValidationErrorResponse(errors);
          }
        } catch (e) {
          const errorMessage = e instanceof Error
            ? e.message
            : 'Invalid JSON body';
          return createBadRequestResponse(errorMessage);
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
          return createForbiddenResponse();
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
          // TODO(db-error): Check for specific DB errors (e.g., unique constraints on name+company_id?) and return appropriate 4xx status codes.
          throw insertError;
        }

        // --- Template Instantiation Call ---
        if (newProjectData.project_template_version_id) {
          console.log(
            `Project creation requested with template: ${newProjectData.project_template_version_id}. Calling RPC...`,
          );
          // Call the RPC function instead of just inserting the project record
          const { data: instantiatedProjectId, error: rpcError } =
            await supabaseClient
              .rpc('instantiate_template_rpc', {
                p_template_version_id:
                  newProjectData.project_template_version_id,
                p_target_company_id: newProjectData.company_id,
                p_new_project_name: newProjectData.name,
                p_placeholder_values: newProjectData.placeholder_values || {},
                p_project_owner_id: newProjectData.project_owner_id,
                p_requesting_user_id: user.id,
              });

          if (rpcError) {
            console.error(
              'Error calling instantiate_template_rpc:',
              rpcError.message,
            );
            // Attempt to delete the potentially partially created project record if the RPC failed after insert? Difficult without transaction ID.
            // Best to rely on RPC transactionality. Return specific errors based on RPC output.
            if (rpcError.message.includes('does not have permission')) {
              return createForbiddenResponse(rpcError.message);
            }
            if (
              rpcError.message.includes('not found') ||
              rpcError.code === 'PGRST116'
            ) {
              return createNotFoundResponse(rpcError.message);
            }
            return createInternalServerErrorResponse(
              `Template instantiation failed: ${rpcError.message}`,
            );
          }

          console.log(
            `Successfully instantiated project ${instantiatedProjectId} from template by user ${user.id}`,
          );
          // Fetch the newly created project details to return
          const { data: finalProject, error: fetchFinalError } =
            await supabaseClient
              .from('projects')
              .select('*') // Select necessary fields
              .eq('id', instantiatedProjectId)
              .single();

          if (fetchFinalError || !finalProject) {
            console.error(
              `Failed to fetch details for instantiated project ${instantiatedProjectId}:`,
              fetchFinalError?.message,
            );
            // Return success but indicate data fetch failed
            return new Response(
              JSON.stringify({
                message: 'Project created from template, but failed to fetch details.',
                project_id: instantiatedProjectId,
              }),
              {
                status: 201, // Still created
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }

          return new Response(JSON.stringify(finalProject), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 201, // Created
          });
        }
        // --- End Template Instantiation Call ---

        // --- Handle Custom Fields (Only if NOT using template instantiation above) ---
        if (
          newProjectData.custom_fields &&
          typeof newProjectData.custom_fields === 'object'
        ) {
          // Fetch relevant definitions for 'project' entity type
          const { data: definitions, error: defError } = await supabaseClient
            .from('custom_field_definitions')
            .select('id, name')
            .eq('entity_type', 'project');

          if (defError) {
            console.error(
              'Error fetching custom field definitions:',
              defError.message,
            );
            // Proceed without saving custom fields, but log the error
          } else if (definitions) {
            // deno-lint-ignore no-explicit-any
            const valuesToUpsert: any[] = [];
            const definitionMap = new Map(
              definitions.map((d) => [d.name, d.id]),
            );

            for (const fieldName in newProjectData.custom_fields) {
              if (definitionMap.has(fieldName)) {
                valuesToUpsert.push({
                  definition_id: definitionMap.get(fieldName),
                  entity_id: createdProject.id,
                  value: newProjectData.custom_fields[fieldName], // Store value as JSONB
                });
              } else {
                console.warn(
                  `Custom field definition not found for name: ${fieldName}`,
                );
              }
            }

            if (valuesToUpsert.length > 0) {
              const { error: upsertError } = await supabaseClient
                .from('custom_field_values')
                .upsert(valuesToUpsert, {
                  onConflict: 'definition_id, entity_id',
                }); // Upsert based on unique constraint

              if (upsertError) {
                console.error(
                  'Error upserting custom field values:',
                  upsertError.message,
                );
                // Log error but don't fail the whole project creation
              }
            }
          }
        }

        // TODO(template): If project_template_version_id is provided, call the instantiate-project-template function instead/after creating the basic project record.
        // This current logic only creates the basic project record.

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
          return createBadRequestResponse('Project ID missing in URL');
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
          return createNotFoundResponse('Project not found');
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
          return createForbiddenResponse();
        }

        // Parse request body
        // deno-lint-ignore no-explicit-any
        let updateData: any;
        try {
          updateData = await req.json();
          if (Object.keys(updateData).length === 0) {
            throw new Error('No update data provided');
          }
          const errors: { [field: string]: string[] } = {};
          const allowedStatuses = [
            'Planning',
            'Active',
            'On Hold',
            'Completed',
            'Cancelled',
          ];
          const allowedStages = [
            'Kick-off',
            'Discovery',
            'Build',
            'UAT',
            'Go Live',
            'Post Go Live',
          ];
          if (
            updateData.status && !allowedStatuses.includes(updateData.status)
          ) {
            errors.status = [
              `Status must be one of: ${allowedStatuses.join(', ')}`,
            ];
          }
          if (updateData.stage && !allowedStages.includes(updateData.stage)) {
            errors.stage = [`Stage must be one of: ${allowedStages.join(', ')}`];
          }
          if (Object.keys(errors).length > 0) {
            return createValidationErrorResponse(errors);
          }
        } catch (e) {
          const errorMessage = e instanceof Error
            ? e.message
            : 'Invalid JSON body';
          return createBadRequestResponse(errorMessage);
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
        // Remove undefined fields so they don't overwrite existing values with null
        Object.keys(allowedUpdates).forEach((key) => {
          const typedKey = key as keyof typeof allowedUpdates;
          if (allowedUpdates[typedKey] === undefined) {
            delete allowedUpdates[typedKey];
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
          if (updateError.code === 'PGRST204') { // PostgREST code for no rows updated/selected
            return createNotFoundResponse('Project not found or update failed');
          }
          if (updateError.code === '23503') { // Foreign key violation
            return createBadRequestResponse(
              `Invalid reference: ${updateError.details}`,
            );
          }
          // Handle other specific DB errors
          throw updateError;
        }

        // Handle custom fields provided in the request
        if (
          updateData.custom_fields &&
          typeof updateData.custom_fields === 'object'
        ) {
          // Fetch relevant definitions for 'project' entity type
          const { data: definitions, error: defError } = await supabaseClient
            .from('custom_field_definitions')
            .select('id, name')
            .eq('entity_type', 'project');

          if (defError) {
            console.error(
              'Error fetching custom field definitions during update:',
              defError.message,
            );
          } else if (definitions) {
            // deno-lint-ignore no-explicit-any
            const valuesToUpsert: any[] = [];
            const definitionMap = new Map(
              definitions.map((d) => [d.name, d.id]),
            );

            for (const fieldName in updateData.custom_fields) {
              if (definitionMap.has(fieldName)) {
                valuesToUpsert.push({
                  definition_id: definitionMap.get(fieldName),
                  entity_id: updatedProject.id, // Use the ID of the updated project
                  value: updateData.custom_fields[fieldName], // Store value as JSONB
                });
              } else {
                console.warn(
                  `Custom field definition not found for name during update: ${fieldName}`,
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
                  'Error upserting custom field values during update:',
                  upsertError.message,
                );
                // Log error but don't fail the whole request
              }
            }
          }
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
          return createBadRequestResponse('Project ID missing in URL');
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
          return createNotFoundResponse('Project not found');
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
          return createForbiddenResponse();
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
          // TODO(db-error): Handle specific DB errors (e.g., restricted delete due to FK dependencies from sections, milestones, etc.) with appropriate 4xx status codes (e.g., 409 Conflict).
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
      // TODO(routing): Add routes/logic for nested resources like /projects/{id}/milestones, /risks, /issues, potentially delegating to their respective functions.
      default:
        // Handle other methods for specific project ID if applicable
        if (projectId) {
          // TODO(routing): Route to nested resource handlers (milestones, risks, issues) based on pathParts[4] in the default case.
          console.warn(
            `Nested resource or method ${req.method} for project ${projectId} not implemented yet.`,
          );
          // Use 404 Not Found as the specific nested resource path doesn't exist
          return createNotFoundResponse(
            `Endpoint for project ${projectId} not fully implemented`,
          );
        } else {
          // If no projectId, it's a general /projects request with an unhandled method
          console.warn(`Method ${req.method} not allowed for /projects`);
          return createMethodNotAllowedResponse();
        }
    }
  } catch (error) {
    // Use the standardized internal server error response
    return createInternalServerErrorResponse(undefined, error);
  }
});
