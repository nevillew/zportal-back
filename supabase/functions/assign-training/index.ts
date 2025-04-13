// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { createInternalServerErrorResponse } from '../_shared/validation.ts';

console.log('Assign Training function started');

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
  console.log('Received request to assign training based on rules...');

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
  let assignedCount = 0;
  let errorCount = 0;
  try {
    // 1. Fetch active assignment rules
    const { data: rules, error: rulesError } = await supabaseAdminClient
      .from('training_assignment_rules')
      .select('id, company_id, role_name, course_id')
      .eq('is_active', true);

    if (rulesError) throw rulesError;
    if (!rules || rules.length === 0) {
      console.log('No active training assignment rules found.');
      return new Response(JSON.stringify({ message: 'No rules found' }), {
        status: 200,
      });
    }

    console.log(`Processing ${rules.length} active assignment rules.`);

    // 2. Fetch all active company users and their roles
    //    (Could be optimized by fetching users per rule, but simpler this way for now)
    const { data: users, error: usersError } = await supabaseAdminClient
      .from('company_users')
      .select('user_id, company_id, role')
      .eq('user_profiles.is_active', true); // Join implicitly via FK

    if (usersError) throw usersError;
    if (!users || users.length === 0) {
      console.log('No active company users found.');
      return new Response(JSON.stringify({ message: 'No active users' }), {
        status: 200,
      });
    }

    // 3. Fetch existing assignments to avoid duplicates
    const { data: existingAssignments, error: existingError } =
      await supabaseAdminClient
        .from('course_assignments')
        .select('user_id, company_id, course_id');

    if (existingError) throw existingError;
    const existingSet = new Set(
      existingAssignments?.map((a) =>
        `${a.user_id}-${a.company_id}-${a.course_id}`
      ) || [],
    );

    // 4. Determine assignments to create
    const assignmentsToCreate: any[] = [];
    for (const rule of rules) {
      for (const user of users) {
        // Check if rule applies to this user
        const companyMatch = !rule.company_id ||
          rule.company_id === user.company_id;
        const roleMatch = !rule.role_name || rule.role_name === user.role;

        if (companyMatch && roleMatch) {
          const assignmentKey =
            `${user.user_id}-${user.company_id}-${rule.course_id}`;
          if (!existingSet.has(assignmentKey)) {
            assignmentsToCreate.push({
              user_id: user.user_id,
              company_id: user.company_id,
              course_id: rule.course_id,
              // assigned_at defaults to now()
            });
            existingSet.add(assignmentKey); // Prevent duplicates within this run
          }
        }
      }
    }

    // 5. Bulk insert new assignments
    if (assignmentsToCreate.length > 0) {
      console.log(`Attempting to insert ${assignmentsToCreate.length} new course assignments...`);
      const { error: insertError } = await supabaseAdminClient
        .from('course_assignments')
        .insert(assignmentsToCreate);

      if (insertError) {
        // Log error but don't necessarily fail the whole job if some inserts worked before error
        console.error('Error bulk inserting assignments:', insertError.message);
        errorCount++; // Increment error count
        await logFailure(
          supabaseAdminClient,
          'assign-training',
          { failed_inserts: assignmentsToCreate.length },
          insertError,
        );
        // Continue processing if possible, or re-throw based on error type
      } else {
        assignedCount = assignmentsToCreate.length;
        console.log(`Successfully inserted ${assignedCount} new assignments.`);
      }
    } else {
      console.log('No new assignments needed based on current rules and users.');
    }

    const summary =
      `Training assignment complete. Created: ${assignedCount}, Errors: ${errorCount}.`;
    console.log(summary);
    return new Response(JSON.stringify({ message: summary }), { status: 200 });
  } catch (error) {
    const processErrorMessage = error instanceof Error
      ? error.message
      : 'Unknown error during training assignment';
    console.error('Training Assignment Error:', processErrorMessage, error);
    await logFailure(
      supabaseAdminClient,
      'assign-training',
      null,
      error instanceof Error ? error : new Error(String(error)),
    );
    return createInternalServerErrorResponse(processErrorMessage, error);
  }
});
