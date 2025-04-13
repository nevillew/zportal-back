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

console.log('Announcements function started');

// Helper function to check staff permission (simplified for this function)
async function isStaff(
  client: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('user_profiles')
    .select('is_staff')
    .eq('user_id', userId)
    .single();
  if (error) {
    console.error(`Error checking staff status for user ${userId}:`, error);
    return false; // Default to false on error
  }
  return data?.is_staff ?? false;
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
  // Path: /functions/v1/announcements/{announcementId}
  const pathParts = url.pathname.split('/').filter((part) => part);
  const announcementId = pathParts[3];

  try {
    // --- Permission Check for Modification ---
    // Only staff can POST, PUT, DELETE announcements
    const userIsStaff = await isStaff(supabaseClient, user.id);
    if (
      ['POST', 'PUT', 'DELETE'].includes(req.method) && !userIsStaff
    ) {
      console.warn(
        `Non-staff user ${user.id} attempted ${req.method} on announcements.`,
      );
      return createForbiddenResponse(
        'Only staff members can manage announcements.',
      );
    }
    // --- End Permission Check ---

    switch (req.method) {
      case 'GET': {
        if (announcementId) {
          // GET /announcements/{id} - Staff can see any, users see published relevant ones
          console.log(`Fetching announcement ${announcementId}`);
          let query = supabaseClient
            .from('announcements')
            .select('*')
            .eq('id', announcementId);

          // Non-staff can only see published ones (RLS also enforces scope)
          if (!userIsStaff) {
            query = query.eq('status', 'published');
          }

          const { data, error } = await query.maybeSingle();

          if (error) throw error;
          if (!data) {
            return createNotFoundResponse(
              'Announcement not found or access denied',
            );
          }

          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          // GET /announcements - List relevant published announcements for user, or all for staff
          console.log('Listing announcements');
          let query = supabaseClient
            .from('announcements')
            .select('*')
            .order('published_at', { ascending: false, nullsFirst: false }) // Show newest published first
            .order('created_at', { ascending: false }); // Then newest created

          if (!userIsStaff) {
            // RLS handles the scope (global vs company) and role targeting
            // We just need to ensure only published are returned via API for non-staff
            query = query.eq('status', 'published');
          } else {
            // Staff might want to filter by status (e.g., view drafts)
            const statusFilter = url.searchParams.get('status');
            if (statusFilter) {
              query = query.eq('status', statusFilter);
            }
          }

          const { data, error } = await query;

          if (error) throw error;

          return new Response(JSON.stringify(data || []), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      case 'POST': { // Create announcement (Staff only)
        console.log('Creating new announcement');
        let body: any;
        try {
          body = await req.json();
          const errors: ValidationErrors = {};
          if (!body.title) errors.title = ['Title is required'];
          if (!body.content) errors.content = ['Content is required'];
          if (body.status && !['draft', 'published'].includes(body.status)) {
            errors.status = ['Invalid status. Must be draft or published.'];
          }
          // TODO: Validate target_company_id exists if provided
          // TODO: Validate target_role exists if provided

          if (Object.keys(errors).length > 0) {
            return createValidationErrorResponse(errors);
          }
        } catch (e) {
          return createBadRequestResponse(
            e instanceof Error ? e.message : 'Invalid JSON body',
          );
        }

        const { data, error } = await supabaseClient
          .from('announcements')
          .insert({
            title: body.title,
            content: body.content,
            status: body.status || 'draft',
            target_company_id: body.target_company_id, // Optional
            target_role: body.target_role, // Optional
            created_by_user_id: user.id,
            published_at: body.status === 'published'
              ? new Date().toISOString()
              : null,
          })
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify(data), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      case 'PUT': { // Update announcement (Staff only)
        if (!announcementId) {
          return createBadRequestResponse('Announcement ID required');
        }
        console.log(`Updating announcement ${announcementId}`);
        let body: any;
        try {
          body = await req.json();
          if (Object.keys(body).length === 0) {
            throw new Error('No update data provided');
          }
          const errors: ValidationErrors = {};
          if (
            body.status &&
            !['draft', 'published', 'archived'].includes(body.status)
          ) {
            errors.status = [
              'Invalid status. Must be draft, published, or archived.',
            ];
          }
          // TODO: Add other validation if needed

          if (Object.keys(errors).length > 0) {
            return createValidationErrorResponse(errors);
          }
        } catch (e) {
          return createBadRequestResponse(
            e instanceof Error ? e.message : 'Invalid JSON body',
          );
        }

        // Fetch current status to set published_at correctly
        const { data: currentData, error: fetchError } = await supabaseClient
          .from('announcements')
          .select('status')
          .eq('id', announcementId)
          .single();

        if (fetchError) {
          return createNotFoundResponse('Announcement not found');
        }

        const updates: any = {
          title: body.title,
          content: body.content,
          status: body.status,
          target_company_id: body.target_company_id,
          target_role: body.target_role,
        };

        // Set published_at only if status changes to 'published'
        if (body.status === 'published' && currentData.status !== 'published') {
          updates.published_at = new Date().toISOString();
        } else if (body.status && body.status !== 'published') {
          // If changing *away* from published, maybe nullify published_at? Optional.
          // updates.published_at = null;
        }

        // Remove undefined fields
        Object.keys(updates).forEach((key) => {
          if (updates[key] === undefined) delete updates[key];
        });

        const { data, error } = await supabaseClient
          .from('announcements')
          .update(updates)
          .eq('id', announcementId)
          .select()
          .single();

        if (error) {
          if (error.code === 'PGRST204') {
            return createNotFoundResponse('Announcement not found');
          }
          throw error;
        }

        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      case 'DELETE': { // Delete announcement (Staff only)
        if (!announcementId) {
          return createBadRequestResponse('Announcement ID required');
        }
        console.log(`Deleting announcement ${announcementId}`);

        const { error } = await supabaseClient
          .from('announcements')
          .delete()
          .eq('id', announcementId);

        if (error) {
          if (error.code === 'PGRST204') {
            return createNotFoundResponse('Announcement not found');
          }
          throw error;
        }

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
