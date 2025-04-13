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

console.log('Sections function started');

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

    console.log(`Handling ${req.method} request for user ${user.id}`);

    const url = new URL(req.url);
    // Path: /functions/v1/sections/{sectionId}
    const pathParts = url.pathname.split('/').filter((part) => part);
    const sectionId = pathParts[3];
    const projectId = url.searchParams.get('project_id'); // Allow filtering by project_id

    // Routing based on HTTP method and path
    switch (req.method) {
      case 'GET': {
        if (sectionId) {
          // Implement GET /sections/{id} (Get specific section details)
          console.log(
            `Fetching details for section ${sectionId}, user ${user.id}`,
          );

          // Fetch the specific section
          // RLS policy "Users can view sections of their projects" should enforce access
          const { data: section, error: sectionError } = await supabaseClient
            .from('sections')
            .select('*') // Select all columns for now
            .eq('id', sectionId)
            .maybeSingle(); // Use maybeSingle for potential 404

          if (sectionError) {
            console.error(
              `Error fetching section ${sectionId}:`,
              sectionError.message,
            );
            throw sectionError;
          }

          if (!section) {
            console.log(
              `Section ${sectionId} not found or access denied for user ${user.id}`,
            );
            return createNotFoundResponse('Section not found or access denied');
          }

          // No complex joins needed for sections currently, return as is
          console.log(`Successfully fetched section ${sectionId}`);
          return new Response(JSON.stringify(section), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } else if (projectId) {
          // Implement GET /sections?project_id={projectId} (List sections for a project)
          console.log(
            `Fetching sections for project ${projectId}, user ${user.id}`,
          );

          // Check if user can access the project first
          const { data: projectCheck, error: projectCheckError } =
            await supabaseClient
              .from('projects')
              .select('id')
              .eq('id', projectId)
              .maybeSingle(); // RLS on projects table will apply

          if (projectCheckError) throw projectCheckError;
          if (!projectCheck) {
            console.log(
              `Project ${projectId} not found or access denied for user ${user.id}`,
            );
            return createNotFoundResponse('Project not found or access denied');
          }

          // Fetch sections for the specified project
          // RLS policy "Users can view sections of their projects" should enforce access
          const { data: sections, error: sectionsError } = await supabaseClient
            .from('sections')
            .select('*') // Select all columns for now
            .eq('project_id', projectId)
            .order('order', { ascending: true }); // Order by the 'order' column

          if (sectionsError) {
            console.error(
              `Error fetching sections for project ${projectId}:`,
              sectionsError.message,
            );
            throw sectionsError;
          }

          console.log(
            `Found ${sections?.length || 0} sections for project ${projectId}`,
          );
          return new Response(JSON.stringify(sections || []), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } else {
          // Require project_id for listing sections
          return createBadRequestResponse(
            'project_id query parameter is required',
          );
        }
      }
      case 'POST': {
        // Implement POST /sections (Create section for a project)
        console.log(
          `Attempting to create a section, requested by user ${user.id}`,
        );

        // Parse request body
        // deno-lint-ignore no-explicit-any
        let newSectionData: any;
        try {
          newSectionData = await req.json();
          const errors: { [field: string]: string[] } = {};
          if (!newSectionData.name) errors.name = ['Section name is required'];
          if (!newSectionData.project_id) {
            errors.project_id = ['Project ID is required'];
          }
          const allowedTypes = [
            'INFO',
            'BUILD',
            'UAT',
            'GO_LIVE',
            'PLANNING',
            'OTHER',
          ];
          if (!newSectionData.type) {
            errors.type = ['Section type is required'];
          } else if (!allowedTypes.includes(newSectionData.type)) {
            errors.type = [`Type must be one of: ${allowedTypes.join(', ')}`];
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
        const targetProjectId = newSectionData.project_id;

        // Fetch project company_id for permission check
        const { data: projectToCheck, error: checkError } = await supabaseClient
          .from('projects')
          .select('company_id')
          .eq('id', targetProjectId)
          .single();
        if (checkError || !projectToCheck) {
          // If project_id is invalid/not found, treat as bad request or not found
          return createNotFoundResponse('Project not found');
        }
        const projectCompanyId = projectToCheck.company_id;

        // Permission check: Staff or user with 'section:manage'
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'section:manage',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(
            `User ${user.id} not authorized to manage sections for project ${targetProjectId}.`,
          );
          return createForbiddenResponse();
        }

        // Insert new section
        const { data: createdSection, error: insertError } =
          await supabaseClient
            .from('sections')
            .insert({
              project_id: targetProjectId,
              name: newSectionData.name,
              type: newSectionData.type,
              status: newSectionData.status || 'Not Started', // Default
              is_public: newSectionData.is_public || false, // Default
              order: newSectionData.order || 0, // Default
              section_template_id: newSectionData.section_template_id, // Optional
            })
            .select()
            .single();

        if (insertError) {
          console.error('Error creating section:', insertError.message);
          // TODO(db-error): Handle specific DB errors (e.g., FK violation on project_id) with appropriate 4xx status codes.
          throw insertError;
        }

        console.log(
          `Successfully created section ${createdSection.id} for project ${targetProjectId}`,
        );
        return new Response(JSON.stringify(createdSection), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 201, // Created
        });
      }
      case 'PUT': {
        if (!sectionId) {
          return createBadRequestResponse('Section ID missing in URL');
        }
        console.log(
          `Attempting to update section ${sectionId}, requested by user ${user.id}`,
        );

        // Fetch section's project and company for permission check
        const { data: sectionToCheck, error: checkError } = await supabaseClient
          .from('sections')
          .select('project_id, projects ( company_id )')
          .eq('id', sectionId)
          .single();

        // Use type assertion for nested join result
        const projectCompanyId =
          (sectionToCheck?.projects as { company_id: string })?.company_id;

        if (checkError || !projectCompanyId) {
          console.error(
            `Error fetching section ${sectionId} for permission check or section/project/company not found:`,
            checkError?.message,
          );
          return createNotFoundResponse(
            'Section or associated project/company not found',
          );
        }

        // Permission check: Staff or user with 'section:manage'
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'section:manage',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(
            `User ${user.id} not authorized to manage sections for project ${sectionToCheck.project_id}.`,
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
          const errors: ValidationErrors = {};
          const allowedTypes = [
            'INFO',
            'BUILD',
            'UAT',
            'GO_LIVE',
            'PLANNING',
            'OTHER',
          ];
          if (updateData.type && !allowedTypes.includes(updateData.type)) {
            errors.type = [`Type must be one of: ${allowedTypes.join(', ')}`];
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
          type: updateData.type,
          status: updateData.status,
          is_public: updateData.is_public,
          order: updateData.order,
          // percent_complete is handled by trigger
          section_template_id: updateData.section_template_id,
          // project_id should not be changed
        };
        // Remove undefined fields
        Object.keys(allowedUpdates).forEach((key) => {
          if (
            allowedUpdates[key as keyof typeof allowedUpdates] === undefined
          ) {
            delete allowedUpdates[key as keyof typeof allowedUpdates];
          }
        });

        // Update the section
        const { data: updatedSection, error: updateError } =
          await supabaseClient
            .from('sections')
            .update(allowedUpdates)
            .eq('id', sectionId)
            .select()
            .single(); // RLS should also prevent unauthorized updates

        if (updateError) {
          console.error(
            `Error updating section ${sectionId}:`,
            updateError.message,
          );
          if (updateError.code === 'PGRST204') { // No rows updated/selected
            return createNotFoundResponse('Section not found or update failed');
          }
          if (updateError.code === '23503') { // Foreign key violation
            return createBadRequestResponse(
              `Invalid reference: ${updateError.details}`,
            );
          }
          // Handle other specific DB errors
          throw updateError;
        }

        console.log(`Successfully updated section ${sectionId}`);
        return new Response(JSON.stringify(updatedSection), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      case 'DELETE': {
        if (!sectionId) {
          return createBadRequestResponse('Section ID missing in URL');
        }
        console.log(
          `Attempting to delete section ${sectionId}, requested by user ${user.id}`,
        );

        // Fetch section's project and company for permission check
        const { data: sectionToCheck, error: checkError } = await supabaseClient
          .from('sections')
          .select('project_id, projects ( company_id )')
          .eq('id', sectionId)
          .single();

        // Use type assertion for nested join result
        const projectCompanyId =
          (sectionToCheck?.projects as { company_id: string })?.company_id;

        if (checkError || !projectCompanyId) {
          console.error(
            `Error fetching section ${sectionId} for permission check or section/project/company not found:`,
            checkError?.message,
          );
          return createNotFoundResponse(
            'Section or associated project/company not found',
          );
        }

        // Permission check: Staff or user with 'section:manage'
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'section:manage',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(
            `User ${user.id} not authorized to manage sections for project ${sectionToCheck.project_id}.`,
          );
          return createForbiddenResponse();
        }

        // Delete the section (RLS should handle this)
        // Note: Deleting a section will cascade delete tasks within it due to DB constraints.
        const { error: deleteError } = await supabaseClient
          .from('sections')
          .delete()
          .eq('id', sectionId);

        if (deleteError) {
          console.error(
            `Error deleting section ${sectionId}:`,
            deleteError.message,
          );
          if (deleteError.code === 'PGRST204') { // Not Found
            return createNotFoundResponse('Section not found or already deleted');
          }
          if (deleteError.code === '23503') { // Foreign key violation (tasks exist)
            return createConflictResponse(
              'Cannot delete section with existing tasks.',
            );
          }
          // Handle other specific DB errors
          throw deleteError;
        }

        console.log(`Successfully deleted section ${sectionId}`);
        return new Response(null, { // No content response
          headers: { ...corsHeaders },
          status: 204, // No Content
        });
      }
      default:
        console.warn(`Method ${req.method} not allowed for /sections`);
        return createMethodNotAllowedResponse();
    }
  } catch (error) {
    // Use the standardized internal server error response
    return createInternalServerErrorResponse(undefined, error);
  }
});
