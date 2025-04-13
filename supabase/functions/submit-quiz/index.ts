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

console.log('Submit Quiz function started');

interface QuizSubmissionPayload {
  lesson_id: string;
  answers: Record<string, any>; // User's answers (e.g., {"question_1": "answer_a", "question_2": ["b", "c"]})
}

interface QuizQuestion {
  id: string;
  type: 'multiple_choice_single' | 'multiple_choice_multiple' | 'true_false'; // Add more types as needed
  correct_answer?: string | string[]; // Correct answer(s)
  // Add other question properties if needed for scoring (e.g., points)
}

interface LessonData {
  id: string;
  type: string;
  quiz_data?: { questions: QuizQuestion[] };
  course_id: string;
}

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
    if (userError || !authUser) throw new Error('User not authenticated');
    user = authUser;
    console.log(`Handling quiz submission request for user ${user.id}`);
  } catch (e) {
    const setupErrorMessage = e instanceof Error
      ? e.message
      : 'Unknown error during setup';
    console.error('Auth/Client Error:', setupErrorMessage);
    return createUnauthorizedResponse('Authentication failed');
  }

  // --- Request Parsing and Validation ---
  let payload: QuizSubmissionPayload;
  try {
    payload = await req.json();
    const errors: ValidationErrors = {};
    if (!payload.lesson_id) errors.lesson_id = ['Lesson ID is required'];
    if (!payload.answers || typeof payload.answers !== 'object') {
      errors.answers = ['Answers object is required'];
    }

    if (Object.keys(errors).length > 0) {
      return createValidationErrorResponse(errors);
    }
  } catch (e) {
    return createBadRequestResponse(
      e instanceof Error ? e.message : 'Invalid JSON body',
    );
  }

  console.log(`Processing quiz submission for lesson ${payload.lesson_id}`);

  try {
    // --- Fetch Lesson and Course Assignment ---
    const { data: lessonData, error: lessonError } = await supabaseClient
      .from('lessons')
      .select('id, type, quiz_data, course_id')
      .eq('id', payload.lesson_id)
      .single();

    if (lessonError || !lessonData) {
      return createNotFoundResponse('Lesson not found');
    }

    if (lessonData.type !== 'quiz' || !lessonData.quiz_data?.questions) {
      return createBadRequestResponse('Lesson is not a valid quiz');
    }

    // Check if user is assigned to the course in any company context
    // Note: We need company_id to record completion. How is it determined?
    // Option 1: Pass company_id in payload.
    // Option 2: Assume user is completing in their primary/current company context.
    // Option 3: Find *any* assignment for this user/course. (Using this for now)
    const { data: assignment, error: assignmentError } = await supabaseClient
      .from('course_assignments')
      .select('company_id')
      .eq('user_id', user.id)
      .eq('course_id', lessonData.course_id)
      .limit(1) // Find any assignment
      .maybeSingle();

    if (assignmentError) throw assignmentError;
    if (!assignment) {
      return createForbiddenResponse(
        'User is not assigned to the course for this quiz',
      );
    }
    const companyId = assignment.company_id; // Use the company from the assignment

    // --- Score Quiz ---
    let score = 0;
    const totalQuestions = lessonData.quiz_data.questions.length;
    if (totalQuestions === 0) {
      return createBadRequestResponse('Quiz has no questions');
    }

    lessonData.quiz_data.questions.forEach((question: QuizQuestion) => {
      const userAnswer = payload.answers[question.id];
      if (userAnswer === undefined || userAnswer === null) return; // Skip unanswered

      // Basic scoring logic (adjust as needed)
      if (question.type === 'multiple_choice_single' || question.type === 'true_false') {
        if (String(userAnswer) === String(question.correct_answer)) {
          score++;
        }
      } else if (question.type === 'multiple_choice_multiple') {
        // Requires exact match for multiple answers
        const correctAnswers = Array.isArray(question.correct_answer)
          ? question.correct_answer.map(String).sort()
          : [];
        const userAnswers = Array.isArray(userAnswer)
          ? userAnswer.map(String).sort()
          : [];
        if (
          correctAnswers.length === userAnswers.length &&
          correctAnswers.every((val, index) => val === userAnswers[index])
        ) {
          score++;
        }
      }
      // Add scoring for other question types
    });

    const scorePercentage = (score / totalQuestions) * 100;
    console.log(
      `Quiz scored: ${score}/${totalQuestions} (${scorePercentage.toFixed(2)}%)`,
    );

    // --- Record Lesson Completion ---
    const { data: completionRecord, error: upsertError } = await supabaseClient
      .from('lesson_completions')
      .upsert(
        {
          lesson_id: payload.lesson_id,
          user_id: user.id,
          company_id: companyId, // Use company ID from assignment
          completed_at: new Date().toISOString(),
          quiz_score: scorePercentage,
        },
        { onConflict: 'lesson_id, user_id, company_id' }, // Update if already completed
      )
      .select('id')
      .single();

    if (upsertError) {
      console.error('Error recording lesson completion:', upsertError);
      throw new Error(
        `Failed to record quiz completion: ${upsertError.message}`,
      );
    }
    // --- End Record Completion ---

    console.log(
      `Successfully recorded quiz completion ${completionRecord.id} for lesson ${payload.lesson_id}`,
    );
    return new Response(
      JSON.stringify({
        message: 'Quiz submitted successfully',
        score: scorePercentage,
        correct: score,
        total: totalQuestions,
        completion_id: completionRecord.id,
      }),
      {
        status: 200, // OK, as it might be an update
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    // Use the standardized internal server error response
    return createInternalServerErrorResponse(undefined, error);
  }
});
