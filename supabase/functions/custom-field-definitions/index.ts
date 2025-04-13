import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  createBadRequestResponse,
  createConflictResponse,
  createForbiddenResponse,
  createInternalServerErrorResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  createUnauthorizedResponse,
  // createValidationErrorResponse, // Keep if needed for future validation
} from '../_shared/validation.ts';

console.log('Custom Field Definitions function started');

// Helper function to check if a user has permission to manage custom field definitions
async function checkCustomFieldPermission(
  supabaseClient: SupabaseClient, // Use SupabaseClient type
  userId: string,
): Promise<boolean> {
  // Use the has_permission RPC function to check for admin:manage_custom_fields permission
  const { data: hasPermission, error: permissionError } = await supabaseClient
    .rpc(
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
      return createUnauthorizedResponse(userError?.message);
    }

    console.log(
      `Handling ${req.method} request for custom_field_definitions by user ${user.id}`,
    );

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter((part) => part);
    const definitionId = pathParts[3]; // Expecting /functions/v1/custom-field-definitions/{id}

    // Check permissions for modification methods
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      const hasPermission = await checkCustomFieldPermission(
        supabaseClient,
        user.id,
      );
      if (!hasPermission) {
        console.error(
          `User ${user.id} is not authorized to modify custom field definitions.`,
        );
        return createForbiddenResponse(
          'Only authorized staff can manage custom field definitions',
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

          if (error) {
            console.error(
              `Error fetching definition ${definitionId}:`,
              error.message,
            );
            throw error; // Let the main handler catch it
          }
          if (!data) {
            return createNotFoundResponse('Definition not found');
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
        let newDefinitionData: any;
        const errors: ValidationErrors = {};
        try {
          newDefinitionData = await req.json();

          // --- Validation ---
          if (!newDefinitionData.name) errors.name = ['Name is required'];
          if (!newDefinitionData.label) errors.label = ['Label is required'];
          if (!newDefinitionData.entity_type) {
            errors.entity_type = ['Entity type is required'];
          } else {
            validateEnum(
              newDefinitionData.entity_type,
              ['company', 'project', 'task', 'user', 'document'],
              'entity_type',
              errors,
            );
          }
          if (!newDefinitionData.field_type) {
            errors.field_type = ['Field type is required'];
          } else {
            validateEnum(
              newDefinitionData.field_type,
              [
                'text',
                'textarea',
                'number',
                'date',
                'boolean',
                'select',
                'multi_select',
                'url',
              ],
              'field_type',
              errors,
            );
          }

          // Validate options for select types
          if (
            ['select', 'multi_select'].includes(newDefinitionData.field_type)
          ) {
            if (
              !newDefinitionData.options ||
              !Array.isArray(newDefinitionData.options) ||
              newDefinitionData.options.length === 0
            ) {
              errors.options = [
                'Options array is required for select/multi_select types.',
              ];
            } else {
              newDefinitionData.options.forEach((opt: any, index: number) => {
                if (
                  typeof opt !== 'object' || opt === null ||
                  typeof opt.value !== 'string' || opt.value.trim() === '' ||
                  typeof opt.label !== 'string' || opt.label.trim() === ''
                ) {
                  errors.options = errors.options || [];
                  errors.options.push(
                    `Invalid option at index ${index}: Must be an object with non-empty string 'value' and 'label'.`,
                  );
                }
              });
            }
          }

          // Validate validation_rules structure (basic example)
          if (newDefinitionData.validation_rules) {
            try {
              const rules = typeof newDefinitionData.validation_rules ===
                  'string'
                ? JSON.parse(newDefinitionData.validation_rules)
                : newDefinitionData.validation_rules;
              if (typeof rules !== 'object' || rules === null) {
                throw new Error('Must be a JSON object.');
              }
              // Add more specific rule checks here (e.g., required is boolean, minLength is number)
            } catch (jsonError) {
              errors.validation_rules = [
                `Invalid JSON format: ${jsonError.message}`,
              ];
            }
          }

          // Validate validation_rules structure (basic type checks)
          if (newDefinitionData.validation_rules) {
            try {
              // Ensure it's an object
              const rules = typeof newDefinitionData.validation_rules === 'string'
                ? JSON.parse(newDefinitionData.validation_rules)
                : newDefinitionData.validation_rules;

              if (typeof rules !== 'object' || rules === null || Array.isArray(rules)) {
                throw new Error('Must be a JSON object.');
              }

              // Check specific rule types
              if (rules.required !== undefined && typeof rules.required !== 'boolean') {
                 errors.validation_rules = errors.validation_rules || [];
                 errors.validation_rules.push('Rule "required" must be a boolean.');
              }
              if (rules.minLength !== undefined && typeof rules.minLength !== 'number') {
                 errors.validation_rules = errors.validation_rules || [];
                 errors.validation_rules.push('Rule "minLength" must be a number.');
              }
              if (rules.maxLength !== undefined && typeof rules.maxLength !== 'number') {
                 errors.validation_rules = errors.validation_rules || [];
                 errors.validation_rules.push('Rule "maxLength" must be a number.');
              }
               if (rules.minValue !== undefined && typeof rules.minValue !== 'number') {
                 errors.validation_rules = errors.validation_rules || [];
                 errors.validation_rules.push('Rule "minValue" must be a number.');
              }
              if (rules.maxValue !== undefined && typeof rules.maxValue !== 'number') {
                 errors.validation_rules = errors.validation_rules || [];
                 errors.validation_rules.push('Rule "maxValue" must be a number.');
              }
              if (rules.pattern !== undefined && typeof rules.pattern !== 'string') {
                 errors.validation_rules = errors.validation_rules || [];
                 errors.validation_rules.push('Rule "pattern" must be a string.');
              }
              // Add more checks as needed for other defined rules

            } catch (jsonError) {
              errors.validation_rules = errors.validation_rules || [];
              errors.validation_rules.push(`Invalid JSON format or structure: ${jsonError.message}`);
            }
          }
          // --- End Validation ---

          if (Object.keys(errors).length > 0) {
            return createValidationErrorResponse(errors);
          }
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Unknown error';
          return createBadRequestResponse(
            `Error parsing request body: ${errorMessage}`,
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
            const constraintMatch = error.message.match(
              /violates unique constraint "(.+?)"/,
            );
            const constraint = constraintMatch ? constraintMatch[1] : 'unknown';
            if (constraint.includes('name')) {
              return createConflictResponse(
                `Definition with name '${newDefinitionData.name}' already exists.`,
              );
            } else if (constraint.includes('entity_type_field_name')) {
              return createConflictResponse(
                `A field with name '${newDefinitionData.name}' already exists for entity type '${newDefinitionData.entity_type}'.`,
              );
            }
          } else if (error.code === '23514') { // Check constraint violation
            return createBadRequestResponse(
              `Invalid field value: ${error.message}. Please check that entity_type and field_type are valid values.`,
            );
          } else if (error.code === '23502') { // Not null violation
            const columnMatch = error.message.match(
              /null value in column "(.+?)"/,
            );
            const column = columnMatch ? columnMatch[1] : 'unknown';
            return createBadRequestResponse(`The ${column} field is required.`);
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
          return createBadRequestResponse('Definition ID missing in URL');
        }
        console.log(`Updating definition ${definitionId}`);
        let updateData: any;
        const errors: ValidationErrors = {};
        try {
          updateData = await req.json();
          if (Object.keys(updateData).length === 0) {
            throw new Error('No update data provided');
          }

          // --- Validation ---
          if (updateData.field_type !== undefined) {
            validateEnum(
              updateData.field_type,
              [
                'text',
                'textarea',
                'number',
                'date',
                'boolean',
                'select',
                'multi_select',
                'url',
              ],
              'field_type',
              errors,
            );
          }
          // Validate options if field_type is select/multi_select (or if options are provided)
          if (
            updateData.options !== undefined &&
            (updateData.field_type === 'select' ||
              updateData.field_type === 'multi_select')
          ) {
            if (
              !Array.isArray(updateData.options) ||
              updateData.options.length === 0
            ) {
              errors.options = [
                'Options array cannot be empty for select/multi_select types.',
              ];
            } else {
              updateData.options.forEach((opt: any, index: number) => {
                if (
                  typeof opt !== 'object' || opt === null ||
                  typeof opt.value !== 'string' || opt.value.trim() === '' ||
                  typeof opt.label !== 'string' || opt.label.trim() === ''
                ) {
                  errors.options = errors.options || [];
                  errors.options.push(
                    `Invalid option at index ${index}: Must be an object with non-empty string 'value' and 'label'.`,
                  );
                }
              });
            }
          }
          // Validate validation_rules structure
          if (updateData.validation_rules !== undefined) {
            try {
              const rules = typeof updateData.validation_rules === 'string'
                ? JSON.parse(updateData.validation_rules)
                : updateData.validation_rules;
              if (typeof rules !== 'object' || rules === null) {
                throw new Error('Must be a JSON object.');
              }
              // Add more specific rule checks here
            } catch (jsonError) {
              errors.validation_rules = [
                `Invalid JSON format: ${jsonError.message}`,
              ];
            }
          }
          // Validate validation_rules structure
          if (updateData.validation_rules !== undefined) {
             try {
              // Ensure it's an object
              const rules = typeof updateData.validation_rules === 'string'
                ? JSON.parse(updateData.validation_rules)
                : updateData.validation_rules;

              if (typeof rules !== 'object' || rules === null || Array.isArray(rules)) {
                throw new Error('Must be a JSON object.');
              }

              // Check specific rule types
              if (rules.required !== undefined && typeof rules.required !== 'boolean') {
                 errors.validation_rules = errors.validation_rules || [];
                 errors.validation_rules.push('Rule "required" must be a boolean.');
              }
              if (rules.minLength !== undefined && typeof rules.minLength !== 'number') {
                 errors.validation_rules = errors.validation_rules || [];
                 errors.validation_rules.push('Rule "minLength" must be a number.');
              }
              if (rules.maxLength !== undefined && typeof rules.maxLength !== 'number') {
                 errors.validation_rules = errors.validation_rules || [];
                 errors.validation_rules.push('Rule "maxLength" must be a number.');
              }
               if (rules.minValue !== undefined && typeof rules.minValue !== 'number') {
                 errors.validation_rules = errors.validation_rules || [];
                 errors.validation_rules.push('Rule "minValue" must be a number.');
              }
              if (rules.maxValue !== undefined && typeof rules.maxValue !== 'number') {
                 errors.validation_rules = errors.validation_rules || [];
                 errors.validation_rules.push('Rule "maxValue" must be a number.');
              }
              if (rules.pattern !== undefined && typeof rules.pattern !== 'string') {
                 errors.validation_rules = errors.validation_rules || [];
                 errors.validation_rules.push('Rule "pattern" must be a string.');
              }
              // Add more checks as needed

            } catch (jsonError) {
              errors.validation_rules = errors.validation_rules || [];
              errors.validation_rules.push(`Invalid JSON format or structure: ${jsonError.message}`);
            }
          }
          // --- End Validation ---

          if (Object.keys(errors).length > 0) {
            return createValidationErrorResponse(errors);
          }
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Unknown error';
          return createBadRequestResponse(
            `Error parsing request body: ${errorMessage}`,
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
            return createNotFoundResponse(
              'Definition not found or update failed',
            );
          } else if (error.code === '23514') { // Check constraint violation
            return createBadRequestResponse(
              `Invalid field value: ${error.message}. Please check that field_type and other values are valid.`,
            );
          } else if (error.code === '23502') { // Not null violation
            const columnMatch = error.message.match(
              /null value in column "(.+?)"/,
            );
            const column = columnMatch ? columnMatch[1] : 'unknown';
            return createBadRequestResponse(`The ${column} field is required.`);
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
          return createBadRequestResponse('Definition ID missing in URL');
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
            return createNotFoundResponse(
              'Custom field definition not found or already deleted',
            );
          } else if (error.code === '23503') { // Foreign key violation
            return createConflictResponse(
              'Cannot delete this custom field definition because it is in use. Delete all field values using this definition first.',
            );
          }
          throw error;
        }

        // Check if deletion happened (optional, count might be needed)
        // Assuming success if no error due to permission checks

        return new Response(null, { headers: { ...corsHeaders }, status: 204 }); // No Content
      }
      default:
        return createMethodNotAllowedResponse();
    }
  } catch (error) {
    // Use the standardized internal server error response
    return createInternalServerErrorResponse(undefined, error);
  }
});
