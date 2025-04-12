import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

console.log('Custom Field Definitions function started');

// Helper function to check if a user has permission to manage custom field definitions
async function checkCustomFieldPermission(
  supabaseClient: any,
  userId: string,
): Promise<boolean> {
  // Use the has_permission RPC function to check for admin:manage_custom_fields permission
  const { data: hasPermission, error: permissionError } = await supabaseClient.rpc(
    'has_permission',
    {
      user_id: userId,
      company_id: '00000000-0000-0000-0000-000000000000', // System-wide permission check
      permission_key: 'admin:manage_custom_fields',
    },
  );
  
  if (permissionError) {
    console.error(
      `Error checking custom field definition permission for user ${userId}:`,
      permissionError.message,
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

  try {
    // Create Supabase client with auth header
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      },
    );

    // Get user data
    const { data: { user }, error: userError } = await supabaseClient.auth
      .getUser();
    if (userError || !user) {
      console.error('User not authenticated:', userError?.message);
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(
      `Handling ${req.method} request for custom_field_definitions by user ${user.id}`,
    );

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter((part) => part);
    const definitionId = pathParts[3]; // Expecting /functions/v1/custom-field-definitions/{id}

    // Check permissions for modification methods
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      const hasPermission = await checkCustomFieldPermission(supabaseClient, user.id);
      if (!hasPermission) {
        console.error(
          `User ${user.id} is not authorized to modify custom field definitions.`,
        );
        return new Response(
          JSON.stringify({
            error: 'Forbidden: Only authorized staff can manage custom field definitions',
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }
    }

    // Routing based on HTTP method
    switch (req.method) {
      case 'GET': {
        if (definitionId) {
          // GET /custom-field-definitions/{id}
          console.log(`Fetching definition ${definitionId}`);
          const { data, error } = await supabaseClient
            .from('custom_field_definitions')
            .select('*')
            .eq('id', definitionId)
            .single();

          if (error) throw error;
          if (!data) {
            return new Response(JSON.stringify({ error: 'Not Found' }), {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } else {
          // GET /custom-field-definitions (List all)
          console.log('Fetching all definitions');
          // Add filtering/sorting based on query params if needed (e.g., ?entity_type=project)
          const entityTypeFilter = url.searchParams.get('entity_type');
          let query = supabaseClient.from('custom_field_definitions').select(
            '*',
          ).order('order', { ascending: true });

          if (entityTypeFilter) {
            query = query.eq('entity_type', entityTypeFilter);
          }

          const { data, error } = await query;

          if (error) throw error;

          return new Response(JSON.stringify(data || []), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }
      }
      case 'POST': {
        // POST /custom-field-definitions (Create)
        console.log('Creating new definition');
        let newDefinitionData;
        try {
          newDefinitionData = await req.json();
          // TODO(validation): Add more robust validation: check entity_type/field_type against enums, validate options format for 'select' type, validate validation_rules JSON structure.
          if (
            !newDefinitionData.name || !newDefinitionData.label ||
            !newDefinitionData.entity_type || !newDefinitionData.field_type
          ) {
            throw new Error(
              'Missing required fields: name, label, entity_type, field_type',
            );
          }
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Unknown error';
          return new Response(
            JSON.stringify({ error: `Bad Request: ${errorMessage}` }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        const { data, error } = await supabaseClient
          .from('custom_field_definitions')
          .insert({
            name: newDefinitionData.name,
            label: newDefinitionData.label,
            entity_type: newDefinitionData.entity_type,
            field_type: newDefinitionData.field_type,
            options: newDefinitionData.options, // Optional
            validation_rules: newDefinitionData.validation_rules, // Optional
            is_filterable: newDefinitionData.is_filterable ?? false,
            is_sortable: newDefinitionData.is_sortable ?? false,
            order: newDefinitionData.order ?? 0,
          })
          .select()
          .single();

        if (error) {
          console.error('Error creating definition:', error.message);
          
          // Handle specific database errors
          if (error.code === '23505') { // PostgreSQL unique violation code
            const constraintMatch = error.message.match(/violates unique constraint "(.+?)"/);
            const constraint = constraintMatch ? constraintMatch[1] : 'unknown';
            
            if (constraint.includes('name')) {
              return new Response(
                JSON.stringify({
                  error: `Definition with name '${newDefinitionData.name}' already exists.`,
                }),
                {
                  status: 409, // Conflict
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                },
              );
            } else if (constraint.includes('entity_type_field_name')) {
              return new Response(
                JSON.stringify({
                  error: `A field with name '${newDefinitionData.name}' already exists for entity type '${newDefinitionData.entity_type}'.`,
                }),
                {
                  status: 409, // Conflict
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                },
              );
            }
          } else if (error.code === '23514') { // Check constraint violation
            return new Response(
              JSON.stringify({
                error: `Invalid field value: ${error.message}. Please check that entity_type and field_type are valid values.`,
              }),
              {
                status: 400, // Bad Request
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          } else if (error.code === '23502') { // Not null violation
            const columnMatch = error.message.match(/null value in column "(.+?)"/);
            const column = columnMatch ? columnMatch[1] : 'unknown';
            
            return new Response(
              JSON.stringify({
                error: `The ${column} field is required.`,
              }),
              {
                status: 400, // Bad Request
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }
          
          throw error;
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 201,
        });
      }
      case 'PUT': {
        // PUT /custom-field-definitions/{id} (Update)
        if (!definitionId) {
          return new Response(
            JSON.stringify({
              error: 'Bad Request: Definition ID missing in URL',
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        console.log(`Updating definition ${definitionId}`);
        let updateData;
        try {
          updateData = await req.json();
          if (Object.keys(updateData).length === 0) {
            throw new Error('No update data provided');
          }
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Unknown error';
          return new Response(
            JSON.stringify({ error: `Bad Request: ${errorMessage}` }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Prepare allowed update fields (prevent updating ID, name, entity_type)
        const allowedUpdates = {
          label: updateData.label,
          field_type: updateData.field_type, // Allow changing type? Needs careful consideration.
          options: updateData.options,
          validation_rules: updateData.validation_rules,
          is_filterable: updateData.is_filterable,
          is_sortable: updateData.is_sortable,
          order: updateData.order,
        };
        // Remove undefined fields
        Object.keys(allowedUpdates).forEach((key) => {
          if (
            allowedUpdates[key as keyof typeof allowedUpdates] === undefined
          ) {
            delete allowedUpdates[key as keyof typeof allowedUpdates];
          }
        });

        const { data, error } = await supabaseClient
          .from('custom_field_definitions')
          .update(allowedUpdates)
          .eq('id', definitionId)
          .select()
          .single();

        if (error) {
          console.error(
            `Error updating definition ${definitionId}:`,
            error.message,
          );
          
          // Handle specific errors
          if (error.code === 'PGRST204') { // No rows updated/selected
            return new Response(
              JSON.stringify({
                error: 'Definition not found or update failed',
              }),
              {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          } else if (error.code === '23514') { // Check constraint violation
            return new Response(
              JSON.stringify({
                error: `Invalid field value: ${error.message}. Please check that field_type and other values are valid.`,
              }),
              {
                status: 400, // Bad Request
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          } else if (error.code === '23502') { // Not null violation
            const columnMatch = error.message.match(/null value in column "(.+?)"/);
            const column = columnMatch ? columnMatch[1] : 'unknown';
            
            return new Response(
              JSON.stringify({
                error: `The ${column} field is required.`,
              }),
              {
                status: 400, // Bad Request
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }
          
          throw error;
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      case 'DELETE': {
        // DELETE /custom-field-definitions/{id}
        if (!definitionId) {
          return new Response(
            JSON.stringify({
              error: 'Bad Request: Definition ID missing in URL',
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        console.log(`Deleting definition ${definitionId}`);

        const { error } = await supabaseClient
          .from('custom_field_definitions')
          .delete()
          .eq('id', definitionId);

        if (error) {
          console.error(
            `Error deleting definition ${definitionId}:`,
            error.message,
          );
          
          // Handle specific database errors
          if (error.code === 'PGRST204') { // No rows deleted
            return new Response(
              JSON.stringify({ error: 'Custom field definition not found or already deleted' }),
              {
                status: 404, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          } else if (error.code === '23503') { // Foreign key violation
            return new Response(
              JSON.stringify({ 
                error: 'Cannot delete this custom field definition because it is in use. Delete all field values using this definition first.' 
              }),
              {
                status: 409, // Conflict
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }
          
          throw error;
        }

        // Check if deletion happened (optional, count might be needed)
        // Assuming success if no error due to permission checks

        return new Response(null, { headers: { ...corsHeaders }, status: 204 }); // No Content
      }
      default:
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : 'Unknown internal server error';
    console.error('Internal Server Error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
