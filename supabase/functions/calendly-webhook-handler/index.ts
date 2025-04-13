// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  createBadRequestResponse,
  createInternalServerErrorResponse,
  createMethodNotAllowedResponse,
  createUnauthorizedResponse,
} from '../_shared/validation.ts';
import { timingSafeEqual } from 'https://deno.land/std@0.177.0/crypto/timing_safe_equal.ts';
import { encodeHex } from 'https://deno.land/std@0.177.0/encoding/hex.ts';

console.log('Calendly Webhook Handler function started');

// --- Helper: Get Secret from Vault ---
async function getSecret(
  client: SupabaseClient,
  secretName: string,
): Promise<string | null> {
  console.log(`Attempting to fetch secret via RPC: ${secretName}`);
  try {
    // Use the RPC function to fetch the secret
    const { data: secretValue, error: rpcError } = await client.rpc(
      'get_decrypted_secret',
      { p_secret_name: secretName },
    );

    if (rpcError) {
      console.error(
        `Error fetching secret ${secretName} via RPC:`,
        rpcError.message,
      );
      return null; // Indicate failure
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

// --- Helper: Verify Calendly Signature ---
// See: https://developer.calendly.com/webhook-signatures
async function verifySignature(
  secret: string,
  request: Request,
  rawBody: string,
): Promise<boolean> {
  const signatureHeader = request.headers.get('Calendly-Webhook-Signature');
  if (!signatureHeader) {
    console.warn('Missing Calendly-Webhook-Signature header');
    return false; // Reject if signature is missing
  }

  // Example format: t=1678816951,v1=7a37a087b11a56b5a864f5114a62f1a3a716b81a5e1e6f0b7b1f1e1e1e1e1e1e
  const parts = signatureHeader.split(',');
  const timestampPart = parts.find((part) => part.startsWith('t='));
  const signaturePart = parts.find((part) => part.startsWith('v1='));

  if (!timestampPart || !signaturePart) {
    console.warn('Invalid signature header format');
    return false;
  }

  const _timestamp = timestampPart.split('=')[1]; // Prefix unused variable
  const timestamp = timestampPart.split('=')[1];
  const signature = signaturePart.split('=')[1];

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(`${timestamp}.${rawBody}`);

    // Import the secret key
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false, // not extractable
      ['sign'],
    );

    // Sign the message
    const calculatedDigest = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      messageData,
    );

    // Encode the digest as a hex string
    const calculatedSignature = encodeHex(calculatedDigest);

    // Compare using timingSafeEqual
    const sig1 = encoder.encode(calculatedSignature);
    const sig2 = encoder.encode(signature);

    if (sig1.length !== sig2.length) {
      return false;
    }

    return timingSafeEqual(sig1, sig2);
  } catch (error) {
    console.error('Error during signature verification:', error);
    return false;
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
  // Handle CORS preflight requests (though likely not needed for webhooks)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return createMethodNotAllowedResponse();
  }

  // --- Client Setup (using Service Role Key) ---
  let supabaseAdminClient: SupabaseClient;
  try {
    supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // Use Service Role Key
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  } catch (e) {
    const setupErrorMessage = e instanceof Error
      ? e.message
      : 'Admin client setup error';
    console.error('Admin Client Setup Error:', setupErrorMessage);
    return createInternalServerErrorResponse(setupErrorMessage);
  }

  // --- Signature Verification ---
  let rawBody: string;
  try {
    rawBody = await req.text(); // Read body as text first for signature check
    const webhookSecret = await getSecret(
      supabaseAdminClient,
      'CALENDLY_WEBHOOK_SECRET',
    );
    if (!webhookSecret) {
      console.error('Calendly webhook secret not configured.');
      return createInternalServerErrorResponse(
        'Webhook secret not configured.',
      );
    }

    // Clone the request to read the body again as JSON later
    const reqClone = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(rawBody));
          controller.close();
        },
      }),
    });

    const isVerified = await verifySignature(webhookSecret, req, rawBody);
    if (!isVerified) {
      console.warn('Invalid Calendly webhook signature.');
      return createUnauthorizedResponse('Invalid signature');
    }
    console.log('Calendly webhook signature verified.');
    req = reqClone; // Use the cloned request for JSON parsing
  } catch (e) {
    const sigErrorMessage = e instanceof Error
      ? e.message
      : 'Error verifying signature';
    console.error('Signature Verification Error:', sigErrorMessage);
    return createBadRequestResponse(sigErrorMessage);
  }
  // --- End Signature Verification ---

  // --- Parse Payload ---
  let payload: any;
  try {
    payload = await req.json();
    if (!payload.event || !payload.payload) {
      throw new Error('Invalid Calendly payload structure');
    }
  } catch (e) {
    const parseErrorMessage = e instanceof Error
      ? e.message
      : 'Invalid JSON body';
    console.error('Payload Parsing Error:', parseErrorMessage);
    return createBadRequestResponse(parseErrorMessage);
  }

  const eventType = payload.event;
  const eventData = payload.payload;
  console.log(`Received Calendly event: ${eventType}`);

  // --- Process Event ---
  try {
    if (eventType === 'invitee.created') {
      console.log('Processing invitee.created event...');

      // Extract necessary data
      const eventUri = eventData.event?.uri;
      const inviteeUri = eventData.uri;
      const scheduledAt = eventData.scheduled_event?.start_time;
      const endTime = eventData.scheduled_event?.end_time;
      const eventName = eventData.scheduled_event?.name || 'Calendly Meeting';
      const attendees =
        eventData.scheduled_event?.event_memberships?.map((m: any) => ({
          email: m.user_email,
          name: m.user_name,
        })) || [];
      const questions = eventData.questions_and_answers || [];

      // --- Extract Context (Project/Company ID) ---
      // This relies on custom questions being configured in Calendly
      const projectIdAnswer = questions.find((q: any) =>
        q.question?.toLowerCase().includes('project id')
      )?.answer?.trim(); // Trim whitespace
      const companyIdAnswer = questions.find((q: any) =>
        q.question?.toLowerCase().includes('company id')
      )?.answer?.trim(); // Trim whitespace

      // UUID Validation Regex
      const uuidRegex =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

      let projectId: string | null = null;
      if (projectIdAnswer && uuidRegex.test(projectIdAnswer)) {
        projectId = projectIdAnswer;
      } else if (projectIdAnswer) {
        console.warn(
          `Invalid Project ID format received from Calendly: ${projectIdAnswer}`,
        );
        // Optionally return bad request or proceed without project ID
        // return createBadRequestResponse(`Invalid Project ID format: ${projectIdAnswer}`);
      }

      let companyId: string | null = null;
      if (companyIdAnswer && uuidRegex.test(companyIdAnswer)) {
        companyId = companyIdAnswer;
      } else if (companyIdAnswer) {
        console.warn(
          `Invalid Company ID format received from Calendly: ${companyIdAnswer}`,
        );
        // Optionally return bad request or proceed without company ID
        // return createBadRequestResponse(`Invalid Company ID format: ${companyIdAnswer}`);
      }

      // If project ID is present, derive company ID from it
      if (projectId && !companyId) {
        const { data: projectData, error: projError } =
          await supabaseAdminClient
            .from('projects')
            .select('company_id')
            .eq('id', projectId)
            .single();
        if (projError) {
          console.warn(
            `Could not fetch project ${projectId} to determine company ID: ${projError.message}`,
          );
        } else {
          companyId = projectData?.company_id;
        }
      }

      if (!companyId && !projectId) {
        console.warn(
          'Webhook payload missing project_id or company_id context. Cannot associate meeting.',
        );
        // Decide whether to still create the meeting without association or return an error
        // return createBadRequestResponse('Missing project or company context in webhook payload.');
      }
      // --- End Extract Context ---

      // Calculate duration
      let durationMinutes = null;
      if (scheduledAt && endTime) {
        durationMinutes = Math.round(
          (new Date(endTime).getTime() - new Date(scheduledAt).getTime()) /
            (1000 * 60),
        );
      }

      // Upsert meeting record
      const meetingRecord = {
        calendly_event_uri: eventUri,
        calendly_invitee_uri: inviteeUri, // Use invitee URI for potential uniqueness if multiple invitees per event
        name: eventName,
        type: eventName.toLowerCase().includes('discovery')
          ? 'discovery' // Simple type mapping based on name
          : eventName.toLowerCase().includes('solution')
          ? 'solution_walkthrough'
          : eventName.toLowerCase().includes('build')
          ? 'build_walkthrough'
          : eventName.toLowerCase().includes('uat')
          ? 'uat_kickoff' // Add more specific types
          : 'check_in', // Default type
        status: 'scheduled',
        scheduled_at: scheduledAt,
        duration_minutes: durationMinutes,
        attendees: attendees,
        project_id: projectId,
        company_id: companyId, // Store derived or provided company ID
      };

      const { error: upsertError } = await supabaseAdminClient
        .from('meetings')
        .upsert(meetingRecord, {
          onConflict: 'calendly_event_uri, calendly_invitee_uri',
        }); // Upsert based on event+invitee

      if (upsertError) {
        console.error('Error upserting meeting record:', upsertError.message);
        throw new Error(
          `Database error saving meeting: ${upsertError.message}`,
        );
      }
      console.log(
        `Meeting record upserted successfully for event ${eventUri}, invitee ${inviteeUri}`,
      );
    } else if (eventType === 'invitee.canceled') {
      console.log('Processing invitee.canceled event...');
      const eventUri = eventData.event?.uri;
      const inviteeUri = eventData.uri;

      if (!eventUri || !inviteeUri) {
        console.warn('Missing event or invitee URI in cancellation payload.');
        return createBadRequestResponse('Missing URI in cancellation payload.');
      }

      // Update meeting status to 'cancelled'
      const { error: updateError } = await supabaseAdminClient
        .from('meetings')
        .update({ status: 'cancelled' })
        .eq('calendly_event_uri', eventUri)
        .eq('calendly_invitee_uri', inviteeUri); // Match specific invitee cancellation

      if (updateError) {
        console.error(
          `Error updating meeting status to cancelled for event ${eventUri}, invitee ${inviteeUri}:`,
          updateError.message,
        );
        // Don't throw, just log, as the meeting might not exist or RLS prevented update
      } else {
        console.log(
          `Meeting status updated to cancelled for event ${eventUri}, invitee ${inviteeUri}`,
        );
      }
    } else {
      console.log(`Ignoring unhandled Calendly event type: ${eventType}`);
    }

    // Respond to Calendly successfully
    return new Response(
      JSON.stringify({ message: 'Webhook received successfully' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    const processErrorMessage = error instanceof Error
      ? error.message
      : 'Unknown error processing webhook';
    console.error(
      'Calendly Webhook Processing Error:',
      processErrorMessage,
      error,
    );
    // Log failure to background_job_failures or Sentry
    await logFailure(
      supabaseAdminClient,
      'calendly-webhook-handler',
      payload,
      error instanceof Error ? error : new Error(String(error)),
    );
    return createInternalServerErrorResponse(processErrorMessage, error);
  }
});
