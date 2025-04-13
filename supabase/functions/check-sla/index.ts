// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { createInternalServerErrorResponse } from '../_shared/validation.ts';

console.log('Check SLA function started');

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
  console.log('Received request to check task SLAs...');

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
  let breachedCount = 0;
  let errorCount = 0;
  try {
    // 1. Fetch tasks with SLA definitions that are not complete and not already breached
    const { data: tasks, error: fetchError } = await supabaseAdminClient
      .from('tasks')
      .select('id, name, created_at, sla_definition')
      .neq('status', 'Complete') // Not complete
      .eq('sla_breached', false) // Not already breached
      .not('sla_definition', 'is', null); // Has an SLA definition

    if (fetchError) throw fetchError;
    if (!tasks || tasks.length === 0) {
      console.log('No tasks found requiring SLA check.');
      return new Response(JSON.stringify({ message: 'No tasks to check' }), {
        status: 200,
      });
    }

    console.log(`Found ${tasks.length} tasks to check SLA for.`);
    const tasksToUpdate: string[] = [];
    const now = new Date();

    // 2. Loop through tasks and check SLA
    for (const task of tasks) {
      try {
        const slaDef = task.sla_definition as any; // Assuming JSONB structure
        const dueInHours = slaDef?.due_in_hours_from_creation;

        if (typeof dueInHours !== 'number' || dueInHours <= 0) {
          console.warn(
            `Task ${task.id} has invalid SLA definition: ${
              JSON.stringify(slaDef)
            }. Skipping.`,
          );
          continue;
        }

        const createdAt = new Date(task.created_at);
        const slaDueDate = new Date(
          createdAt.getTime() + dueInHours * 60 * 60 * 1000,
        );

        if (now > slaDueDate) {
          console.log(
            `SLA BREACHED for task ${task.id} (${task.name}). Due: ${slaDueDate.toISOString()}, Now: ${now.toISOString()}`,
          );
          tasksToUpdate.push(task.id);
          // TODO: Trigger notification about SLA breach?
        }
      } catch (taskError) {
        console.error(
          `Error processing SLA for task ${task.id}:`,
          taskError.message,
        );
        errorCount++;
        await logFailure(
          supabaseAdminClient,
          'check-sla-task',
          { task_id: task.id, sla_definition: task.sla_definition },
          taskError,
        );
        // Continue to next task
      }
    }

    // 3. Bulk update breached tasks
    if (tasksToUpdate.length > 0) {
      console.log(`Updating ${tasksToUpdate.length} tasks as SLA breached...`);
      const { error: updateError } = await supabaseAdminClient
        .from('tasks')
        .update({ sla_breached: true })
        .in('id', tasksToUpdate);

      if (updateError) {
        console.error('Error updating SLA breached status:', updateError.message);
        errorCount += tasksToUpdate.length; // Count all as errors if bulk update fails
        await logFailure(
          supabaseAdminClient,
          'check-sla-update',
          { task_ids: tasksToUpdate },
          updateError,
        );
      } else {
        breachedCount = tasksToUpdate.length;
        console.log(`Successfully marked ${breachedCount} tasks as breached.`);
      }
    }

    const summary =
      `SLA check complete. Newly Breached: ${breachedCount}, Errors: ${errorCount}.`;
    console.log(summary);
    return new Response(JSON.stringify({ message: summary }), { status: 200 });
  } catch (error) {
    const processErrorMessage = error instanceof Error
      ? error.message
      : 'Unknown error during SLA check';
    console.error('SLA Check Error:', processErrorMessage, error);
    await logFailure(
      supabaseAdminClient,
      'check-sla',
      null,
      error instanceof Error ? error : new Error(String(error)),
    );
    return createInternalServerErrorResponse(processErrorMessage, error);
  }
});
