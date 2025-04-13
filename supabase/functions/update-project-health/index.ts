// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { createInternalServerErrorResponse } from '../_shared/validation.ts';

console.log('Update Project Health function started');

// --- Helper: Log Failure ---
async function logFailure(
  client: SupabaseClient,
  jobName: string,
  payload: any | null,
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

serve(async (_req) => {
  console.log('Received request to update project health...');

  // --- Client Setup (using Service Role Key) ---
  let supabaseAdminClient: SupabaseClient;
  try {
    supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  } catch (e) {
    const setupErrorMessage = e instanceof Error
      ? e.message
      : 'Admin client setup error';
    console.error('Admin Client Setup Error:', setupErrorMessage);
    return createInternalServerErrorResponse(setupErrorMessage);
  }

  // --- Main Logic ---
  let updatedCount = 0;
  let errorCount = 0;
  try {
    // 1. Fetch active projects (or projects needing update)
    const { data: projects, error: fetchError } = await supabaseAdminClient
      .from('projects')
      .select('id, name, health_status')
      .in('status', ['Planning', 'Active']); // Only update active/planning projects

    if (fetchError) throw fetchError;
    if (!projects || projects.length === 0) {
      console.log('No active projects found to update health.');
      return new Response(JSON.stringify({ message: 'No projects to update' }), {
        status: 200,
      });
    }

    console.log(`Found ${projects.length} projects to process.`);

    // 2. Loop through projects, calculate health, and update
    for (const project of projects) {
      try {
        const { data: newHealth, error: rpcError } = await supabaseAdminClient
          .rpc('calculate_project_health', { p_project_id: project.id });

        if (rpcError) {
          throw new Error(
            `RPC calculate_project_health failed for project ${project.id}: ${rpcError.message}`,
          );
        }

        if (newHealth && newHealth !== project.health_status) {
          console.log(
            `Updating health for project ${project.id} (${project.name}) from ${project.health_status} to ${newHealth}`,
          );
          const { error: updateError } = await supabaseAdminClient
            .from('projects')
            .update({ health_status: newHealth })
            .eq('id', project.id);

          if (updateError) {
            throw new Error(
              `Failed to update health for project ${project.id}: ${updateError.message}`,
            );
          }
          updatedCount++;
        } else {
          console.log(
            `Health for project ${project.id} (${project.name}) remains ${project.health_status}.`,
          );
        }
      } catch (projectError) {
        console.error(
          `Error processing project ${project.id}:`,
          projectError.message,
        );
        errorCount++;
        await logFailure(
          supabaseAdminClient,
          'update-project-health',
          { project_id: project.id },
          projectError,
        );
        // Continue to next project
      }
    }

    const summary =
      `Project health update complete. Updated: ${updatedCount}, Errors: ${errorCount}.`;
    console.log(summary);
    return new Response(JSON.stringify({ message: summary }), { status: 200 });
  } catch (error) {
    const processErrorMessage = error instanceof Error
      ? error.message
      : 'Unknown error during project health update';
    console.error('Project Health Update Error:', processErrorMessage, error);
    await logFailure(
      supabaseAdminClient,
      'update-project-health',
      null,
      error instanceof Error ? error : new Error(String(error)),
    );
    return createInternalServerErrorResponse(processErrorMessage, error);
  }
});
