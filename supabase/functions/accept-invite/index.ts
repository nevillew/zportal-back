import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  createBadRequestResponse,
  // createConflictResponse, // Removed unused import
  createForbiddenResponse,
  createGoneResponse,
  createInternalServerErrorResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  createUnauthorizedResponse,
  createValidationErrorResponse,
} from '../_shared/validation.ts';

console.log('Accept Invite function started');

interface AcceptInvitePayload {
  token: string;
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

  // --- Authentication and Client Setup ---
  let supabaseClient: SupabaseClient;
  let user;
  try {
    supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      },
    );

    const { data: { user: authUser }, error: userError } = await supabaseClient
      .auth.getUser();
    if (userError || !authUser) {
      return createUnauthorizedResponse(userError?.message);
    }
    user = authUser;
    console.log(`Handling accept-invite request for user ${user.id}`);
  } catch (e) {
    const setupErrorMessage = e instanceof Error
      ? e.message
      : 'Unknown error during setup';
    console.error('Auth/Client Error:', setupErrorMessage);
    return createInternalServerErrorResponse(
      'Internal Server Error during setup',
    );
  }

  // --- Request Parsing and Validation ---
  let payload: AcceptInvitePayload;
  try {
    payload = await req.json();
    if (!payload.token) {
      return createValidationErrorResponse({
        token: ['Invitation token is required'],
      });
    }
  } catch (e) {
    const parseErrorMessage = e instanceof Error
      ? e.message
      : 'Invalid JSON body';
    return createBadRequestResponse(parseErrorMessage);
  }

  const { token } = payload;
  console.log(`Processing invitation token: ${token}`);

  // --- Main Logic ---
  try {
    // Call the RPC function to handle the acceptance logic transactionally
    const { data: companyId, error: rpcError } = await supabaseClient
      .rpc('accept_invitation', {
        p_token: token,
        p_user_id: user.id,
      });

    if (rpcError) {
      console.error(`Error calling accept_invitation RPC for token ${token}:`, rpcError);
      // Handle specific errors raised by the RPC function
      if (rpcError.message.startsWith('INVITATION_NOT_FOUND')) {
        return createNotFoundResponse('Invitation not found.');
      } else if (rpcError.message.startsWith('INVITATION_ALREADY_USED')) {
        const status = rpcError.message.split(':')[1] || 'used';
        return createGoneResponse(`Invitation already ${status}.`);
      } else if (rpcError.message.startsWith('INVITATION_EXPIRED')) {
        return createGoneResponse('Invitation has expired.');
      } else if (rpcError.message.startsWith('EMAIL_MISMATCH')) {
        return createForbiddenResponse('Authenticated user does not match the invited email address.');
      } else {
        // Default internal server error for other RPC errors
        throw new Error(`RPC Error: ${rpcError.message}`);
      }
    }

    // --- Success ---
    console.log(
      `Successfully accepted invitation via RPC for user ${user.id} to company ${companyId}`,
    );
    return new Response(
      JSON.stringify({
        message: 'Invitation accepted successfully.',
        companyId: companyId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

    /* --- OLD LOGIC (Moved to RPC) ---
    // 1. Fetch Invitation by Token
    const { data: invitation, error: fetchError } = await supabaseClient
      .from('invitations')
      .select('id, email, company_id, role, status, expires_at')
      .eq('token', token)
      .maybeSingle(); // Use maybeSingle as token might not exist

    if (fetchError) {
      console.error(
        `Error fetching invitation for token ${token}:`,
        fetchError.message,
      );
      throw new Error(
        `Database error fetching invitation: ${fetchError.message}`,
      );
    }

    // 2. Validate Invitation
    if (!invitation) {
      console.warn(`Invitation token ${token} not found.`);
      return createNotFoundResponse('Invitation not found.');
    }

    if (invitation.status !== 'pending') {
      console.warn(
        `Invitation token ${token} has already been used or revoked (status: ${invitation.status}).`,
      );
      // Use 410 Gone for expired/used tokens
      return createGoneResponse(`Invitation already ${invitation.status}.`);
    }

    const now = new Date();
    const expiresAt = new Date(invitation.expires_at);
    if (expiresAt < now) {
      console.warn(`Invitation token ${token} has expired.`);
      // Update status to 'expired' for clarity (optional, could be done by a background job too)
      await supabaseClient
        .from('invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);
      return createGoneResponse('Invitation has expired.');
    }

    // 3. Verify User Email Matches Invitation Email
    if (user.email !== invitation.email) {
      console.error(
        `Authenticated user email (${user.email}) does not match invitation email (${invitation.email}) for token ${token}.`,
      );
      return createForbiddenResponse(
        'Authenticated user does not match the invited email address.',
      );
    }

    // --- Perform Actions (Ideally in a Transaction via RPC) ---
    // TODO(transaction): Convert these steps into a single RPC function for atomicity.
    console.warn(
      'TODO(transaction): Wrap below operations in a transaction (e.g., via RPC) to ensure atomicity.',
    );

    // 4. Create company_users record
    console.log(
      `Creating company_users record for user ${user.id}, company ${invitation.company_id}, role ${invitation.role}`,
    );
    const { error: insertError } = await supabaseClient
      .from('company_users')
      .insert({
        user_id: user.id,
        company_id: invitation.company_id,
        role: invitation.role,
        // custom_permissions could potentially be set here if needed
      });

    // Handle potential conflict (user already in company)
    if (insertError) {
      if (insertError.code === '23505') { // Unique constraint violation
        console.warn(
          `User ${user.id} is already a member of company ${invitation.company_id}. Proceeding to accept invitation status.`,
        );
        // Allow the process to continue to mark the invitation as accepted,
        // assuming being already a member is acceptable.
      } else {
        console.error(
          `Error creating company_users record for user ${user.id}, company ${invitation.company_id}:`,
          insertError.message,
        );
        // Don't update invitation status if user creation failed for other reasons
        throw new Error(
          `Failed to add user to company: ${insertError.message}`,
        );
      }
    }

    // 5. Update Invitation Status
    console.log(`Updating invitation ${invitation.id} status to 'accepted'.`);
    const { error: updateError } = await supabaseClient
      .from('invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation.id);

    if (updateError) {
      console.error(
        `Error updating invitation ${invitation.id} status:`,
        updateError.message,
      );
      // Log the error, but the user is likely already in the company now.
      // Consider how critical this update is. For now, proceed but log.
      // In a transaction, this would cause a rollback.
    }

    // --- Success ---
    console.log(
      `Successfully accepted invitation for user ${user.id} to company ${invitation.company_id}`,
    );
    // Return company info or just success message
    return new Response(
      JSON.stringify({
        message: 'Invitation accepted successfully.',
        companyId: invitation.company_id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
    --- END OLD LOGIC --- */
  } catch (error) {
    // Catch errors from RPC call or other unexpected issues
    return createInternalServerErrorResponse(undefined, error);
  }
});
