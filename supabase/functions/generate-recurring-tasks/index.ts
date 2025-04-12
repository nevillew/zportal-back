// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { RRule } from 'rrule-deno'; // Import the library

console.log('Generate Recurring Tasks function started');

// --- Main Handler (Triggered by Cron) ---
// Note: This function is designed to be triggered by pg_cron, not directly via HTTP.
// However, Supabase Functions require an HTTP server structure.
// We can add a check for a specific header or path if we want to prevent direct HTTP invocation.
serve(async (_req) => {
  console.log('Received request to generate recurring tasks...');

  // --- Client Setup (using Service Role Key for elevated privileges) ---
  let supabaseAdminClient: SupabaseClient;
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); // Use Service Role Key

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required.',
      );
    }

    supabaseAdminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    console.log('Admin client initialized.');
  } catch (e) {
    const setupErrorMessage = e instanceof Error
      ? e.message
      : 'Unknown error during setup';
    console.error(
      'Error initializing Supabase admin client:',
      setupErrorMessage,
    );
    // Log to background_job_failures table if possible, or just return error
    // await logFailure('generate-recurring-tasks', null, `Client setup error: ${setupErrorMessage}`);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error during setup' }),
      { status: 500 },
    );
  }

  // --- Main Logic ---
  try {
    console.log('Fetching recurring task definitions due for generation...');

    // 1. Fetch task definitions that are due
    const now = new Date().toISOString();
    const { data: definitions, error: fetchError } = await supabaseAdminClient
      .from('tasks')
      .select('*') // Select all fields needed for creating the instance
      .eq('is_recurring_definition', true)
      .lte('next_occurrence_date', now) // Due date is now or in the past
      .or(`recurrence_end_date.is.null,recurrence_end_date.gt.${now}`); // End date is null or in the future

    if (fetchError) {
      console.error(
        'Error fetching recurring definitions:',
        fetchError.message,
      );
      throw fetchError;
    }

    if (!definitions || definitions.length === 0) {
      console.log('No recurring tasks due for generation.');
      return new Response(JSON.stringify({ message: 'No tasks due' }), {
        status: 200,
      });
    }

    console.log(`Found ${definitions.length} definitions to process.`);
    let createdCount = 0;
    const tasksToInsert: any[] = [];
    const definitionsToUpdate: {
      id: string;
      next_occurrence_date: string | null;
    }[] = [];

    for (const definition of definitions) {
      console.log(`Processing definition ID: ${definition.id}`);
      if (!definition.recurrence_rule || !definition.next_occurrence_date) {
        console.warn(
          `Skipping definition ${definition.id} due to missing rule or next_occurrence_date.`,
        );
        continue;
      }

      // TODO(rrule): Implement robust RRULE parsing and date calculation, potentially handling edge cases.
      // This is a placeholder - replace with actual logic using rrule library or similar
      // Calculate the *next* occurrence date based on the *current* next_occurrence_date and the rule
      let nextOccurrence: Date | null = null;
      let subsequentOccurrence: Date | null = null;
      try {
        // --- RRULE Parsing Logic ---
        const ruleString = `DTSTART:${
          new Date(definition.next_occurrence_date).toISOString().replace(
            /[-:.]/g,
            '',
          )
        }\nRRULE:${definition.recurrence_rule}`;
        const rule = RRule.fromString(ruleString);

        // Get the current occurrence (which is definition.next_occurrence_date)
        // and the next one after it.
        const occurrences = rule.between(
          new Date(definition.next_occurrence_date), // Start date (inclusive)
          definition.recurrence_end_date
            ? new Date(definition.recurrence_end_date)
            : new Date(Date.now() + 365 * 10 * 24 * 60 * 60 * 1000), // End date (inclusive) or far future
          true, // Include start date
          (_date: Date, i: number) => i < 2, // Add types to callback parameters
        );

        if (occurrences.length > 0) {
          // The first occurrence is the one we are generating now
          nextOccurrence = occurrences[0];
        } else {
          console.warn(
            `RRule parsing did not yield the current occurrence for definition ${definition.id}. Skipping.`,
          );
          continue;
        }

        if (occurrences.length > 1) {
          // The second occurrence is the next one to schedule
          subsequentOccurrence = occurrences[1];
        } else {
          // No more occurrences found within the range or according to the rule count/until
          console.log(
            `Definition ${definition.id} has no subsequent occurrences.`,
          );
          subsequentOccurrence = null;
        }
        // --- End RRULE Parsing Logic ---
      } catch (parseError) {
        const parseErrorMessage = parseError instanceof Error
          ? parseError.message
          : 'Unknown error parsing RRULE';
        console.error(
          `Error parsing recurrence rule for definition ${definition.id}:`,
          parseErrorMessage,
        );
        // Log failure and continue to next definition
        await logFailure(
          supabaseAdminClient,
          'generate-recurring-tasks',
          definition,
          parseError,
        );
        continue;
      }

      if (nextOccurrence) {
        // Prepare the new task instance record
        tasksToInsert.push({
          section_id: definition.section_id,
          milestone_id: definition.milestone_id,
          task_template_id: definition.task_template_id, // Carry over template link if needed
          parent_task_id: definition.parent_task_id, // Carry over parent link if needed
          recurring_definition_task_id: definition.id, // Link back to definition
          name: definition.name, // Copy name (or potentially add date?)
          description: definition.description, // Copy description
          status: 'Open', // Default status for new instance
          order: definition.order, // Copy order? Or handle differently?
          due_date: nextOccurrence.toISOString(), // Set due date to the calculated occurrence
          assigned_to_id: definition.assigned_to_id, // Copy assignee
          depends_on_task_id: definition.depends_on_task_id, // Copy dependency
          condition: definition.condition, // Copy condition
          is_self_service: definition.is_self_service, // Copy flag
          estimated_effort_hours: definition.estimated_effort_hours, // Copy effort
          is_recurring_definition: false, // This is an instance, not a definition
          // custom_field_values would need separate handling if defaults should be copied
        });
        createdCount++;
      }

      // Prepare update for the definition's next_occurrence_date
      definitionsToUpdate.push({
        id: definition.id,
        next_occurrence_date: subsequentOccurrence
          ? subsequentOccurrence.toISOString()
          : null,
      });
    }

    // 2. Bulk insert new task instances
    if (tasksToInsert.length > 0) {
      console.log(`Inserting ${tasksToInsert.length} new task instances...`);
      const { error: insertError } = await supabaseAdminClient
        .from('tasks')
        .insert(tasksToInsert);

      if (insertError) {
        console.error(
          'Error bulk inserting task instances:',
          insertError.message,
        );
        // Don't update definition dates if insert failed
        throw insertError;
      }
      console.log('Successfully inserted task instances.');
    }

    // 3. Bulk update definition next_occurrence_dates
    if (definitionsToUpdate.length > 0) {
      console.log(
        `Updating ${definitionsToUpdate.length} definition next occurrence dates...`,
      );
      // Supabase doesn't have a direct bulk update based on different values per row easily via JS client.
      // Loop through updates or use an RPC function for better performance.
      for (const update of definitionsToUpdate) {
        const { error: updateError } = await supabaseAdminClient
          .from('tasks')
          .update({ next_occurrence_date: update.next_occurrence_date })
          .eq('id', update.id);
        if (updateError) {
          console.error(
            `Error updating next_occurrence_date for definition ${update.id}:`,
            updateError.message,
          );
          // Log failure but continue trying to update others
          await logFailure(
            supabaseAdminClient,
            'generate-recurring-tasks',
            update,
            updateError,
          );
        }
      }
      console.log('Finished updating definition dates.');
    }

    console.log(
      `Recurring task generation complete. Created ${createdCount} instances.`,
    );
    return new Response(
      JSON.stringify({ message: `Generated ${createdCount} task instances.` }),
      { status: 200 },
    );
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : 'Unknown internal server error during generation';
    console.error('Recurring Task Generation Error:', errorMessage);
    await logFailure(
      supabaseAdminClient,
      'generate-recurring-tasks',
      null,
      error,
    );
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, // Added headers
    });
  }
});

// --- Helper Function to Log Failures ---
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
        payload: payload ? JSON.parse(JSON.stringify(payload)) : null, // Ensure payload is serializable JSONB
        error_message: error.message,
        stack_trace: error.stack, // Optional: include stack trace
        status: 'logged', // Default status
      });

    if (logInsertError) {
      console.error(
        '!!! Failed to log background job failure to database:',
        logInsertError.message,
      );
    } else {
      console.log(`Failure logged successfully for job ${jobName}.`);
    }
  } catch (e) {
    // Catch errors during the logging process itself
    const loggingErrorMessage = e instanceof Error
      ? e.message
      : 'Unknown error during logging';
    console.error(
      `!!! CRITICAL: Error occurred while trying to log job failure: ${loggingErrorMessage}`,
    );
  }
}
