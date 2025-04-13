// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  createBadRequestResponse,
  createConflictResponse,
  createForbiddenResponse,
  createInternalServerErrorResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  createUnauthorizedResponse,
  createValidationErrorResponse,
} from '../_shared/validation.ts'; // Import helpers

console.log('Milestones function started');

// --- Helper: Get Secret from Vault ---
// (Assuming this helper exists or is added, similar to send-notification function)
function getSecret( // Removed async
  _client: SupabaseClient, // Prefix unused parameter
  secretName: string,
): string | null { // Return type changed to string | null
  console.log(`Attempting to fetch secret: ${secretName}`);
  try {
    const secretValue = Deno.env.get(secretName); // Using env var as placeholder/fallback
    if (!secretValue) {
      console.warn(`Secret ${secretName} not found in environment variables.`);
      // TODO: Implement actual Vault fetching logic here using RPC or other secure method
      return null;
    }
    console.log(`Successfully retrieved secret: ${secretName}`);
    return secretValue;
  } catch (error) {
    console.error(`Error fetching secret ${secretName}:`, error);
    return null;
  }
}

// --- Helper: Log Failure ---
// (Assuming this helper exists or is added, similar to generate-recurring-tasks function)
async function logFailure(
  client: SupabaseClient,
  jobName: string,
  payload: Record<string, unknown> | null, // Use Record<string, unknown> instead of any
  error: Error,
) {
  console.error(`Logging failure for job ${jobName}:`, error.message);
  try {
    const { error: logInsertError } = await client
      .from('background_job_failures')
      .insert({
        job_name: jobName,
        payload: payload ? JSON.parse(JSON.stringify(payload)) : null,
        error_message: error.message,
        stack_trace: error.stack,
        status: 'logged',
      });
    if (logInsertError) {
      console.error(
        '!!! Failed to log failure to database:',
        logInsertError.message,
      );
    } else {
      console.log(`Failure logged successfully for job ${jobName}.`);
    }
  } catch (e) {
    const loggingErrorMessage = e instanceof Error
      ? e.message
      : 'Unknown error during logging';
    console.error(
      `!!! CRITICAL: Error occurred while trying to log job failure: ${loggingErrorMessage}`,
    );
  }
}

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
    // Path: /functions/v1/milestones/{milestoneId}
    // Path: /functions/v1/milestones/{milestoneId}/approve
    const pathParts = url.pathname.split('/').filter((part) => part);
    const milestoneId = pathParts[3];
    const action = pathParts[4]; // Check for 'approve'
    const projectId = url.searchParams.get('project_id'); // Allow filtering by project_id

    // Routing based on HTTP method and path
    switch (req.method) {
      case 'GET': {
        if (milestoneId) {
          // Implement GET /milestones/{id} (Get specific milestone details)
          console.log(
            `Fetching details for milestone ${milestoneId}, user ${user.id}`,
          );

          // Fetch the specific milestone with related data
          // RLS policy "Users can view milestones of their projects" should enforce access
          const { data: milestone, error: milestoneError } =
            await supabaseClient
              .from('milestones')
              .select(`
              *,
              user_profiles ( full_name )
            `)
              .eq('id', milestoneId)
              .maybeSingle(); // Use maybeSingle for potential 404

          if (milestoneError) {
            console.error(
              `Error fetching milestone ${milestoneId}:`,
              milestoneError.message,
            );
            throw milestoneError;
          }

          if (!milestone) {
            console.log(
              `Milestone ${milestoneId} not found or access denied for user ${user.id}`,
            );
            return createNotFoundResponse(
              'Milestone not found or access denied',
            );
          }

          // Format response similar to the list endpoint
          const milestoneDetails = {
            ...milestone,
            signed_off_by_name: milestone.user_profiles?.full_name,
            user_profiles: undefined, // Remove nested object
          };

          console.log(`Successfully fetched milestone ${milestoneId}`);
          return new Response(JSON.stringify(milestoneDetails), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } else if (projectId) {
          // Implement GET /milestones?project_id={projectId} (List milestones for a project)
          console.log(
            `Fetching milestones for project ${projectId}, user ${user.id}`,
          );

          // Check if user can access the project first (RLS on milestones depends on project access)
          const { data: projectCheck, error: projectCheckError } =
            await supabaseClient
              .from('projects')
              .select('id, company_id') // Need company_id for RLS check on milestones potentially
              .eq('id', projectId)
              .maybeSingle(); // RLS on projects table will apply here

          if (projectCheckError) throw projectCheckError;
          if (!projectCheck) {
            console.log(
              `Project ${projectId} not found or access denied for user ${user.id}`,
            );
            return createNotFoundResponse('Project not found or access denied');
          }

          // Fetch milestones for the specified project
          // RLS policy "Users can view milestones of their projects" should enforce access
          const { data: milestones, error: milestonesError } =
            await supabaseClient
              .from('milestones')
              .select(`
              *,
              user_profiles ( full_name )
            `)
              .eq('project_id', projectId)
              .order('order', { ascending: true }); // Order by the 'order' column

          if (milestonesError) {
            console.error(
              `Error fetching milestones for project ${projectId}:`,
              milestonesError.message,
            );
            throw milestonesError;
          }

          // Format response
          const milestonesList = milestones?.map((m) => ({
            ...m,
            signed_off_by_name: m.user_profiles?.full_name,
            user_profiles: undefined, // Remove nested object
          })) || [];

          console.log(
            `Found ${milestonesList.length} milestones for project ${projectId}`,
          );
          return new Response(JSON.stringify(milestonesList), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } else {
          // Require project_id for listing.
          return createBadRequestResponse(
            'project_id query parameter is required',
          );
        }
      }
      case 'POST': {
        // Check if this is an approval request: POST /milestones/{id}/approve
        if (milestoneId && action === 'approve') {
          console.log(
            `Attempting to approve milestone ${milestoneId}, requested by user ${user.id}`,
          );

          // --- Fetch milestone's project/company for permission check ---
          const { data: milestoneToCheck, error: checkError } =
            await supabaseClient
              .from('milestones')
              .select('sign_off_required, project_id, projects ( company_id )')
              .eq('id', milestoneId)
              .single();

          // Use type assertion for nested join result
          const projectCompanyId =
            (milestoneToCheck?.projects as { company_id: string })?.company_id;

          if (checkError || !projectCompanyId) {
            console.error(
              `Error fetching milestone ${milestoneId} for approval check or company ID missing:`,
              checkError?.message,
            );
            return createNotFoundResponse(
              'Milestone or associated project/company not found',
            );
          }

          if (!milestoneToCheck.sign_off_required) {
            console.warn(`Milestone ${milestoneId} does not require sign-off.`);
            return createBadRequestResponse(
              'Milestone does not require sign-off',
            );
          }
          // --- End Fetch ---

          // --- Permission Check: User needs 'milestone:approve' ---
          const { data: hasPermission, error: permissionError } =
            await supabaseClient.rpc(
              'has_permission',
              {
                user_id: user.id,
                company_id: projectCompanyId,
                permission_key: 'milestone:approve',
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
              `User ${user.id} not authorized to approve milestone ${milestoneId} in project ${milestoneToCheck.project_id}.`,
            );
            return createForbiddenResponse(
              'Not authorized to approve this milestone',
            );
          }
          // --- End Permission Check ---

          // --- Update Milestone Status ---
          const { data: approvedMilestone, error: approveError } =
            await supabaseClient
              .from('milestones')
              .update({
                status: 'Approved',
                signed_off_by_user_id: user.id,
                signed_off_at: new Date().toISOString(),
              })
              .eq('id', milestoneId)
              .select()
              .single();

          if (approveError) {
            console.error(
              `Error approving milestone ${milestoneId}:`,
              approveError.message,
            );
            throw new Error(
              `Failed to approve milestone: ${approveError.message}`,
            );
          }
          // --- End Update ---

          console.log(
            `Successfully approved milestone ${milestoneId} by user ${user.id}`,
          );

          // --- Trigger Notification ---
          try {
            // Fetch details needed for notification
            const { data: notifyData, error: notifyFetchError } =
              await supabaseClient
                .from('milestones')
                .select(`
                name,
                projects ( name, project_owner_id, user_profiles ( email ) )
              `)
                .eq('id', milestoneId)
                .single();

            if (notifyFetchError || !notifyData) {
              throw new Error(
                `Failed to fetch data for notification: ${notifyFetchError?.message}`,
              );
            }

            const milestoneName = notifyData.name;
            const projectName = notifyData.projects?.name;
            const projectOwnerId = notifyData.projects?.project_owner_id;
            const projectOwnerEmail = notifyData.projects?.user_profiles?.email;
            const approverName =
              (await supabaseClient.from('user_profiles').select('full_name')
                .eq('user_id', user.id).single()).data?.full_name || 'Someone';

            if (
              projectOwnerId && projectOwnerEmail && projectOwnerId !== user.id
            ) { // Don't notify if approver is owner
              const notificationSubject =
                `Milestone Approved: ${milestoneName} in ${projectName}`;
              const notificationMessage =
                `${approverName} approved the milestone "${milestoneName}" in project "${projectName}".`;

              const internalAuthSecret = await getSecret(
                supabaseClient,
                'INTERNAL_FUNCTION_SECRET',
              );
              if (!internalAuthSecret) {
                throw new Error(
                  'Internal function secret not configured for notifications.',
                );
              }

              const notificationPayload = {
                recipients: [{ email: projectOwnerEmail }],
                type: 'email',
                subject: notificationSubject,
                message: notificationMessage,
                context: {
                  trigger: 'milestone_approved',
                  milestone_id: milestoneId,
                  project_id: milestoneToCheck.project_id,
                  approver_user_id: user.id,
                },
              };

              const functionUrl = `${
                Deno.env.get('SUPABASE_URL')
              }/functions/v1/send-notification`;
              const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${internalAuthSecret}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(notificationPayload),
              });

              if (!response.ok) {
                console.error(
                  `Failed to send milestone approval notification: ${response.status} ${await response
                    .text()}`,
                );
                // Log failure but don't fail the main request
                await logFailure(
                  supabaseClient,
                  'milestone-approval-notification',
                  notificationPayload,
                  new Error(
                    `Notification function failed with status ${response.status}`,
                  ),
                );
              } else {
                console.log(
                  `Milestone approval notification sent successfully to ${projectOwnerEmail}.`,
                );
              }
            } else {
              console.log(
                `Skipping notification for milestone ${milestoneId} (No owner, owner has no email, or approver is owner).`,
              );
            }
          } catch (notifyError) {
            console.error(
              `Error preparing or sending milestone approval notification for ${milestoneId}:`,
              notifyError.message,
            );
            // Log failure but don't fail the main request
            await logFailure(
              supabaseClient,
              'milestone-approval-notification',
              { milestoneId },
              notifyError,
            );
          }
          // --- End Notification ---
          return new Response(JSON.stringify(approvedMilestone), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else if (!milestoneId) {
          // This is POST /milestones (Create milestone)
          console.log(
            `Attempting to create a milestone, requested by user ${user.id}`,
          );

          // Parse request body
          // deno-lint-ignore no-explicit-any
          let newMilestoneData: any;
          try {
            newMilestoneData = await req.json();
            const errors: { [field: string]: string[] } = {};
            if (!newMilestoneData.name) {
              errors.name = ['Milestone name is required'];
            }
            if (!newMilestoneData.project_id) {
              errors.project_id = ['Project ID is required'];
            }

            // Validate status enum if provided
            const allowedStatuses = [
              'Pending',
              'In Progress',
              'Completed',
              'Approved',
              'Rejected',
            ];
            if (
              newMilestoneData.status &&
              !allowedStatuses.includes(newMilestoneData.status)
            ) {
              errors.status = [
                `Status must be one of: ${allowedStatuses.join(', ')}`,
              ];
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
          const targetProjectId = newMilestoneData.project_id;

          // Fetch project company_id for permission check
          const { data: projectToCheck, error: checkError } =
            await supabaseClient
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

          // Permission check: User with 'milestone:manage'
          const { data: hasPermission, error: permissionError } =
            await supabaseClient.rpc(
              'has_permission',
              {
                user_id: user.id,
                company_id: projectCompanyId,
                permission_key: 'milestone:manage',
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
              `User ${user.id} not authorized to create milestones for project ${targetProjectId}.`,
            );
            return createForbiddenResponse(
              'Not authorized to create milestones for this project',
            );
          }

          // Insert new milestone
          const { data: createdMilestone, error: insertError } =
            await supabaseClient
              .from('milestones')
              .insert({
                project_id: targetProjectId,
                name: newMilestoneData.name,
                description: newMilestoneData.description, // Optional
                due_date: newMilestoneData.due_date, // Optional
                status: newMilestoneData.status || 'Pending', // Default
                order: newMilestoneData.order || 0, // Default
                sign_off_required: newMilestoneData.sign_off_required || false, // Default
                approval_id: newMilestoneData.approval_id, // Optional
                // signed_off fields are typically updated via PUT/PATCH
              })
              .select()
              .single();

          if (insertError) {
            console.error('Error creating milestone:', insertError.message);

            // Handle specific database errors
            if (insertError.code === '23503') { // Foreign key violation
              const constraint = insertError.message.includes('project_id')
                ? 'project_id'
                : insertError.message.includes('approval_id')
                ? 'approval_id'
                : 'unknown foreign key';
              return createBadRequestResponse(
                `Invalid reference: ${constraint} refers to a record that doesn't exist`,
              );
            } else if (insertError.code === '23505') { // Unique constraint violation
              return createConflictResponse(
                'A milestone with this name already exists in this project',
              );
            } else if (insertError.code === '23514') { // Check constraint violation
              return createBadRequestResponse(
                `Invalid field value: ${insertError.message}`,
              );
            } else if (insertError.code === '23502') { // Not null violation
              const columnMatch = insertError.message.match(
                /null value in column "(.+?)"/,
              );
              const column = columnMatch ? columnMatch[1] : 'unknown';
              return createBadRequestResponse(
                `The ${column} field is required.`,
              );
            }
            throw insertError;
          }

          console.log(
            `Successfully created milestone ${createdMilestone.id} for project ${targetProjectId}`,
          );
          return new Response(JSON.stringify(createdMilestone), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 201, // Created
          });
        } else {
          // Invalid POST path (e.g., /milestones/{id} without /approve)
          return createMethodNotAllowedResponse(
            'Method Not Allowed for this path',
          );
        }
      }
      case 'PUT': {
        if (!milestoneId) {
          return createBadRequestResponse('Milestone ID missing in URL');
        }
        console.log(
          `Attempting to update milestone ${milestoneId}, requested by user ${user.id}`,
        );

        // Fetch milestone's project and company for permission check
        const { data: milestoneToCheck, error: checkError } =
          await supabaseClient
            .from('milestones')
            .select('project_id, projects ( company_id )')
            .eq('id', milestoneId)
            .single();

        // Use type assertion for nested join result
        const projectCompanyId =
          (milestoneToCheck?.projects as { company_id: string })?.company_id;

        if (checkError || !projectCompanyId) {
          console.error(
            `Error fetching milestone ${milestoneId} for permission check or milestone/project/company not found:`,
            checkError?.message,
          );
          return createNotFoundResponse(
            'Milestone or associated project/company not found',
          );
        }

        // Permission check: User with 'milestone:manage'
        const { data: hasPermission, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'milestone:manage',
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
            `User ${user.id} not authorized to update milestone ${milestoneId} in project ${milestoneToCheck.project_id}.`,
          );
          return createForbiddenResponse(
            'Not authorized to update this milestone',
          );
        }

        // Parse request body
        // deno-lint-ignore no-explicit-any
        let updateData: any;
        try {
          updateData = await req.json();
          if (Object.keys(updateData).length === 0) {
            throw new Error('No update data provided');
          }

          // Validate status enum if provided
          const allowedStatuses = [
            'Pending',
            'In Progress',
            'Completed',
            'Approved',
            'Rejected',
          ];
          if (
            updateData.status && !allowedStatuses.includes(updateData.status)
          ) {
            throw new Error(
              `Status must be one of: ${allowedStatuses.join(', ')}`,
            );
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
          description: updateData.description,
          due_date: updateData.due_date,
          status: updateData.status,
          order: updateData.order,
          sign_off_required: updateData.sign_off_required,
          signed_off_by_user_id: updateData.signed_off_by_user_id,
          signed_off_at: updateData.signed_off_at,
          approval_id: updateData.approval_id,
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

        // --- Sign-off Workflow Check ---
        // If user tries to set status to 'Completed' AND sign-off is required, prevent direct status update.
        if (allowedUpdates.status === 'Completed') {
          // Fetch the current milestone state to check sign_off_required
          const { data: currentMilestone, error: currentFetchError } =
            await supabaseClient
              .from('milestones')
              .select('sign_off_required')
              .eq('id', milestoneId)
              .single();

          if (currentFetchError) {
            console.error(
              `Error fetching current milestone ${milestoneId} state for sign-off check:`,
              currentFetchError.message,
            );
            throw new Error(
              `Failed to verify sign-off requirement: ${currentFetchError.message}`,
            );
          }

          if (currentMilestone.sign_off_required) {
            console.log(
              `Milestone ${milestoneId} requires sign-off. Preventing direct update to 'Completed'. Status will remain unchanged by this PUT request.`,
            );
            delete allowedUpdates.status;
            // TODO(notification): Trigger notification/approval process if status was being changed *to* something needing approval later (e.g., 'Pending Approval').
          }
        }
        // --- End Sign-off Workflow Check ---

        // Proceed with update only if there are still fields left to update
        if (Object.keys(allowedUpdates).length === 0) {
          console.log(
            `No valid fields remaining to update for milestone ${milestoneId} after sign-off check.`,
          );
          // Fetch the current state to return it, as nothing changed.
          const { data: currentMilestoneData, error: fetchError } =
            await supabaseClient
              .from('milestones')
              .select('*') // Select all to return consistent data
              .eq('id', milestoneId)
              .single();
          if (fetchError || !currentMilestoneData) {
            return createNotFoundResponse(
              'Milestone not found after no-op update check',
            );
          }
          return new Response(JSON.stringify(currentMilestoneData), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Update the milestone with remaining allowed fields
        const { data: updatedMilestone, error: updateError } =
          await supabaseClient
            .from('milestones')
            .update(allowedUpdates)
            .eq('id', milestoneId)
            .select()
            .single(); // RLS should also prevent unauthorized updates

        if (updateError) {
          console.error(
            `Error updating milestone ${milestoneId}:`,
            updateError.message,
          );
          // Handle specific errors
          if (updateError.code === 'PGRST204') { // No rows updated/selected
            return createNotFoundResponse(
              'Milestone not found or update failed',
            );
          } else if (updateError.code === '23503') { // Foreign key violation
            const constraint = updateError.message.includes('approval_id')
              ? 'approval_id'
              : updateError.message.includes('signed_off_by_user_id')
              ? 'signed_off_by_user_id'
              : 'unknown foreign key';
            return createBadRequestResponse(
              `Invalid reference: ${constraint} refers to a record that doesn't exist`,
            );
          } else if (updateError.code === '23505') { // Unique constraint violation
            return createConflictResponse(
              'A milestone with this name already exists in this project',
            );
          } else if (updateError.code === '23514') { // Check constraint violation
            return createBadRequestResponse(
              `Invalid field value: ${updateError.message}`,
            );
          }
          throw updateError;
        }

        console.log(`Successfully updated milestone ${milestoneId}`);
        return new Response(JSON.stringify(updatedMilestone), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      case 'DELETE': {
        if (!milestoneId) {
          return createBadRequestResponse('Milestone ID missing in URL');
        }
        console.log(
          `Attempting to delete milestone ${milestoneId}, requested by user ${user.id}`,
        );

        // Fetch milestone's project and company for permission check
        const { data: milestoneToCheck, error: checkError } =
          await supabaseClient
            .from('milestones')
            .select('project_id, projects ( company_id )')
            .eq('id', milestoneId)
            .single();

        // Use type assertion for nested join result
        const projectCompanyId =
          (milestoneToCheck?.projects as { company_id: string })?.company_id;

        if (checkError || !projectCompanyId) {
          console.error(
            `Error fetching milestone ${milestoneId} for permission check or milestone/project/company not found:`,
            checkError?.message,
          );
          return createNotFoundResponse(
            'Milestone or associated project/company not found',
          );
        }

        // Permission check: User with 'milestone:manage'
        const { data: hasPermission, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'milestone:manage',
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
            `User ${user.id} not authorized to delete milestone ${milestoneId} in project ${milestoneToCheck.project_id}.`,
          );
          return createForbiddenResponse(
            'Not authorized to delete this milestone',
          );
        }

        // Delete the milestone
        const { error: deleteError } = await supabaseClient
          .from('milestones')
          .delete()
          .eq('id', milestoneId);

        if (deleteError) {
          console.error(
            `Error deleting milestone ${milestoneId}:`,
            deleteError.message,
          );
          // Handle specific database errors
          if (deleteError.code === 'PGRST204') { // No rows deleted
            return createNotFoundResponse(
              'Milestone not found or already deleted',
            );
          } else if (deleteError.code === '23503') { // Foreign key violation
            return createConflictResponse(
              'Cannot delete this milestone because it is referenced by other records (like tasks). Remove all associated records first.',
            );
          }
          throw deleteError;
        }

        console.log(`Successfully deleted milestone ${milestoneId}`);
        return new Response(null, { // No content response
          headers: { ...corsHeaders },
          status: 204, // No Content
        });
      }
      default:
        console.warn(`Method ${req.method} not allowed for /milestones`);
        return createMethodNotAllowedResponse();
    }
  } catch (error) {
    // Use the standardized internal server error response
    return createInternalServerErrorResponse(undefined, error);
  }
});
