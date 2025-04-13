// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  createBadRequestResponse,
  // createForbiddenResponse, // Removed unused import
  createInternalServerErrorResponse,
  createMethodNotAllowedResponse,
  createUnauthorizedResponse,
  createValidationErrorResponse,
} from '../_shared/validation.ts';
import { validateEmail } from '../_shared/validation.ts'; // Import email validator

console.log('Send Notification function started');

// --- Interfaces ---
interface NotificationRecipient {
  email?: string; // For email notifications
  slackUserId?: string; // For direct Slack messages
  slackChannel?: string; // For Slack channel messages
}

interface NotificationPayload {
  recipients: NotificationRecipient[];
  subject?: string; // Required for email
  message: string; // Main content (can be plain text or markdown/html depending on channel)
  type: 'email' | 'slack' | 'both'; // Channel type
  context?: Record<string, any>; // Optional context for logging or advanced templating
}

// --- Helper: Get Secret from Vault ---
async function getSecret(
  client: SupabaseClient,
  secretName: string,
): Promise<string | null> {
  console.log(`Attempting to fetch secret via RPC: ${secretName}`);
  try {
    const { data: secretValue, error: rpcError } = await client.rpc(
      'get_decrypted_secret',
      { p_secret_name: secretName },
    );
    if (rpcError) {
      console.error(
        `Error fetching secret ${secretName} via RPC:`,
        rpcError.message,
      );
      return null;
    }
    if (!secretValue) {
      console.warn(`Secret ${secretName} not found via RPC.`);
      return null;
    }
    console.log(`Successfully retrieved secret via RPC: ${secretName}`);
    return secretValue as string;
  } catch (error) {
    console.error(
      `Unexpected error fetching secret ${secretName}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

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

// --- Main Handler ---
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return createMethodNotAllowedResponse();
  }

  // --- Internal Authentication ---
  // This function should ideally be called internally (e.g., by triggers or other functions)
  // using a service role key or a shared secret for authentication.
  let internalAuthSecret: string | null = null;
  let supabaseAdminClient: SupabaseClient | null = null; // Use admin client for Vault access

  try {
    // Initialize admin client (needed for potential Vault access)
    supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // Use Service Role Key
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    internalAuthSecret = await getSecret(
      supabaseAdminClient,
      'INTERNAL_FUNCTION_SECRET',
    );
    if (!internalAuthSecret) {
      console.error('INTERNAL_FUNCTION_SECRET is not configured.');
      return createInternalServerErrorResponse(
        'Internal function secret not configured.',
      );
    }

    const authorizationHeader = req.headers.get('Authorization');
    if (
      !authorizationHeader ||
      authorizationHeader !== `Bearer ${internalAuthSecret}`
    ) {
      console.warn(
        'Unauthorized attempt to call internal notification function.',
      );
      return createUnauthorizedResponse('Invalid internal authorization');
    }
  } catch (e) {
    const authErrorMessage = e instanceof Error
      ? e.message
      : 'Unknown error during internal auth setup';
    console.error('Internal Auth Setup Error:', authErrorMessage);
    return createInternalServerErrorResponse(
      `Internal Server Error: ${authErrorMessage}`,
    );
  }

  // --- Request Parsing and Validation ---
  let payload: NotificationPayload;
  try {
    payload = await req.json();
    const errors: { [field: string]: string[] } = {};
    if (!payload.recipients || payload.recipients.length === 0) {
      errors.recipients = ['At least one recipient is required'];
    }
    if (!payload.message) errors.message = ['Message content is required'];
    if (!payload.type || !['email', 'slack', 'both'].includes(payload.type)) {
      errors.type = ['Invalid notification type specified'];
    }
    if (
      (payload.type === 'email' || payload.type === 'both') && !payload.subject
    ) {
      errors.subject = ['Subject is required for email notifications'];
    }
    // Validate recipient details
    payload.recipients.forEach((recipient, index) => {
      if (
        (payload.type === 'email' || payload.type === 'both') &&
        recipient.email
      ) {
        const emailErrors: ValidationErrors = {};
        validateEmail(recipient.email, `recipients[${index}].email`, emailErrors);
        if (Object.keys(emailErrors).length > 0) {
          errors[`recipients[${index}].email`] =
            emailErrors[`recipients[${index}].email`];
        }
      }
      // Add similar validation for Slack IDs/Channels if needed
    });

    if (Object.keys(errors).length > 0) {
      return createValidationErrorResponse(errors);
    }
  } catch (e) {
    const parseErrorMessage = e instanceof Error
      ? e.message
      : 'Invalid JSON body';
    return createBadRequestResponse(parseErrorMessage);
  }

  console.log(
    `Processing notification request - Type: ${payload.type}, Recipients: ${payload.recipients.length}`,
  );

  // --- Fetch Secrets ---
  // Use the admin client initialized earlier
  const resendApiKey = payload.type === 'email' || payload.type === 'both'
    ? await getSecret(supabaseAdminClient, 'RESEND_API_KEY')
    : null;
  const slackToken = payload.type === 'slack' || payload.type === 'both'
    ? await getSecret(supabaseAdminClient, 'SLACK_BOT_TOKEN') // Or SLACK_WEBHOOK_URL
    : null;

  if ((payload.type === 'email' || payload.type === 'both') && !resendApiKey) {
    console.error('Resend API Key is missing.');
    return createInternalServerErrorResponse('Resend configuration missing.');
  }
  if ((payload.type === 'slack' || payload.type === 'both') && !slackToken) {
    console.error('Slack Token/Webhook URL is missing.');
    return createInternalServerErrorResponse('Slack configuration missing.');
  }

  // --- Process Notifications ---
  const results = {
    email: { sent: 0, failed: 0 },
    slack: { sent: 0, failed: 0 },
  };

  for (const recipient of payload.recipients) {
    // --- Send Email (if applicable) ---
    if (
      (payload.type === 'email' || payload.type === 'both') &&
      recipient.email &&
      resendApiKey
    ) {
      try {
        console.log(`Attempting to send email to: ${recipient.email}`);
        const resendPayload = {
          from: Deno.env.get('RESEND_FROM_EMAIL') ||
            'ZPortal <noreply@yourdomain.com>', // Configure sender email
          to: [recipient.email],
          subject: payload.subject!,
          html: payload.message, // Assuming message is HTML for email
          // text: plainTextMessage, // Optional plain text version
        };

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(resendPayload),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            `Resend API error: ${response.status} ${response.statusText} - ${errorBody}`,
          );
        }
        console.log(`Email sent successfully to: ${recipient.email}`);
        results.email.sent++;
      } catch (error) {
        console.error(
          `Failed to send email to ${recipient.email}:`,
          error instanceof Error ? error.message : error,
        );
        results.email.failed++;
        await logFailure(
          supabaseAdminClient,
          'send-notification-email',
          { recipient: recipient.email, subject: payload.subject },
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }

    // --- Send Slack (if applicable) ---
    if (
      (payload.type === 'slack' || payload.type === 'both') && slackToken &&
      (recipient.slackUserId || recipient.slackChannel)
    ) {
      const target = recipient.slackChannel || recipient.slackUserId;
      try {
        console.log(`Attempting to send Slack message to: ${target}`);
        // Use chat.postMessage for users/channels
        const slackPayload = {
          channel: target!, // User ID or Channel ID
          text: payload.message, // Assuming plain text for Slack basic message
          // blocks: [], // Optional: Use Block Kit for richer messages
        };

        const response = await fetch(
          'https://slack.com/api/chat.postMessage',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${slackToken}`,
              'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify(slackPayload),
          },
        );

        const responseData = await response.json();
        if (!response.ok || !responseData.ok) {
          throw new Error(
            `Slack API error: ${response.status} - ${
              responseData.error || await response.text()
            }`,
          );
        }
        console.log(`Slack message sent successfully to: ${target}`);
        results.slack.sent++;
      } catch (error) {
        console.error(
          `Failed to send Slack message to ${target}:`,
          error instanceof Error ? error.message : error,
        );
        results.slack.failed++;
        await logFailure(
          supabaseAdminClient,
          'send-notification-slack',
          { recipient: target },
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
  }

  console.log('Notification processing complete:', results);

  // --- Return Response ---
  // Decide on appropriate success response (e.g., summary or just 200 OK)
  return new Response(
    JSON.stringify({
      message: 'Notifications processed.',
      results: results,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
});
