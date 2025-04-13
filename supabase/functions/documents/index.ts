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

console.log('Documents function started');

// Helper to check permission for managing documents based on scope
async function checkDocumentPermission(
  client: SupabaseClient,
  userId: string,
  permissionKey: 'document:create' | 'document:edit' | 'document:delete',
  companyId?: string | null,
  projectId?: string | null,
): Promise<boolean> {
  // Staff can do anything
  const { data: profile, error: profileError } = await client
    .from('user_profiles')
    .select('is_staff')
    .eq('user_id', userId)
    .single();
  if (profileError) {
    console.error(
      'Error fetching user profile for permission check:',
      profileError,
    );
    return false; // Default to no permission on error
  }
  if (profile?.is_staff) return true;

  let targetCompanyId: string | null = null;

  if (projectId) {
    // Get company ID from project
    const { data: projectData, error: projectError } = await client
      .from('projects')
      .select('company_id')
      .eq('id', projectId)
      .single();
    if (projectError || !projectData) {
      console.error(
        `Error fetching project ${projectId} for permission check:`,
        projectError,
      );
      return false; // Cannot determine company, deny permission
    }
    targetCompanyId = projectData.company_id;
  } else if (companyId) {
    targetCompanyId = companyId;
  } else {
    // Global scope - only staff allowed (already handled above)
    return false;
  }

  if (!targetCompanyId) {
    console.error(
      'Could not determine target company ID for permission check.',
    );
    return false;
  }

  // Check permission within the company context
  const { data: hasPermission, error: permissionError } = await client.rpc(
    'has_permission',
    {
      user_id: userId,
      company_id: targetCompanyId,
      permission_key: permissionKey,
    },
  );

  if (permissionError) {
    console.error(
      `Error checking permission '${permissionKey}' for user ${userId} on company ${targetCompanyId}:`,
      permissionError,
    );
    return false;
  }

  return hasPermission === true;
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
  // Path: /functions/v1/documents/{documentId}
  const pathParts = url.pathname.split('/').filter((part) => part);
  const documentId = pathParts[3];
  const companyIdFilter = url.searchParams.get('company_id');
  const projectIdFilter = url.searchParams.get('project_id');

  try {
    switch (req.method) {
      case 'GET': {
        if (documentId) {
          // GET /documents/{id} - Fetch specific document
          console.log(`Fetching document ${documentId}`);
          // RLS policy handles read access based on scope
          const { data, error } = await supabaseClient
            .from('documents')
            .select('*') // Select all fields for detail view
            .eq('id', documentId)
            .maybeSingle();

          if (error) throw error;
          if (!data) {
            return createNotFoundResponse(
              'Document not found or access denied',
            );
          }

          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          // GET /documents - List documents based on filters
          console.log('Listing documents');
          let query = supabaseClient
            .from('documents')
            .select('*') // Adjust columns as needed for list view
            .order('order', { ascending: true })
            .order('name', { ascending: true });

          // Apply filters (RLS handles the core visibility)
          if (projectIdFilter) {
            query = query.eq('project_id', projectIdFilter);
          } else if (companyIdFilter) {
            query = query.eq('company_id', companyIdFilter).is(
              'project_id',
              null,
            ); // Company-scoped only
          } else {
            // If no filter, default to showing global OR user's company/project docs
            // RLS should handle this filtering implicitly based on user context
            // No explicit filter needed here if RLS is correct
          }

          const { data, error } = await query;

          if (error) throw error;

          return new Response(JSON.stringify(data || []), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      case 'POST': { // Create document
        console.log('Creating new document');
        let body: any;
        try {
          body = await req.json();
          const errors: ValidationErrors = {};
          if (!body.name) errors.name = ['Name is required'];
          if (!body.type) errors.type = ['Type is required']; // TODO: Validate enum
          // Validate scope: Ensure only one of company_id or project_id is set, or both are null
          if (body.company_id && body.project_id) {
            errors.scope = [
              'Document cannot be scoped to both a company and a project',
            ];
          }

          if (Object.keys(errors).length > 0) {
            return createValidationErrorResponse(errors);
          }
        } catch (e) {
          return createBadRequestResponse(
            e instanceof Error ? e.message : 'Invalid JSON body',
          );
        }

        // --- Permission Check ---
        const canCreate = await checkDocumentPermission(
          supabaseClient,
          user.id,
          'document:create',
          body.company_id,
          body.project_id,
        );
        if (!canCreate) {
          return createForbiddenResponse(
            'Not authorized to create documents in this scope',
          );
        }
        // --- End Permission Check ---

        const { data, error } = await supabaseClient
          .from('documents')
          .insert({
            name: body.name,
            type: body.type,
            company_id: body.company_id, // Optional
            project_id: body.project_id, // Optional
            description: body.description, // Optional
            order: body.order ?? 0,
            status: 'Draft', // Default status
            created_by_user_id: user.id,
          })
          .select()
          .single();

        if (error) throw error; // Handle specific DB errors in main catch

        return new Response(JSON.stringify(data), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      case 'PUT': { // Update document
        if (!documentId) {
          return createBadRequestResponse('Document ID required');
        }
        console.log(`Updating document ${documentId}`);
        let body: any;
        try {
          body = await req.json();
          if (Object.keys(body).length === 0) {
            throw new Error('No update data provided');
          }
          // TODO: Add validation for fields like type, status enums
        } catch (e) {
          return createBadRequestResponse(
            e instanceof Error ? e.message : 'Invalid JSON body',
          );
        }

        // --- Fetch current scope for permission check ---
        const { data: currentDoc, error: fetchError } = await supabaseClient
          .from('documents')
          .select('company_id, project_id')
          .eq('id', documentId)
          .single();

        if (fetchError) return createNotFoundResponse('Document not found');
        // --- End Fetch ---

        // --- Permission Check ---
        const canUpdate = await checkDocumentPermission(
          supabaseClient,
          user.id,
          'document:edit',
          currentDoc.company_id,
          currentDoc.project_id,
        );
        if (!canUpdate) {
          return createForbiddenResponse(
            'Not authorized to update this document',
          );
        }
        // --- End Permission Check ---

        // Prepare allowed updates (prevent changing scope or creator)
        const allowedUpdates = {
          name: body.name,
          type: body.type,
          description: body.description,
          order: body.order,
          status: body.status, // Note: Approval logic is separate
          version: body.version, // Simple version bump allowed?
          // Exclude company_id, project_id, created_by_user_id
        };
        Object.keys(allowedUpdates).forEach((key) => {
          if ((allowedUpdates as any)[key] === undefined) {
            delete (allowedUpdates as any)[key];
          }
        });

        const { data, error } = await supabaseClient
          .from('documents')
          .update(allowedUpdates)
          .eq('id', documentId)
          .select()
          .single();

        if (error) {
          if (error.code === 'PGRST204') {
            return createNotFoundResponse('Document not found');
          }
          throw error; // Handle specific DB errors in main catch
        }

        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      case 'DELETE': { // Delete document
        if (!documentId) {
          return createBadRequestResponse('Document ID required');
        }
        console.log(`Deleting document ${documentId}`);

        // --- Fetch current scope for permission check ---
        const { data: currentDoc, error: fetchError } = await supabaseClient
          .from('documents')
          .select('company_id, project_id')
          .eq('id', documentId)
          .single();

        if (fetchError) return createNotFoundResponse('Document not found');
        // --- End Fetch ---

        // --- Permission Check ---
        const canDelete = await checkDocumentPermission(
          supabaseClient,
          user.id,
          'document:delete',
          currentDoc.company_id,
          currentDoc.project_id,
        );
        if (!canDelete) {
          return createForbiddenResponse(
            'Not authorized to delete this document',
          );
        }
        // --- End Permission Check ---

        const { error } = await supabaseClient
          .from('documents')
          .delete()
          .eq('id', documentId);

        if (error) {
          if (error.code === 'PGRST204') {
            return createNotFoundResponse('Document not found');
          }
          // Handle FK constraints (e.g., pages referencing document)
          if (error.code === '23503') {
            return createBadRequestResponse(
              'Cannot delete document with existing pages or references.',
            );
          }
          throw error;
        }

        return new Response(null, { status: 204, headers: { ...corsHeaders } });
      }
      default:
        return createMethodNotAllowedResponse();
    }
  } catch (error) {
    // Handle potential database errors (unique constraints, check violations, etc.)
    if (error.code) { // Check if it looks like a PostgrestError
      console.error(
        'Database Error:',
        error.message,
        error.code,
        error.details,
      );
      if (error.code === '23505') { // Unique violation
        return createConflictResponse(
          `Record already exists: ${error.details}`,
        );
      }
      if (error.code === '23514') { // Check constraint violation
        return createBadRequestResponse(`Invalid input: ${error.details}`);
      }
      if (error.code === '23503') { // Foreign key violation
        return createBadRequestResponse(`Invalid reference: ${error.details}`);
      }
    }
    // Use the standardized internal server error response for other errors
    return createInternalServerErrorResponse(undefined, error);
  }
});
