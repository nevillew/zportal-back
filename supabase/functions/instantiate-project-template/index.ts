// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  PostgrestError,
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

console.log('Instantiate Project Template function started');

interface InstantiateRequest {
  template_version_id: string;
  target_company_id: string;
  new_project_name: string;
  placeholder_values?: { [key: string]: string }; // Optional user-provided overrides
  project_owner_id?: string; // Optional
}

// Placeholder for template data structures (adjust based on actual schema if needed)
interface SectionTemplate {
  id: string;
  name: string; // May contain placeholders
  type: string;
  order: number;
  is_public: boolean;
  task_templates?: TaskTemplate[]; // Assuming we fetch tasks nested under sections
}

interface TaskTemplate {
  id: string;
  name: string; // May contain placeholders
  description?: string; // May contain placeholders
  order: number;
  is_self_service: boolean;
  estimated_effort_hours?: number;
  condition_template?: any; // JSONB
  custom_field_template_values?: { [definitionId: string]: any }; // JSONB
}

// --- Helper Function for Placeholder Resolution ---
// deno-lint-ignore no-explicit-any
async function resolvePlaceholders(
  text: string | null | undefined,
  placeholderValues: { [key: string]: string } | undefined,
  definedPlaceholders: any[] | undefined, // From project_template_versions.defined_placeholders
  companyData: any, // Fetched company record
  companyCustomFields: { [fieldName: string]: any } | undefined, // Formatted custom fields for the company
): Promise<string> {
  if (!text) {
    return '';
  }

  let resolvedText = text;
  const placeholderRegex = /{{(.*?)}}/g;
  let match;

  // Use a loop that continues as long as a match is found in the *original* text
  // This prevents issues with nested or repeated placeholders if replacement modifies the string in a way that affects subsequent regex matches.
  // A more robust approach might involve multiple passes or more complex parsing if placeholders can contain other placeholders.
  while ((match = placeholderRegex.exec(text)) !== null) {
    const fullMatch = match[0]; // e.g., {{client_contact}}
    const key = match[1].trim(); // e.g., client_contact
    let replacementValue = ''; // Default to empty string if not found

    console.log(`Resolving placeholder: ${key}`);

    // 1. Check user-provided overrides first
    if (placeholderValues && placeholderValues[key] !== undefined) {
      replacementValue = placeholderValues[key];
      console.log(` -> Found in provided values: "${replacementValue}"`);
    } else {
      // 2. Check defined placeholders and their sources
      const definition = definedPlaceholders?.find((p) => p.key === key);
      if (definition?.source) {
        console.log(` -> Checking source: ${definition.source}`);
        const sourceParts = String(definition.source).split(':'); // Ensure source is treated as string
        const sourceType = sourceParts[0]; // e.g., 'company.field_name' or 'company.custom_field'
        const sourceKey = sourceParts[1]; // e.g., 'name' or 'main_contact_name'

        if (
          sourceType === 'company.field_name' && companyData &&
          companyData[sourceKey] !== undefined
        ) {
          replacementValue = String(companyData[sourceKey]);
          console.log(
            ` -> Found in company standard field "${sourceKey}": "${replacementValue}"`,
          );
        } else if (
          sourceType === 'company.custom_field' && companyCustomFields &&
          companyCustomFields[sourceKey] !== undefined
        ) {
          // Assuming companyCustomFields is { fieldName: { value: ... } }
          replacementValue = String(
            companyCustomFields[sourceKey]?.value ?? '',
          );
          console.log(
            ` -> Found in company custom field "${sourceKey}": "${replacementValue}"`,
          );
        } else {
          console.warn(
            ` -> Source "${definition.source}" for key "${key}" not found or value missing.`,
          );
        }
      } else {
        console.warn(
          ` -> Placeholder key "${key}" not found in provided values or template definitions.`,
        );
      }
    }

    // Replace *all* occurrences of the full match in the current resolvedText state
    // Use a regex for global replacement within the loop's current text state
    // Escape special regex characters in the placeholder key itself
    resolvedText = resolvedText.replace(
      new RegExp(fullMatch.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'),
      replacementValue,
    );
  }

  return resolvedText;
}

// --- Main Handler ---
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
    if (userError || !authUser) {
      return createUnauthorizedResponse(userError?.message);
    }
    user = authUser; // Assign user for later use
    console.log(`Handling ${req.method} request for user ${user.id}`);
  } catch (e) {
    const setupErrorMessage = e instanceof Error
      ? e.message
      : 'Unknown error during setup';
    console.error(
      'Error initializing Supabase client or getting user:',
      setupErrorMessage,
    );
    return createInternalServerErrorResponse('Internal Server Error during setup');
  }

  // --- Request Parsing and Validation ---
  if (req.method !== 'POST') {
    return createMethodNotAllowedResponse();
  }

  let requestData: InstantiateRequest;
  try {
    requestData = await req.json();
    const errors: { [field: string]: string[] } = {};
    if (!requestData.template_version_id) {
      errors.template_version_id = ['Template version ID is required'];
    }
    if (!requestData.target_company_id) {
      errors.target_company_id = ['Target company ID is required'];
    }
    if (!requestData.new_project_name) {
      errors.new_project_name = ['New project name is required'];
    }

    if (Object.keys(errors).length > 0) {
      return createValidationErrorResponse(errors);
    }
  } catch (e) {
    const parseErrorMessage = e instanceof Error
      ? e.message
      : 'Invalid JSON body';
    return createBadRequestResponse(parseErrorMessage);
  }

  console.log(
    `Instantiating template ${requestData.template_version_id} for company ${requestData.target_company_id}`,
  );

  // --- Permission Check ---
  // User needs 'project:create' permission for the target company OR be staff
  try {
    const { data: permissionData, error: permissionError } =
      await supabaseClient.rpc(
        'has_permission',
        {
          user_id: user.id,
          company_id: requestData.target_company_id,
          permission_key: 'project:create',
        },
      );
    if (permissionError) throw permissionError;

    const { data: profile, error: profileError } = await supabaseClient
      .from('user_profiles').select('is_staff').eq('user_id', user.id).single();
    if (profileError) throw profileError;

    if (!profile?.is_staff && !permissionData) {
      console.error(
        `User ${user.id} not authorized to create projects in company ${requestData.target_company_id}.`,
      );
      return createForbiddenResponse();
    }
  } catch (error) {
    const permissionCheckErrorMessage = error instanceof Error
      ? error.message
      : 'Unknown error checking permissions';
    console.error('Error checking permissions:', permissionCheckErrorMessage);
    return createInternalServerErrorResponse('Internal Server Error checking permissions');
  }

  // --- Main Instantiation Logic ---
  // Wrap the core logic in a try-catch for graceful error handling
  try {
    // --- Fetch Data for Placeholder Resolution ---
    console.log('Fetching template version details...');
    // 1. Fetch Template Version Details (including defined placeholders)
    const { data: templateVersion, error: templateError } = await supabaseClient
      .from('project_template_versions')
      .select('defined_placeholders')
      .eq('id', requestData.template_version_id)
      .single();

    if (templateError || !templateVersion) {
      console.error(
        `Error fetching template version ${requestData.template_version_id}:`,
        templateError?.message,
      );
      // Use 404 specifically for template not found
      return createNotFoundResponse('Template version not found.');
    }
    const definedPlaceholders = templateVersion.defined_placeholders as
      | any[]
      | undefined; // Cast for use
    console.log('Template version details fetched.');

    // 2. Fetch Company Data (Standard Fields)
    console.log('Fetching company data...');
    const { data: companyData, error: companyError } = await supabaseClient
      .from('companies')
      .select('*') // Select all standard fields for potential use
      .eq('id', requestData.target_company_id)
      .single();

    if (companyError || !companyData) {
      console.error(
        `Error fetching company ${requestData.target_company_id}:`,
        companyError?.message,
      );
      // Use 404 specifically for company not found
      return createNotFoundResponse('Target company not found.');
    }
    console.log('Company data fetched.');

    // 3. Fetch Company Custom Fields
    console.log('Fetching company custom fields...');
    const { data: companyCustomFieldValues, error: cfError } =
      await supabaseClient
        .from('custom_field_values')
        .select(`value, custom_field_definitions ( name )`) // Fetch definition name
        .eq('entity_id', requestData.target_company_id)
        .eq('custom_field_definitions.entity_type', 'company'); // Ensure we only get company fields

    if (cfError) {
      console.error(
        `Error fetching custom fields for company ${requestData.target_company_id}:`,
        cfError.message,
      );
      // Proceed without company custom fields, but log the error. Error is handled later if critical.
    }
    console.log('Company custom fields fetched.');

    // Format company custom fields for easier lookup in the helper function
    const companyCustomFields: { [fieldName: string]: { value: any } } = {};
    if (companyCustomFieldValues) {
      companyCustomFieldValues.forEach((cf) => {
        // The join might return an array, handle potential null/undefined definition
        const definitionName = cf.custom_field_definitions?.[0]?.name;
        if (definitionName) {
          companyCustomFields[definitionName] = { value: cf.value };
        }
      });
    }

    // --- Placeholder Resolution Example (will be used later) ---
    const resolvedProjectName = await resolvePlaceholders(
      requestData.new_project_name, // Allow placeholders in project name too? Or just use as is? Assuming as is for now.
      requestData.placeholder_values,
      definedPlaceholders,
      companyData,
      companyCustomFields,
    );
    // console.log(`Resolved Project Name (example): ${resolvedProjectName}`); // Keep commented unless debugging placeholders

    // --- Fetch Template Structure (Sections and Tasks) ---
    console.log('Fetching template structure (sections and tasks)...');
    const { data: sectionTemplatesData, error: sectionsError } =
      await supabaseClient
        .from('section_templates')
        .select(`
            *,
            task_templates ( * )
        `)
        .eq('project_template_version_id', requestData.template_version_id)
        .order('order', { ascending: true }) // Order sections
        .order('order', { foreignTable: 'task_templates', ascending: true }); // Order tasks within sections

    if (sectionsError) {
      console.error(
        `Error fetching section/task templates for version ${requestData.template_version_id}:`,
        `Error fetching section/task templates for version ${requestData.template_version_id}: ${sectionsError.message}`,
      );
      // Throw error to be caught by the main try-catch block
      throw new Error('Failed to fetch template structure.');
    }

    const sectionTemplates = sectionTemplatesData as SectionTemplate[] || []; // Type cast
    console.log(`Fetched ${sectionTemplates.length} section templates.`);
    console.log(`Fetched ${sectionTemplates.length} section templates.`);

    // --- TODO(transaction): Implement Transaction ---
    // Ideally, all database operations below should be wrapped in a single transaction.
    // Supabase Edge Functions don't directly expose transaction control over multiple operations.
    // Consider converting this entire logic into a PostgreSQL function (RPC) called by the Edge Function
    // or accept potential partial creation on error. For now, proceed without explicit transaction.
    console.warn(
      'TODO(transaction): Wrap below operations in a transaction (e.g., via RPC) to ensure atomicity.',
    );

    // --- Create Project Record ---
    // Using resolvedProjectName if we decide project names can have placeholders, else requestData.new_project_name
    const projectNameToUse = requestData.new_project_name; // Sticking to original name for now as per previous log
    const { data: newProject, error: projectInsertError } = await supabaseClient
      .from('projects')
      .insert({
        name: projectNameToUse,
        company_id: requestData.target_company_id,
        project_template_version_id: requestData.template_version_id,
        project_owner_id: requestData.project_owner_id, // Optional owner from request
        status: 'Planning', // Default status for new projects from template
        stage: 'Kick-off', // Default stage
        health_status: 'Unknown', // Default health
      })
      .select('id') // Select only the ID
      .single();

    if (projectInsertError || !newProject) {
      console.error(
        'Error creating project record:',
        projectInsertError?.message,
        `Error creating project record: ${projectInsertError?.message}`,
      );
      // Throw error to be caught by the main try-catch block
      throw new Error('Failed to create project record.');
    }
    const newProjectId = newProject.id;
    console.log(`Created project record with ID: ${newProjectId}`);

    // --- Loop and Create Sections & Tasks ---
    const createdTasksCustomFieldValues: any[] = []; // Collect all task custom field values to insert later

    for (const sectionTpl of sectionTemplates) {
      const resolvedSectionName = await resolvePlaceholders(
        sectionTpl.name,
        requestData.placeholder_values,
        definedPlaceholders,
        companyData,
        companyCustomFields,
      );

      const { data: newSection, error: sectionInsertError } =
        await supabaseClient
          .from('sections')
          .insert({
            project_id: newProjectId,
            section_template_id: sectionTpl.id,
            name: resolvedSectionName,
            type: sectionTpl.type,
            order: sectionTpl.order,
            is_public: sectionTpl.is_public,
            status: 'Not Started', // Default status
          })
          .select('id')
          .single();

      if (sectionInsertError || !newSection) {
        console.error(
          `Error creating section from template ${sectionTpl.id} ('${resolvedSectionName}'):`,
          sectionInsertError?.message,
          `Error creating section from template ${sectionTpl.id} ('${resolvedSectionName}'): ${sectionInsertError?.message}`,
        );
        // TODO(transaction): Rollback needed here if transaction is implemented.
        // Throw error to be caught by the main try-catch block
        throw new Error(`Failed to create section '${resolvedSectionName}'.`);
      }
      const newSectionId = newSection.id;
      console.log(
        ` -> Created section '${resolvedSectionName}' (ID: ${newSectionId})`,
      );

      // Loop through tasks for this section template
      if (sectionTpl.task_templates && sectionTpl.task_templates.length > 0) {
        for (const taskTpl of sectionTpl.task_templates) {
          const resolvedTaskName = await resolvePlaceholders(
            taskTpl.name,
            requestData.placeholder_values,
            definedPlaceholders,
            companyData,
            companyCustomFields,
          );
          const resolvedTaskDescription = await resolvePlaceholders(
            taskTpl.description,
            requestData.placeholder_values,
            definedPlaceholders,
            companyData,
            companyCustomFields,
          );

          const { data: newTask, error: taskInsertError } = await supabaseClient
            .from('tasks')
            .insert({
              section_id: newSectionId,
              task_template_id: taskTpl.id,
              name: resolvedTaskName,
              description: resolvedTaskDescription,
              order: taskTpl.order,
              status: 'Open', // Default status for new tasks
              is_self_service: taskTpl.is_self_service,
              estimated_effort_hours: taskTpl.estimated_effort_hours,
              // Store condition_template directly into condition field for now
              condition: taskTpl.condition_template,
              // Other fields like milestone_id, depends_on_task_id might need resolving if templates support them
            })
            .select('id')
            .single();

          if (taskInsertError || !newTask) {
            console.error(
              `Error creating task from template ${taskTpl.id} ('${resolvedTaskName}'):`,
              taskInsertError?.message,
              `Error creating task from template ${taskTpl.id} ('${resolvedTaskName}'): ${taskInsertError?.message}`,
            );
            // TODO(transaction): Rollback needed here if transaction is implemented.
            // Throw error to be caught by the main try-catch block
            throw new Error(`Failed to create task '${resolvedTaskName}'.`);
          }
          const newTaskId = newTask.id;
          console.log(
            `   -> Created task '${resolvedTaskName}' (ID: ${newTaskId})`,
          );

          // Prepare custom field values for this task
          if (taskTpl.custom_field_template_values) {
            for (const definitionId in taskTpl.custom_field_template_values) {
              // We assume the key in custom_field_template_values IS the definition_id
              createdTasksCustomFieldValues.push({
                definition_id: definitionId,
                entity_id: newTaskId,
                value: taskTpl.custom_field_template_values[definitionId], // Store raw value
              });
            }
          }
        }
      }
    }

    // --- Bulk Insert Task Custom Field Values ---
    if (createdTasksCustomFieldValues.length > 0) {
      console.log(
        `Attempting to insert ${createdTasksCustomFieldValues.length} task custom field values.`,
      );
      const { error: cfInsertError } = await supabaseClient
        .from('custom_field_values')
        .insert(createdTasksCustomFieldValues);

      if (cfInsertError) {
        console.error(
          'Error bulk inserting task custom field values:',
          cfInsertError.message,
        );
        // TODO(transaction): Rollback needed here if transaction is implemented.
        // Decide if this is a critical failure or just a warning. Currently treated as critical.
        // Throw error to be caught by the main try-catch block
        throw new Error('Failed to insert task custom field values.');
      }
      console.log('Successfully inserted task custom field values.');
    }

    console.log(
      `Successfully instantiated template ${requestData.template_version_id}, created project ${newProjectId}`,
    );

    return new Response(JSON.stringify({ project_id: newProjectId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 201, // Created
    });

  } catch (error) {
    // Catch any error thrown during the process
    const instantiationErrorMessage = error instanceof Error
      ? error.message
      : 'Unknown internal server error during instantiation';
    console.error('Project Instantiation Failed:', instantiationErrorMessage, error);
    // TODO(transaction): Implement transaction rollback here if applicable (depends on chosen transaction strategy).
    // Return a specific error message indicating failure during instantiation
    return createInternalServerErrorResponse(
        `Project instantiation failed: ${instantiationErrorMessage}`,
        error instanceof Error ? error : undefined // Pass original error if available
    );
  }
});
