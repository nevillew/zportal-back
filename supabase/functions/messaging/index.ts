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
  createNotFoundResponse,
  createUnauthorizedResponse,
  createValidationErrorResponse,
  ValidationErrors,
} from '../_shared/validation.ts';

console.log('Messaging function started');

// Helper function to check if user is participant (using DB function)
async function checkParticipation(
  client: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const { data, error } = await client.rpc('is_conversation_participant', {
    p_user_id: userId,
    p_conversation_id: conversationId,
  });
  if (error) {
    console.error(
      `Error checking participation via RPC for convo ${conversationId}:`,
      error,
    );
    return false;
  }
  return data === true;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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
    if (userError || !authUser) throw new Error('User not authenticated');
    user = authUser;
    console.log(`Handling ${req.method} request for user ${user.id}`);
  } catch (e) {
    const setupErrorMessage = e instanceof Error
      ? e.message
      : 'Unknown error during setup';
    console.error('Auth/Client Error:', setupErrorMessage);
    return createUnauthorizedResponse('Authentication failed');
  }

  const url = new URL(req.url);
  // Path: /functions/v1/conversations
  // Path: /functions/v1/conversations/{conversationId}
  // Path: /functions/v1/conversations/{conversationId}/messages
  // Path: /functions/v1/messages/{messageId}
  const pathParts = url.pathname.split('/').filter((part) => part);
  let conversationId: string | undefined;
  let messageId: string | undefined;
  let resourceType: 'conversations' | 'messages' | undefined;

  if (pathParts[2] === 'conversations') {
    resourceType = 'conversations';
    conversationId = pathParts[3];
    if (pathParts[4] === 'messages') {
      resourceType = 'messages'; // Override if accessing messages within a conversation
    }
  } else if (pathParts[2] === 'messages') {
    resourceType = 'messages';
    messageId = pathParts[3];
  } else {
    return createBadRequestResponse('Invalid endpoint path');
  }

  console.log(
    `Resource: ${resourceType}, Conversation ID: ${conversationId}, Message ID: ${messageId}`,
  );

  try {
    switch (req.method) {
      case 'GET': {
        if (resourceType === 'conversations' && !conversationId) {
          // GET /conversations - List conversations for the user
          console.log(`Listing conversations for user ${user.id}`);
          // RLS handles filtering to conversations the user is part of
          const { data, error } = await supabaseClient
            .from('conversations')
            .select(`
              *,
              participants:conversation_participants ( user_profiles ( user_id, full_name, avatar_url ) )
            `)
            .order('last_message_at', { ascending: false, nullsLast: true }); // Show most recent first

          if (error) throw error;
          return new Response(JSON.stringify(data || []), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else if (resourceType === 'messages' && conversationId) {
          // GET /conversations/{conversationId}/messages - List messages
          console.log(`Listing messages for conversation ${conversationId}`);
          // Permission check: Must be participant
          const isParticipant = await checkParticipation(
            supabaseClient,
            user.id,
            conversationId,
          );
          if (!isParticipant) {
            return createForbiddenResponse(
              'Not a participant of this conversation',
            );
          }

          // Fetch messages
          const { data, error } = await supabaseClient
            .from('messages')
            .select(`*, sender:sender_user_id ( id, full_name, avatar_url )`)
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true }); // Oldest first

          if (error) throw error;
          return new Response(JSON.stringify(data || []), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          return createBadRequestResponse('Invalid GET request path');
        }
      }
      case 'POST': {
        if (resourceType === 'conversations' && !conversationId) {
          // POST /conversations - Create a new conversation
          console.log(`Creating new conversation for user ${user.id}`);
          let body: {
            topic?: string;
            project_id?: string;
            task_id?: string;
            participant_ids: string[];
          };
          try {
            body = await req.json();
            const errors: ValidationErrors = {};
            if (
              !body.participant_ids || !Array.isArray(body.participant_ids) ||
              body.participant_ids.length === 0
            ) {
              errors.participant_ids = [
                'At least one participant ID (besides self) is required',
              ];
            }
            // TODO: Validate participant IDs exist?
            // TODO: Validate project/task IDs exist if provided?

            if (Object.keys(errors).length > 0) {
              return createValidationErrorResponse(errors);
            }
          } catch (e) {
            return createBadRequestResponse(
              e instanceof Error ? e.message : 'Invalid JSON body',
            );
          }

          // Ensure creator is included in participants
          const allParticipantIds = Array.from(
            new Set([...body.participant_ids, user.id]),
          );

          // --- Create Conversation and Participants (Needs Transaction ideally) ---
          // TODO(transaction): Wrap in RPC for atomicity
          console.warn('TODO: Wrap conversation creation in transaction (RPC)');

          // 1. Create Conversation
          const { data: newConversation, error: convoError } =
            await supabaseClient
              .from('conversations')
              .insert({
                topic: body.topic,
                project_id: body.project_id,
                task_id: body.task_id,
                // company_id might be derived later or set based on project/task
              })
              .select('id')
              .single();

          if (convoError || !newConversation) {
            throw new Error(
              `Failed to create conversation: ${convoError?.message}`,
            );
          }

          // 2. Add Participants
          const participantRecords = allParticipantIds.map((pId) => ({
            conversation_id: newConversation.id,
            user_id: pId,
          }));
          const { error: participantError } = await supabaseClient
            .from('conversation_participants')
            .insert(participantRecords);

          if (participantError) {
            // Attempt cleanup if participants fail? Transaction needed.
            console.error(
              'Failed to add participants:',
              participantError.message,
            );
            // await supabaseClient.from('conversations').delete().eq('id', newConversation.id); // Requires transaction
            throw new Error(
              `Failed to add participants: ${participantError.message}`,
            );
          }
          // --- End Transaction Block ---

          // Fetch the created conversation with participants for response
          const { data: finalConversation, error: fetchFinalError } =
            await supabaseClient
              .from('conversations')
              .select(
                `*, participants:conversation_participants ( user_profiles ( user_id, full_name, avatar_url ) )`,
              )
              .eq('id', newConversation.id)
              .single();

          if (fetchFinalError) throw fetchFinalError; // Should not happen

          return new Response(JSON.stringify(finalConversation), {
            status: 201,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else if (resourceType === 'messages' && conversationId) {
          // POST /conversations/{conversationId}/messages - Send a message
          console.log(`Sending message to conversation ${conversationId}`);
          let body: { content: string };
          try {
            body = await req.json();
            if (!body.content || body.content.trim().length === 0) {
              return createValidationErrorResponse({
                content: ['Message content cannot be empty'],
              });
            }
          } catch (e) {
            return createBadRequestResponse(
              e instanceof Error ? e.message : 'Invalid JSON body',
            );
          }

          // Permission check: Must be participant (RLS handles this on INSERT, but check here for better error)
          const isParticipant = await checkParticipation(
            supabaseClient,
            user.id,
            conversationId,
          );
          if (!isParticipant) {
            return createForbiddenResponse(
              'Not a participant of this conversation',
            );
          }

          // Insert message
          const { data: newMessage, error: insertError } = await supabaseClient
            .from('messages')
            .insert({
              conversation_id: conversationId,
              sender_user_id: user.id,
              content: body.content,
            })
            .select(`*, sender:sender_user_id ( id, full_name, avatar_url )`) // Fetch sender details
            .single();

          if (insertError) throw insertError; // RLS or DB constraint likely failed

          // TODO(realtime): Consider sending a Realtime event for the new message

          return new Response(JSON.stringify(newMessage), {
            status: 201,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          return createBadRequestResponse('Invalid POST request path');
        }
      }
      // TODO: Implement PUT/DELETE for messages if needed (edit/delete own message)
      default:
        return createMethodNotAllowedResponse();
    }
  } catch (error) {
    // Handle potential database errors
    if (error.code) { // Check if it looks like a PostgrestError
      console.error(
        'Database Error:',
        error.message,
        error.code,
        error.details,
      );
      if (error.code === '23505') {
        return createConflictResponse(
          `Record already exists: ${error.details}`,
        );
      }
      if (error.code === '23514') {
        return createBadRequestResponse(`Invalid input: ${error.details}`);
      }
      if (error.code === '23503') {
        return createBadRequestResponse(`Invalid reference: ${error.details}`);
      }
    }
    // Use the standardized internal server error response for other errors
    return createInternalServerErrorResponse(undefined, error);
  }
});
