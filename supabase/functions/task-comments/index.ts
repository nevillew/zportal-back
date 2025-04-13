// deno-lint-ignore-file
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
} from '../_shared/validation.ts'; // Import helpers

console.log('Task Comments function started');

interface CommentData {
  content: string;
  parent_comment_id?: string;
  is_internal?: boolean;
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
  // Path: /functions/v1/tasks/{taskId}/comments
  // Path: /functions/v1/comments/{commentId}
  const pathParts = url.pathname.split('/').filter((part) => part);
  let taskId: string | undefined;
  let commentId: string | undefined;

  if (pathParts[2] === 'tasks' && pathParts[4] === 'comments') {
    taskId = pathParts[3];
  } else if (pathParts[2] === 'comments') {
    commentId = pathParts[3];
  } else {
    return createBadRequestResponse('Invalid endpoint path');
  }

  console.log(`Task ID: ${taskId}, Comment ID: ${commentId}`);

  try {
    switch (req.method) {
      case 'GET': { // List comments for a task
        if (!taskId) {
          return createBadRequestResponse(
            'Task ID is required to list comments',
          );
        }
        console.log(`GET /tasks/${taskId}/comments`);

        // --- Permission Check: Can the user view the task? ---
        // RLS on 'tasks' should prevent fetching if user doesn't have access.
        const { data: taskCheck, error: taskCheckError } = await supabaseClient
          .from('tasks')
          .select('id') // Minimal select
          .eq('id', taskId)
          .maybeSingle();

        if (taskCheckError) {
          console.error(
            `Error checking task ${taskId} access for listing comments:`,
            taskCheckError.message,
          );
          throw new Error(
            `Error verifying task access: ${taskCheckError.message}`,
          );
        }
        if (!taskCheck) {
          console.warn(
            `User ${user.id} tried to list comments for non-existent or inaccessible task ${taskId}`,
          );
          return createNotFoundResponse('Task not found or access denied');
        }
        // --- End Permission Check ---

        // --- Fetch User Profile (for staff status) ---
        // We need this to filter internal comments
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles')
          .select('is_staff')
          .eq('user_id', user.id)
          .single();

        if (profileError) {
          console.error(
            `Error fetching user profile for ${user.id}:`,
            profileError.message,
          );
          throw new Error(
            `Failed to fetch user profile: ${profileError.message}`,
          );
        }
        const isStaffUser = profile.is_staff;
        // --- End Fetch User Profile ---

        // --- Fetch Comments ---
        // RLS on task_comments should ideally handle filtering based on is_internal,
        // but we add an explicit filter here for clarity and safety belt.
        let query = supabaseClient
          .from('task_comments')
          .select(`
                        *,
                        user:user_id ( id, full_name, avatar_url )
                    `)
          .eq('task_id', taskId)
          .order('created_at', { ascending: true }); // Order chronologically

        // Apply internal filter if the user is NOT staff
        if (!isStaffUser) {
          query = query.eq('is_internal', false);
        }

        const { data: comments, error: commentsError } = await query;

        if (commentsError) {
          console.error(
            `Error fetching comments for task ${taskId}:`,
            commentsError.message,
          );
          throw new Error(`Failed to fetch comments: ${commentsError.message}`);
        }
        // --- End Fetch Comments ---

        // Format response to nest user details
        const formattedComments = comments?.map((c) => ({
          ...c,
          user_id: undefined, // Remove original user_id field
        })) || [];

        console.log(
          `Found ${formattedComments.length} comments for task ${taskId} (visible to user ${user.id})`,
        );
        return new Response(JSON.stringify(formattedComments), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      case 'POST': { // Create a comment for a task
        if (!taskId) {
          return createBadRequestResponse(
            'Task ID is required to create a comment',
          );
        }
        console.log(`POST /tasks/${taskId}/comments`);

        let body: CommentData;
        try {
          body = await req.json();
          if (!body.content) {
            return createValidationErrorResponse({
              content: ['Comment content is required'],
            });
          }
        } catch (e) {
          const errorMessage = e instanceof Error
            ? e.message
            : 'Invalid JSON body';
          return createBadRequestResponse(errorMessage);
        }

        // --- Permission Check: Can the user view the task they are commenting on? ---
        const { data: taskCheck, error: taskCheckError } = await supabaseClient
          .from('tasks')
          .select('id, section_id') // Select minimal fields
          .eq('id', taskId)
          .maybeSingle(); // Use maybeSingle to handle not found/RLS denial

        if (taskCheckError) {
          console.error(
            `Error checking task ${taskId} access:`,
            taskCheckError.message,
          );
          throw new Error(
            `Error verifying task access: ${taskCheckError.message}`,
          );
        }
        if (!taskCheck) {
          console.warn(
            `User ${user.id} tried to comment on non-existent or inaccessible task ${taskId}`,
          );
          return createNotFoundResponse('Task not found or access denied');
        }
        // --- End Permission Check ---

        // --- Insert Comment ---
        const { data: newComment, error: insertError } = await supabaseClient
          .from('task_comments')
          .insert({
            task_id: taskId,
            user_id: user.id,
            content: body.content,
            parent_comment_id: body.parent_comment_id, // Optional
            is_internal: body.is_internal ?? false, // Default to false if not provided
          })
          .select() // Return the created comment
          .single();

        if (insertError) {
          console.error(
            `Error inserting comment for task ${taskId}:`,
            insertError.message,
          );
          if (insertError.code === '23503') { // Foreign key violation
            const constraint = insertError.message.includes('task_id')
              ? 'task_id'
              : insertError.message.includes('parent_comment_id')
              ? 'parent_comment_id'
              : 'unknown foreign key';
            return createBadRequestResponse(
              `Invalid reference: ${constraint} refers to a record that doesn't exist`,
            );
          }
          throw new Error(`Failed to create comment: ${insertError.message}`);
        }
        // --- End Insert Comment ---

        console.log(
          `Successfully created comment ${newComment.id} for task ${taskId}`,
        );
        return new Response(JSON.stringify(newComment), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      case 'PUT': { // Update a comment
        if (!commentId) {
          return createBadRequestResponse(
            'Comment ID is required to update a comment',
          );
        }
        console.log(`PUT /comments/${commentId}`);

        let body: Partial<CommentData>;
        try {
          body = await req.json();
          if (!body.content) {
            return createValidationErrorResponse({
              content: ['Comment content is required for update'],
            });
          }
        } catch (e) {
          const errorMessage = e instanceof Error
            ? e.message
            : 'Invalid JSON body';
          return createBadRequestResponse(errorMessage);
        }

        // --- Fetch comment and check ownership ---
        const { data: existingComment, error: fetchError } =
          await supabaseClient
            .from('task_comments')
            .select('user_id')
            .eq('id', commentId)
            .single(); // Use single to ensure it exists

        if (fetchError) {
          console.error(
            `Error fetching comment ${commentId} for update:`,
            fetchError.message,
          );
          // Handle case where comment doesn't exist (PGRST116) vs other errors
          const status = fetchError.code === 'PGRST116' ? 404 : 500;
          const message = fetchError.code === 'PGRST116'
            ? 'Comment not found'
            : 'Error fetching comment';
          if (status === 404) {
            return createNotFoundResponse(message);
          } else {
            return createInternalServerErrorResponse(message);
          }
        }

        if (existingComment.user_id !== user.id) {
          console.warn(
            `User ${user.id} attempted to update comment ${commentId} owned by ${existingComment.user_id}`,
          );
          return createForbiddenResponse(
            'You can only update your own comments',
          );
        }
        // --- End Ownership Check ---

        // --- Update Comment ---
        const { data: updatedComment, error: updateError } =
          await supabaseClient
            .from('task_comments')
            .update({ content: body.content }) // Only allow updating content for now
            .eq('id', commentId)
            .select()
            .single();

        if (updateError) {
          console.error(
            `Error updating comment ${commentId}:`,
            updateError.message,
          );
          if (updateError.code === 'PGRST204') { // Not Found
            return createNotFoundResponse('Comment not found or update failed');
          }
          // Handle other specific DB errors
          throw new Error(`Failed to update comment: ${updateError.message}`);
        }
        // --- End Update Comment ---

        console.log(`Successfully updated comment ${commentId}`);
        return new Response(JSON.stringify(updatedComment), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      case 'DELETE': { // Delete a comment
        if (!commentId) {
          return createBadRequestResponse(
            'Comment ID is required to delete a comment',
          );
        }
        console.log(`DELETE /comments/${commentId}`);

        // --- Fetch comment and check ownership ---
        const { data: existingComment, error: fetchError } =
          await supabaseClient
            .from('task_comments')
            .select('user_id')
            .eq('id', commentId)
            .single(); // Use single to ensure it exists

        if (fetchError) {
          console.error(
            `Error fetching comment ${commentId} for delete:`,
            fetchError.message,
          );
          const status = fetchError.code === 'PGRST116' ? 404 : 500;
          const message = fetchError.code === 'PGRST116'
            ? 'Comment not found'
            : 'Error fetching comment';
          if (status === 404) {
            return createNotFoundResponse(message);
          } else {
            return createInternalServerErrorResponse(message);
          }
        }

        // TODO(permissions): Add check for admin/staff override permission if needed, allowing deletion of others' comments.
        if (existingComment.user_id !== user.id) {
          console.warn(
            `User ${user.id} attempted to delete comment ${commentId} owned by ${existingComment.user_id}`,
          );
          return createForbiddenResponse(
            'You can only delete your own comments',
          );
        }

        // --- Fetch user profile for staff check ---
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles')
          .select('is_staff')
          .eq('user_id', user.id)
          .single();

        if (profileError) {
          console.error(
            `Error fetching user profile for delete check: ${profileError.message}`,
          );
          // Proceed cautiously, relying on ownership check
        }
        const isStaffUser = profile?.is_staff ?? false;
        // --- End Fetch User Profile ---

        // --- Final Permission Check (Owner or Staff) ---
        if (existingComment.user_id !== user.id && !isStaffUser) {
          console.warn(
            `User ${user.id} (not staff) attempted to delete comment ${commentId} owned by ${existingComment.user_id}`,
          );
          return createForbiddenResponse(
            'You can only delete your own comments.',
          );
        }
        // --- End Final Permission Check ---

        // --- Check for Replies ---
        const { data: replies, error: repliesError } = await supabaseClient
          .from('task_comments')
          .select('id', { count: 'exact', head: true }) // Just check existence
          .eq('parent_comment_id', commentId);

        if (repliesError) {
          console.error(`Error checking for replies to comment ${commentId}:`, repliesError.message);
          throw new Error(`Failed to check for replies: ${repliesError.message}`);
        }

        // Use count from response headers if available, otherwise check data length
        const replyCount = replies?.length ?? 0; // Fallback, count might be in headers

        if (replyCount > 0) {
           console.warn(`Attempted to delete comment ${commentId} which has replies.`);
           return createConflictResponse('Cannot delete a comment that has replies.');
        }
        // --- End Check for Replies ---


        // --- Delete Comment ---
        const { error: deleteError } = await supabaseClient
          .from('task_comments')
          .delete()
          .eq('id', commentId);

        if (deleteError) {
          console.error(
            `Error deleting comment ${commentId}:`,
            deleteError.message,
          );
          if (deleteError.code === 'PGRST204') { // Not Found
            return createNotFoundResponse(
              'Comment not found or already deleted',
            );
          }
          if (deleteError.code === '23503') { // Foreign key violation (e.g., replies reference this comment)
            return createConflictResponse(
              'Cannot delete comment with existing replies.',
            );
          }
          // Handle other specific DB errors
          throw new Error(`Failed to delete comment: ${deleteError.message}`);
        }
        // --- End Delete Comment ---

        console.log(`Successfully deleted comment ${commentId}`);
        return new Response(null, { status: 204, headers: { ...corsHeaders } });
      }
      default:
        return createMethodNotAllowedResponse();
    }
  } catch (error) {
    // Use the standardized internal server error response
    return createInternalServerErrorResponse(undefined, error);
  }
});
