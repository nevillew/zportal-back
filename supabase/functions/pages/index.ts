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

console.log('Pages function started');

// Helper function to check if user can access the parent document
// (Leverages the DB function for consistency, but requires an RPC call)
async function checkDocumentAccess(
  client: SupabaseClient,
  userId: string,
  documentId: string,
): Promise<boolean> {
  const { data, error } = await client.rpc('can_access_document', {
    p_user_id: userId,
    p_document_id: documentId,
  });
  if (error) {
    console.error(`Error checking document access via RPC for doc ${documentId}:`, error);
    return false;
  }
  return data === true;
}

// Helper function to check if user can manage the parent document
// (Leverages the DB function for consistency)
async function checkDocumentManagement(
  client: SupabaseClient,
  userId: string,
  documentId: string,
): Promise<boolean> {
  const { data, error } = await client.rpc('can_manage_document', {
    p_user_id: userId,
    p_document_id: documentId,
  });
  if (error) {
    console.error(`Error checking document management via RPC for doc ${documentId}:`, error);
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
  // Path: /functions/v1/documents/{documentId}/pages
  // Path: /functions/v1/pages/{pageId}
  const pathParts = url.pathname.split('/').filter((part) => part);
  let documentId: string | undefined;
  let pageId: string | undefined;

  if (pathParts[2] === 'documents' && pathParts[4] === 'pages') {
    documentId = pathParts[3];
  } else if (pathParts[2] === 'pages') {
    pageId = pathParts[3];
  } else {
    return createBadRequestResponse('Invalid endpoint path');
  }

  console.log(`Document ID: ${documentId}, Page ID: ${pageId}`);

  try {
    switch (req.method) {
      case 'GET': {
        if (pageId) {
          // GET /pages/{id} - Fetch specific page
          console.log(`Fetching page ${pageId}`);
          // Fetch page and check parent document access via RLS helper
          const { data, error } = await supabaseClient
            .from('pages')
            .select('*, document_id') // Need document_id for permission check
            .eq('id', pageId)
            .maybeSingle();

          if (error) throw error;
          if (!data) return createNotFoundResponse('Page not found');

          // Permission check
          const canAccess = await checkDocumentAccess(supabaseClient, user.id, data.document_id);
          if (!canAccess) return createForbiddenResponse('Access denied to parent document');

          // Remove document_id if not needed in response
          const { document_id, ...pageData } = data;

          return new Response(JSON.stringify(pageData), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else if (documentId) {
          // GET /documents/{documentId}/pages - List pages for a document
          console.log(`Listing pages for document ${documentId}`);

          // Permission check on parent document
          const canAccess = await checkDocumentAccess(supabaseClient, user.id, documentId);
          if (!canAccess) return createForbiddenResponse('Access denied to parent document');

          // Fetch pages
          const { data, error } = await supabaseClient
            .from('pages')
            .select('*') // Select all page fields
            .eq('document_id', documentId)
            .order('order', { ascending: true });

          if (error) throw error;

          return new Response(JSON.stringify(data || []), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          return createBadRequestResponse('Document ID or Page ID required');
        }
      }
      case 'POST': { // Create page for a document
        if (!documentId) {
          return createBadRequestResponse('Document ID is required to create a page');
        }
        console.log(`POST /documents/${documentId}/pages`);

        let body: any;
        try {
          body = await req.json();
          const errors: ValidationErrors = {};
          if (!body.name) errors.name = ['Page name is required'];
          // Content can be optional initially

          if (Object.keys(errors).length > 0) {
            return createValidationErrorResponse(errors);
          }
        } catch (e) {
          return createBadRequestResponse(e instanceof Error ? e.message : 'Invalid JSON body');
        }

        // Permission check on parent document
        const canManage = await checkDocumentManagement(supabaseClient, user.id, documentId);
        if (!canManage) return createForbiddenResponse('Not authorized to manage pages in this document');

        // Get max order for the document
        const { data: maxOrderData, error: maxOrderError } = await supabaseClient
          .from('pages')
          .select('"order"') // Ensure correct quoting for "order"
          .eq('document_id', documentId)
          .order('"order"', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (maxOrderError) throw maxOrderError;
        const nextOrder = maxOrderData ? (maxOrderData.order + 1) : 0;

        // Insert page
        const { data, error } = await supabaseClient
          .from('pages')
          .insert({
            document_id: documentId,
            name: body.name,
            content: body.content, // Optional
            order: body.order ?? nextOrder, // Allow specifying order or default to end
          })
          .select()
          .single();

        if (error) throw error; // Handle specific DB errors in main catch

        return new Response(JSON.stringify(data), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      case 'PUT': { // Update page
        if (!pageId) {
          return createBadRequestResponse('Page ID required');
        }
        console.log(`PUT /pages/${pageId}`);
        let body: any;
        try {
          body = await req.json();
          if (Object.keys(body).length === 0) throw new Error('No update data provided');
          // Content can be optional for update
        } catch (e) {
          return createBadRequestResponse(e instanceof Error ? e.message : 'Invalid JSON body');
        }

        // Fetch current page to get document_id for permission check
        const { data: currentPage, error: fetchError } = await supabaseClient
          .from('pages')
          .select('document_id')
          .eq('id', pageId)
          .single();

        if (fetchError) return createNotFoundResponse('Page not found');

        // Permission check on parent document
        const canManage = await checkDocumentManagement(supabaseClient, user.id, currentPage.document_id);
        if (!canManage) return createForbiddenResponse('Not authorized to manage pages in this document');

        // Prepare allowed updates
        const allowedUpdates = {
          name: body.name,
          content: body.content,
          order: body.order,
        };
        Object.keys(allowedUpdates).forEach(key => {
          if ((allowedUpdates as any)[key] === undefined) delete (allowedUpdates as any)[key];
        });

        // Update page
        const { data, error } = await supabaseClient
          .from('pages')
          .update(allowedUpdates)
          .eq('id', pageId)
          .select()
          .single();

        if (error) {
          if (error.code === 'PGRST204') return createNotFoundResponse('Page not found');
          throw error; // Handle specific DB errors in main catch
        }

        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      case 'DELETE': { // Delete page
        if (!pageId) {
          return createBadRequestResponse('Page ID required');
        }
        console.log(`DELETE /pages/${pageId}`);

        // Fetch current page to get document_id for permission check
        const { data: currentPage, error: fetchError } = await supabaseClient
          .from('pages')
          .select('document_id')
          .eq('id', pageId)
          .single();

        if (fetchError) return createNotFoundResponse('Page not found');

        // Permission check on parent document
        const canManage = await checkDocumentManagement(supabaseClient, user.id, currentPage.document_id);
        if (!canManage) return createForbiddenResponse('Not authorized to manage pages in this document');

        // Delete page
        const { error } = await supabaseClient
          .from('pages')
          .delete()
          .eq('id', pageId);

        if (error) {
          if (error.code === 'PGRST204') return createNotFoundResponse('Page not found');
          // Handle FK constraints (e.g., document_comments referencing page)
          if (error.code === '23503') return createBadRequestResponse('Cannot delete page with existing comments or references.');
          throw error;
        }

        return new Response(null, { status: 204, headers: { ...corsHeaders } });
      }
      default:
        return createMethodNotAllowedResponse();
    }
  } catch (error) {
    // Handle potential database errors
    if (error.code) { // Check if it looks like a PostgrestError
        console.error('Database Error:', error.message, error.code, error.details);
        if (error.code === '23505') return createConflictResponse(`Record already exists: ${error.details}`);
        if (error.code === '23514') return createBadRequestResponse(`Invalid input: ${error.details}`);
        if (error.code === '23503') return createBadRequestResponse(`Invalid reference: ${error.details}`);
    }
    // Use the standardized internal server error response for other errors
    return createInternalServerErrorResponse(undefined, error);
  }
});
