// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  createBadRequestResponse,
  createForbiddenResponse,
  createInternalServerErrorResponse,
  createMethodNotAllowedResponse,
  createUnauthorizedResponse,
  createValidationErrorResponse,
} from '../_shared/validation.ts';

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
  // Note: Direct access to vault.secrets requires elevated privileges.
  // This function assumes it's called by a client with appropriate rights (e.g., service_role).
  // Or, it needs to be adapted to call an RPC function that securely retrieves the secret.
  // For simplicity in this example, we assume direct access is possible (e.g., via service_role client).
  console.log(`Attempting to fetch secret: ${secretName}`);
  try {
    // This is a placeholder for the actual Vault access method.
    // Supabase client library doesn't directly expose Vault access.
    // You might need an RPC function or a different approach depending on your security model.
    // Example using a hypothetical RPC:
    /*
    const { data, error } = await client.rpc('get_decrypted_secret', { secret_name: secretName });
    if (error) throw error;
    return data;
    */
    // Using environment variables as a fallback/alternative for local dev or simpler setups:
    const secretValue = Deno.env.get(secretName);
    if (!secretValue) {
      console.warn(`Secret ${secretName} not found in environment variables.`);
      // In a real scenario, you'd fetch from Vault here.
      // Returning null indicates the secret wasn't found.
      return null;
    }
    console.log(`Successfully retrieved secret: ${secretName}`);
    return secretValue;
  } catch (error) {
    console.error(
      `Error fetching secret ${secretName}:`,
      error instanceof Error ? error.message : error,
    );
    return null; // Indicate failure to retrieve
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
    // TODO: Add validation for recipient details (e.g., valid email format)

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
        // TODO: Log detailed failure to background_job_failures or similar
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
        // TODO: Log detailed failure
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
