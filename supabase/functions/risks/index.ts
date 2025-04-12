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
  ValidationErrors, // Import ValidationErrors type
} from '../_shared/validation.ts'; // Import helpers

console.log('Risks function started');

// Define allowed enum values based on schema
const validStatuses = ['Potential', 'Open', 'Mitigated', 'Closed'];
const validProbabilities = ['Low', 'Medium', 'High'];
const validImpacts = ['Low', 'Medium', 'High'];

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
    // Path: /functions/v1/risks/{riskId}
    const pathParts = url.pathname.split('/').filter((part) => part);
    const riskId = pathParts[3];
    const projectId = url.searchParams.get('project_id'); // Allow filtering by project_id

    // Routing based on HTTP method and path
    switch (req.method) {
      case 'GET': {
        if (riskId) {
          // Implement GET /risks/{id} (Get specific risk details)
          console.log(`Fetching details for risk ${riskId}, user ${user.id}`);

          // Fetch the specific risk with related data
          // RLS policy "Users can view risks of their projects" should enforce access
          const { data: risk, error: riskError } = await supabaseClient
            .from('risks')
            .select(`
              *,
              reporter:reported_by_user_id ( full_name ),
              assignee:assigned_to_user_id ( full_name )
            `)
            .eq('id', riskId)
            .maybeSingle(); // Use maybeSingle for potential 404

          if (riskError) {
            console.error(`Error fetching risk ${riskId}:`, riskError.message);
            throw riskError;
          }

          if (!risk) {
            console.log(
              `Risk ${riskId} not found or access denied for user ${user.id}`,
            );
            return createNotFoundResponse('Risk not found or access denied');
          }

          // Format response similar to the list endpoint
          const riskDetails = {
            ...risk,
            reported_by_name: risk.reporter?.full_name,
            assigned_to_name: risk.assignee?.full_name,
            reporter: undefined,
            assignee: undefined,
          };

          console.log(`Successfully fetched risk ${riskId}`);
          return new Response(JSON.stringify(riskDetails), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } else if (projectId) {
          // Implement GET /risks?project_id={projectId} (List risks for a project)
          console.log(
            `Fetching risks for project ${projectId}, user ${user.id}`,
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

          // Fetch risks for the specified project
          // RLS policy "Users can view risks of their projects" should enforce access
          const { data: risks, error: risksError } = await supabaseClient
            .from('risks')
            .select(`
              *,
              reporter:reported_by_user_id ( full_name ),
              assignee:assigned_to_user_id ( full_name )
            `)
            .eq('project_id', projectId)
            .order('created_at', { ascending: false }); // Order by creation date

          if (risksError) {
            console.error(
              `Error fetching risks for project ${projectId}:`,
              risksError.message,
            );
            throw risksError;
          }

          // Format response
          const risksList = risks?.map((r) => ({
            ...r,
            reported_by_name: r.reporter?.full_name,
            assigned_to_name: r.assignee?.full_name,
            reporter: undefined, // Remove nested object
            assignee: undefined, // Remove nested object
          })) || [];

          console.log(
            `Found ${risksList.length} risks for project ${projectId}`,
          );
          return new Response(JSON.stringify(risksList), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } else {
          // Require project_id for listing risks
          return createBadRequestResponse(
            'project_id query parameter is required',
          );
        }
      }
      case 'POST': {
        // Implement POST /risks (Create risk for a project)
        console.log(
          `Attempting to create a risk, requested by user ${user.id}`,
        );

        // Parse request body
        // deno-lint-ignore no-explicit-any
        // deno-lint-ignore no-explicit-any
        let newRiskData: any;
        const errors: ValidationErrors = {}; // Use ValidationErrors type
        try {
          newRiskData = await req.json();

          // --- Validation ---
          if (!newRiskData.description) {
            errors.description = ['Description is required'];
          }
          if (!newRiskData.project_id) {
            errors.project_id = ['Project ID is required'];
          }
          if (newRiskData.status !== undefined && !validStatuses.includes(newRiskData.status)) {
            errors.status = [`Status must be one of: ${validStatuses.join(', ')}`];
          }
          if (newRiskData.probability !== undefined && !validProbabilities.includes(newRiskData.probability)) {
            errors.probability = [`Probability must be one of: ${validProbabilities.join(', ')}`];
          }
          if (newRiskData.impact !== undefined && !validImpacts.includes(newRiskData.impact)) {
            errors.impact = [`Impact must be one of: ${validImpacts.join(', ')}`];
          }
          // --- End Validation ---

          if (Object.keys(errors).length > 0) {
            return createValidationErrorResponse(errors); // Return 422 Validation Error
          }
        } catch (e) {
          const errorMessage = e instanceof Error
            ? e.message
            : 'Invalid JSON body';
          return createBadRequestResponse(errorMessage);
        }
        const targetProjectId = newRiskData.project_id;

        // Fetch project company_id for permission check
        const { data: projectToCheck, error: checkError } = await supabaseClient
          .from('projects')
          .select('company_id')
          .eq('id', targetProjectId)
          .single();
        if (checkError || !projectToCheck) {
          // Use validation response if project_id is invalid
          return createValidationErrorResponse({
            project_id: ['Project not found or access denied'],
          });
        }
        const projectCompanyId = projectToCheck.company_id;

        // Permission check: Staff or user with 'risk:manage'
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'risk:manage',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(
            `User ${user.id} not authorized to manage risks for project ${targetProjectId}.`,
          );
          return createForbiddenResponse();
        }

        // Insert new risk
        const { data: createdRisk, error: insertError } = await supabaseClient
          .from('risks')
          .insert({
            project_id: targetProjectId,
            description: newRiskData.description,
            reported_by_user_id: user.id, // Set reporter to current user
            assigned_to_user_id: newRiskData.assigned_to_user_id, // Optional
            status: newRiskData.status || 'Potential', // Default
            probability: newRiskData.probability, // Optional
            impact: newRiskData.impact, // Optional
            mitigation_plan: newRiskData.mitigation_plan, // Optional
            contingency_plan: newRiskData.contingency_plan, // Optional
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error creating risk:', insertError.message);
          // Handle specific database errors
          if (insertError.code === '23503') { // Foreign key violation
            const constraint = insertError.message.includes('project_id')
              ? 'project_id'
              : insertError.message.includes('reported_by_user_id')
                ? 'reported_by_user_id'
                : insertError.message.includes('assigned_to_user_id')
                  ? 'assigned_to_user_id'
                  : 'unknown foreign key';
            return createBadRequestResponse(
              `Invalid reference: ${constraint} refers to a record that doesn't exist`,
            );
          } else if (insertError.code === '23514') { // Check constraint violation
            return createBadRequestResponse(
              `Invalid field value: ${insertError.message}. Check status, probability, or impact.`,
            );
          } else if (insertError.code === '23502') { // Not null violation
            const columnMatch = insertError.message.match(/null value in column "(.+?)"/);
            const column = columnMatch ? columnMatch[1] : 'unknown';
            return createBadRequestResponse(`The ${column} field is required.`);
          }
          // For other errors, let the main handler deal with it
          throw insertError;
        }

        console.log(
          `Successfully created risk ${createdRisk.id} for project ${targetProjectId}`,
        );
        return new Response(JSON.stringify(createdRisk), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 201, // Created
        });
      }
      case 'PUT': {
        if (!riskId) {
          return createBadRequestResponse('Risk ID missing in URL');
        }
        console.log(
          `Attempting to update risk ${riskId}, requested by user ${user.id}`,
        );

        // Fetch risk's project and company for permission check
        const { data: riskToCheck, error: checkError } = await supabaseClient
          .from('risks')
          .select('project_id, projects ( company_id )')
          .eq('id', riskId)
          .single();

        // The join might return an array even with .single(), addressing TS2339
        // deno-lint-ignore no-explicit-any
        const projectCompanyId =
          (riskToCheck?.projects as any)?.[0]?.company_id ??
            (riskToCheck?.projects as any)?.company_id;
        if (checkError || !projectCompanyId) {
          console.error(
            `Error fetching risk ${riskId} for permission check or risk/project/company not found:`,
            checkError?.message,
          );
          return createNotFoundResponse(
            'Risk or associated project/company not found',
          );
        }

        // Permission check: Staff or user with 'risk:manage'
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'risk:manage',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(
            `User ${user.id} not authorized to manage risks for project ${riskToCheck.project_id}.`,
          );
          return createForbiddenResponse();
        }

        // Parse request body
        // deno-lint-ignore no-explicit-any
        let updateData: any;
        const errors: ValidationErrors = {}; // Use ValidationErrors type
        try {
          updateData = await req.json();
          if (Object.keys(updateData).length === 0) {
            throw new Error('No update data provided');
          }

          // --- Validation ---
          if (updateData.status !== undefined && !validStatuses.includes(updateData.status)) {
            errors.status = [`Status must be one of: ${validStatuses.join(', ')}`];
          }
          if (updateData.probability !== undefined && !validProbabilities.includes(updateData.probability)) {
            errors.probability = [`Probability must be one of: ${validProbabilities.join(', ')}`];
          }
          if (updateData.impact !== undefined && !validImpacts.includes(updateData.impact)) {
            errors.impact = [`Impact must be one of: ${validImpacts.join(', ')}`];
          }
          // --- End Validation ---

          if (Object.keys(errors).length > 0) {
            return createValidationErrorResponse(errors); // Return 422 Validation Error
          }
        } catch (e) {
          const errorMessage = e instanceof Error
            ? e.message
            : 'Invalid JSON body';
          return createBadRequestResponse(errorMessage);
        }

        // Prepare allowed update fields
        const allowedUpdates = {
          description: updateData.description,
          assigned_to_user_id: updateData.assigned_to_user_id,
          status: updateData.status,
          probability: updateData.probability,
          impact: updateData.impact,
          mitigation_plan: updateData.mitigation_plan,
          contingency_plan: updateData.contingency_plan,
          // project_id and reported_by_user_id should not be changed
        };
        // Remove undefined fields
        Object.keys(allowedUpdates).forEach((key) => {
          if (
            allowedUpdates[key as keyof typeof allowedUpdates] === undefined
          ) {
            delete allowedUpdates[key as keyof typeof allowedUpdates];
          }
        });

        // Update the risk
        const { data: updatedRisk, error: updateError } = await supabaseClient
          .from('risks')
          .update(allowedUpdates)
          .eq('id', riskId)
          .select()
          .single(); // RLS should also prevent unauthorized updates

        if (updateError) {
          console.error(`Error updating risk ${riskId}:`, updateError.message);
          if (updateError.code === 'PGRST204') { // No rows updated/selected
            return createNotFoundResponse('Risk not found or update failed');
          } else if (updateError.code === '23503') { // Foreign key violation
            const constraint = updateError.message.includes('assigned_to_user_id')
              ? 'assigned_to_user_id'
              : 'unknown foreign key';
            return createBadRequestResponse(
              `Invalid reference: ${constraint} refers to a record that doesn't exist`,
            );
          } else if (updateError.code === '23514') { // Check constraint violation
            return createBadRequestResponse(
              `Invalid field value: ${updateError.message}. Check status, probability, or impact.`,
            );
          } else if (updateError.code === '23502') { // Not null violation
            const columnMatch = updateError.message.match(/null value in column "(.+?)"/);
            const column = columnMatch ? columnMatch[1] : 'unknown';
            return createBadRequestResponse(`The ${column} field is required.`);
          }
          // For other errors, let the main handler deal with it
          throw updateError;
        }

        console.log(`Successfully updated risk ${riskId}`);
        return new Response(JSON.stringify(updatedRisk), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      case 'DELETE': {
        if (!riskId) {
          return createBadRequestResponse('Risk ID missing in URL');
        }
        console.log(
          `Attempting to delete risk ${riskId}, requested by user ${user.id}`,
        );

        // Fetch risk's project and company for permission check
        const { data: riskToCheck, error: checkError } = await supabaseClient
          .from('risks')
          .select('project_id, projects ( company_id )')
          .eq('id', riskId)
          .single();

        // The join might return an array even with .single(), addressing TS2339
        // deno-lint-ignore no-explicit-any
        const projectCompanyId =
          (riskToCheck?.projects as any)?.[0]?.company_id ??
            (riskToCheck?.projects as any)?.company_id;
        if (checkError || !projectCompanyId) {
          console.error(
            `Error fetching risk ${riskId} for permission check or risk/project/company not found:`,
            checkError?.message,
          );
          return createNotFoundResponse(
            'Risk or associated project/company not found',
          );
        }

        // Permission check: Staff or user with 'risk:manage'
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'risk:manage',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(
            `User ${user.id} not authorized to manage risks for project ${riskToCheck.project_id}.`,
          );
          return createForbiddenResponse();
        }

        // Delete the risk
        const { error: deleteError } = await supabaseClient
          .from('risks')
          .delete()
          .eq('id', riskId);

        if (deleteError) {
          console.error(`Error deleting risk ${riskId}:`, deleteError.message);
          // Handle specific database errors
          if (deleteError.code === 'PGRST204') { // No rows deleted
            return createNotFoundResponse('Risk not found or already deleted');
          } else if (deleteError.code === '23503') { // Foreign key violation (e.g., if issues reference this risk)
            return createConflictResponse(
              'Cannot delete this risk because it is referenced by other records (like issues).',
            );
          }
          // For other errors, let the main handler deal with it
          throw deleteError;
        }

        console.log(`Successfully deleted risk ${riskId}`);
        return new Response(null, { // No content response
          headers: { ...corsHeaders },
          status: 204, // No Content
        });
      }
      default:
        console.warn(`Method ${req.method} not allowed for /risks`);
        return createMethodNotAllowedResponse();
    }
  } catch (error) {
    // Use the standardized internal server error response
    return createInternalServerErrorResponse(undefined, error);
  }
});
