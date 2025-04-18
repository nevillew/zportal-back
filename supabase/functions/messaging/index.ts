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
  // createNotFoundResponse, // Removed unused import
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
            // --- Start Validation ---
            // Validate participant IDs exist and are active
            if (body.participant_ids.length > 0) {
              const { data: usersCheck, error: usersCheckError } = await supabaseClient
                .from('user_profiles')
                .select('user_id')
                .in('user_id', body.participant_ids)
                .eq('is_active', true);

              if (usersCheckError) throw new Error(`Error validating participants: ${usersCheckError.message}`);
              if (usersCheck?.length !== body.participant_ids.length) {
                 errors.participant_ids = ['One or more participant IDs are invalid or inactive.'];
              }
            }
            // Validate project ID exists if provided
            if (body.project_id) {
               const { data: projectCheck, error: projectCheckError } = await supabaseClient
                 .from('projects')
                 .select('id')
                 .eq('id', body.project_id)
                 .maybeSingle(); // RLS applies
               if (projectCheckError) throw new Error(`Error validating project ID: ${projectCheckError.message}`);
               if (!projectCheck) errors.project_id = ['Project not found or access denied.'];
            }
            // Validate task ID exists if provided
            if (body.task_id) {
               const { data: taskCheck, error: taskCheckError } = await supabaseClient
                 .from('tasks')
                 .select('id')
                 .eq('id', body.task_id)
                 .maybeSingle(); // RLS applies
               if (taskCheckError) throw new Error(`Error validating task ID: ${taskCheckError.message}`);
               if (!taskCheck) errors.task_id = ['Task not found or access denied.'];
            }
            // --- End Validation ---


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

          // --- Create Conversation via RPC ---
          console.log('Calling create_conversation RPC...');
          const { data: newConversationId, error: rpcError } = await supabaseClient
            .rpc('create_conversation', {
              p_topic: body.topic,
              p_project_id: body.project_id,
              p_task_id: body.task_id,
              p_participant_ids: allParticipantIds,
              p_creator_id: user.id,
            });

          if (rpcError) {
            console.error('Error calling create_conversation RPC:', rpcError);
            // Handle potential errors from RPC (e.g., validation, DB constraints)
            throw new Error(`RPC Error: ${rpcError.message}`); // Let main catch handler deal with it
          }

          if (!newConversationId) {
            throw new Error('RPC function did not return a new conversation ID.');
          }
          console.log(`Conversation created via RPC with ID: ${newConversationId}`);
          // --- End RPC Call ---

          // Fetch the created conversation with participants for response
          const { data: finalConversation, error: fetchFinalError } =
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
              .eq('id', newConversationId) // Use ID returned from RPC
              .single();

          if (fetchFinalError || !finalConversation) {
             console.error(`Error fetching newly created conversation ${newConversationId}:`, fetchFinalError);
             // Return a success response but indicate data fetch failed
             return new Response(JSON.stringify({ message: "Conversation created, but failed to fetch details.", conversation_id: newConversationId }), {
               status: 201, // Still created
               headers: { ...corsHeaders, 'Content-Type': 'application/json' },
             });
          }

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

          // Send Realtime event for the new message
          try {
            const channel = supabaseClient.channel(`conversation-${conversationId}`);
            await channel.send({
              type: 'broadcast',
              event: 'new_message',
              payload: newMessage, // Send the newly created message object
            });
            console.log(`Realtime event sent for new message in conversation ${conversationId}`);
          } catch (realtimeError) {
            console.error(`Failed to send Realtime event for new message: ${realtimeError.message}`);
            // Log failure but don't fail the request
            // await logFailure(...)
          }

          return new Response(JSON.stringify(newMessage), {
            status: 201, // Created
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          return createBadRequestResponse('Invalid POST request path');
        }
      }
      case 'PUT': { // Update a message
        if (resourceType !== 'messages' || !messageId) {
          return createBadRequestResponse('Message ID is required to update a message');
        }
        console.log(`PUT /messages/${messageId}`);

        let body: { content: string };
        try {
          body = await req.json();
          if (!body.content || body.content.trim().length === 0) {
            return createValidationErrorResponse({ content: ['Message content cannot be empty'] });
          }
        } catch (e) {
          return createBadRequestResponse(e instanceof Error ? e.message : 'Invalid JSON body');
        }

        // Fetch message to check ownership
        const { data: existingMessage, error: fetchError } = await supabaseClient
          .from('messages')
          .select('sender_user_id')
          .eq('id', messageId)
          .single(); // Use single to ensure it exists

        if (fetchError) {
           return createNotFoundResponse('Message not found');
        }

        // Permission check: Only sender can edit
        if (existingMessage.sender_user_id !== user.id) {
          return createForbiddenResponse('You can only edit your own messages');
        }

        // Update message content
        const { data: updatedMessage, error: updateError } = await supabaseClient
          .from('messages')
          .update({ content: body.content })
          .eq('id', messageId)
          .select(`*, sender:sender_user_id ( id, full_name, avatar_url )`) // Fetch sender details again
          .single();

        if (updateError) {
          if (updateError.code === 'PGRST204') return createNotFoundResponse('Message not found');
          throw updateError;
        }

        // Send Realtime event for updated message
        try {
          const channel = supabaseClient.channel(`conversation-${updatedMessage.conversation_id}`);
          await channel.send({
            type: 'broadcast',
            event: 'update_message',
            payload: updatedMessage,
          });
          console.log(`Realtime event sent for updated message ${messageId}`);
        } catch (realtimeError) {
          console.error(`Failed to send Realtime event for updated message: ${realtimeError.message}`);
        }


        return new Response(JSON.stringify(updatedMessage), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      case 'DELETE': { // Delete a message
        if (resourceType !== 'messages' || !messageId) {
          return createBadRequestResponse('Message ID is required to delete a message');
        }
        console.log(`DELETE /messages/${messageId}`);

        // Fetch message to check ownership
        const { data: existingMessage, error: fetchError } = await supabaseClient
          .from('messages')
          .select('sender_user_id, conversation_id')
          .eq('id', messageId)
          .single();

        if (fetchError) {
           return createNotFoundResponse('Message not found');
        }

        // Permission check: Sender or Staff
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id).single();
        if (profileError) throw profileError; // Internal error if profile fetch fails

        if (existingMessage.sender_user_id !== user.id && !profile?.is_staff) {
          return createForbiddenResponse('You can only delete your own messages');
        }

        // Delete message
        const { error: deleteError } = await supabaseClient
          .from('messages')
          .delete()
          .eq('id', messageId);

        if (deleteError) {
          if (deleteError.code === 'PGRST204') return createNotFoundResponse('Message not found');
          throw deleteError;
        }

        // Send Realtime event for deleted message
         try {
          const channel = supabaseClient.channel(`conversation-${existingMessage.conversation_id}`);
          await channel.send({
            type: 'broadcast',
            event: 'delete_message',
            payload: { id: messageId, conversation_id: existingMessage.conversation_id }, // Send ID for removal
          });
          console.log(`Realtime event sent for deleted message ${messageId}`);
        } catch (realtimeError) {
          console.error(`Failed to send Realtime event for deleted message: ${realtimeError.message}`);
        }

        return new Response(null, { status: 204, headers: { ...corsHeaders } });
      }
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
