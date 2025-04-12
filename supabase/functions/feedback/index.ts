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
  createValidationErrorResponse,
  ValidationErrors,
} from '../_shared/validation.ts';

console.log('Feedback function started');

interface FeedbackPayload {
  feedback_type: 'bug_report' | 'feature_request' | 'general_comment' | 'rating';
  content: string;
  rating?: number; // Optional, only relevant for 'rating' type
  context?: Record<string, any>; // Optional context
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

  // --- Routing ---
  // This function only handles POST requests to submit feedback
  if (req.method !== 'POST') {
    return createMethodNotAllowedResponse();
  }

  try {
    // --- Request Parsing and Validation ---
    let body: FeedbackPayload;
    try {
      body = await req.json();
      const errors: ValidationErrors = {};
      const allowedTypes = ['bug_report', 'feature_request', 'general_comment', 'rating'];

      if (!body.feedback_type || !allowedTypes.includes(body.feedback_type)) {
        errors.feedback_type = [`Feedback type is required and must be one of: ${allowedTypes.join(', ')}`];
      }
      if (!body.content || body.content.trim().length === 0) {
        errors.content = ['Feedback content cannot be empty'];
      }
      if (body.feedback_type === 'rating') {
        if (body.rating === undefined || body.rating === null) {
          errors.rating = ['Rating is required for feedback type "rating"'];
        } else if (typeof body.rating !== 'number' || !Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
          errors.rating = ['Rating must be an integer between 1 and 5'];
        }
      } else if (body.rating !== undefined && body.rating !== null) {
        // Rating provided for non-rating type - maybe ignore or warn? Ignoring for now.
        // errors.rating = ['Rating should only be provided for feedback type "rating"'];
      }

      if (Object.keys(errors).length > 0) {
        return createValidationErrorResponse(errors);
      }
    } catch (e) {
      return createBadRequestResponse(e instanceof Error ? e.message : 'Invalid JSON body');
    }

    // --- Insert Feedback ---
    console.log(`Submitting feedback of type: ${body.feedback_type}`);
    const { data: newFeedback, error: insertError } = await supabaseClient
      .from('feedback')
      .insert({
        user_id: user.id, // Associate with the logged-in user
        feedback_type: body.feedback_type,
        content: body.content,
        rating: body.feedback_type === 'rating' ? body.rating : null, // Only store rating if type matches
        context: body.context, // Store optional context
        status: 'new', // Default status
      })
      .select('id') // Return only the ID
      .single();

    if (insertError) {
      console.error('Error inserting feedback:', insertError.message);
      // Handle specific DB errors if needed (e.g., check constraint violation)
      if (insertError.code === '23514') { // Check constraint violation
        return createBadRequestResponse(`Invalid input: ${insertError.details}`);
      }
      throw new Error(`Failed to submit feedback: ${insertError.message}`);
    }
    // --- End Insert Feedback ---

    console.log(`Successfully submitted feedback ${newFeedback.id}`);
    return new Response(JSON.stringify({ message: 'Feedback submitted successfully', id: newFeedback.id }), {
      status: 201, // Created
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    // Use the standardized internal server error response
    return createInternalServerErrorResponse(undefined, error);
  }
});
