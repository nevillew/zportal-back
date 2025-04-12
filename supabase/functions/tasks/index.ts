import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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
import { RRule } from 'rrule-deno'; // Import RRule library

console.log('Tasks function started');

// Helper function for enum validation
function validateEnum(field: string, value: unknown, allowedValues: string[], errors: { [field: string]: string[] }) {
  if (value !== undefined && typeof value === 'string' && !allowedValues.includes(value)) {
    errors[field] = [`Invalid ${field}. Must be one of: ${allowedValues.join(', ')}`];
  } else if (value !== undefined && typeof value !== 'string') {
     errors[field] = [`${field} must be a string.`];
  }
}

const validStatuses = ['Open', 'In Progress', 'Review', 'Complete', 'Blocked'];
const validPriorities = ['Low', 'Medium', 'High', 'Urgent'];

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

    console.log(`Handling ${req.method} request for user ${user.id}`); // Reverted incorrect fix

    const url = new URL(req.url);
    // Path: /functions/v1/tasks/{taskId}
    const pathParts = url.pathname.split('/').filter((part) => part);
    const taskId = pathParts[3];
    const sectionId = url.searchParams.get('section_id'); // Allow filtering by section_id
    const projectId = url.searchParams.get('project_id'); // Allow filtering by project_id (alternative)

    // Routing based on HTTP method and path
    switch (req.method) {
      case 'GET': {
        if (taskId) {
          // Implement GET /tasks/{id} (Get specific task details)
          console.log(`Fetching details for task ${taskId}, user ${user.id}`);

          // Fetch the specific task with related data
          // RLS policy "Users can view tasks of their projects" should enforce access
          const { data: task, error: taskError } = await supabaseClient
            .from('tasks')
            .select(`
              *,
              assignee:assigned_to_id ( full_name ),
              milestone:milestone_id ( name ),
              depends_on:depends_on_task_id ( name )
            `)
            .eq('id', taskId)
            .maybeSingle(); // Use maybeSingle for potential 404

          if (taskError) {
            console.error(`Error fetching task ${taskId}:`, taskError.message);
            throw taskError;
          }

          if (!task) {
            console.log(`Task ${taskId} not found or access denied for user ${user.id}`);
            return createNotFoundResponse('Task not found or access denied');
          }

          // Format response similar to the list endpoint
          const taskDetails = {
            ...task,
            assigned_to_name: task.assignee?.full_name,
            milestone_name: task.milestone?.name,
            depends_on_task_name: task.depends_on?.name,
            assignee: undefined,
            milestone: undefined,
            depends_on: undefined,
          };

          // Fetch associated custom fields for this task
          const { data: customFields, error: cfError } = await supabaseClient
            .from('custom_field_values')
            .select(`
              value,
              custom_field_definitions ( name, label, field_type, options )
            `)
            .eq('entity_id', taskId)
            .eq('custom_field_definitions.entity_type', 'task'); // Filter for task custom fields


          if (cfError) {
             console.error(`Error fetching custom fields for task ${taskId}:`, cfError);
             // Don't fail the whole request, just log and return task details without custom fields
          }

          // Format custom fields
          // deno-lint-ignore no-explicit-any
          const formattedCustomFields: { [key: string]: any } = {};
          if (customFields !== null) {
            customFields?.forEach((cf) => {
              // deno-lint-ignore no-explicit-any
              const definition = (cf.custom_field_definitions as any)?.[0];
              if (definition) {
                formattedCustomFields[definition.name] = {
                  label: definition.label,
                  value: cf.value,
                  type: definition.field_type,
                  options: definition.options,
                };
              }
            });
          }
          // deno-lint-ignore no-explicit-any
          (taskDetails as any).custom_fields = formattedCustomFields; // Add to response

          console.log(`Successfully fetched task ${taskId} with custom fields`);
          return new Response(JSON.stringify(taskDetails), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });

        } else if (sectionId) {
          // Implement GET /tasks?section_id={sectionId} (List tasks for a section)
          console.log(
            `Fetching tasks for section ${sectionId}, user ${user.id}`,
          );

          // Check if user can access the section first (implicitly checks project access via RLS)
          const { data: sectionCheck, error: sectionCheckError } =
            await supabaseClient
              .from('sections')
              .select('id, project_id')
              .eq('id', sectionId)
              .maybeSingle(); // RLS on sections table will apply

          if (sectionCheckError) throw sectionCheckError;
          if (!sectionCheck) {
            console.log(
              `Section ${sectionId} not found or access denied for user ${user.id}`,
            );
            return createNotFoundResponse('Section not found or access denied');
          }

          // Fetch tasks for the specified section
          // RLS policy "Users can view tasks of their projects" should enforce access
          const { data: tasks, error: tasksError } = await supabaseClient
            .from('tasks')
            .select(`
              *,
              assignee:assigned_to_id ( full_name ),
              milestone:milestone_id ( name ),
              depends_on:depends_on_task_id ( name )
            `)
            .eq('section_id', sectionId)
            .order('order', { ascending: true }); // Order by the 'order' column

          if (tasksError) {
            console.error(
              `Error fetching tasks for section ${sectionId}:`,
              tasksError.message,
            );
            throw tasksError;
          }

          // Format response
          const tasksList = tasks?.map((t) => ({
            ...t,
            assigned_to_name: t.assignee?.full_name,
            milestone_name: t.milestone?.name,
            depends_on_task_name: t.depends_on?.name,
            assignee: undefined,
            milestone: undefined,
            depends_on: undefined,
          })) || [];

          console.log(
            `Found ${tasksList.length} tasks for section ${sectionId}`,
          );
          return new Response(JSON.stringify(tasksList), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } else if (projectId) {
          // Implement GET /tasks?project_id={projectId} (List all tasks for a project)
          console.log(
            `Fetching all tasks for project ${projectId}, user ${user.id}`,
          );

          // Check if user can access the project first
          const { data: projectCheck, error: projectCheckError } =
            await supabaseClient
              .from('projects')
              .select('id')
              .eq('id', projectId)
              .maybeSingle(); // RLS on projects table will apply

          if (projectCheckError) throw projectCheckError;
          if (!projectCheck) {
            console.log(
              `Project ${projectId} not found or access denied for user ${user.id}`,
            );
            return createNotFoundResponse('Project not found or access denied');
          }

          // Fetch tasks by joining through sections
          // RLS policy "Users can view tasks of their projects" should enforce access
          const { data: tasks, error: tasksError } = await supabaseClient
            .from('tasks')
            .select(`
              *,
              sections!inner ( project_id ),
              assignee:assigned_to_id ( full_name ),
              milestone:milestone_id ( name ),
              depends_on:depends_on_task_id ( name )
            `)
            .eq('sections.project_id', projectId)
            .order('order', { ascending: true }); // Order by task order

          if (tasksError) {
            console.error(
              `Error fetching tasks for project ${projectId}:`,
              tasksError.message,
            );
            throw tasksError;
          }

          // Format response
          const tasksList = tasks?.map((t) => ({
            ...t,
            assigned_to_name: t.assignee?.full_name,
            milestone_name: t.milestone?.name,
            depends_on_task_name: t.depends_on?.name,
            sections: undefined, // Remove join helper
            assignee: undefined,
            milestone: undefined,
            depends_on: undefined,
          })) || [];

          console.log(
            `Found ${tasksList.length} tasks for project ${projectId}`,
          );
          return new Response(JSON.stringify(tasksList), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });

        } else {
          // Require section_id or project_id for listing tasks
          return createBadRequestResponse('section_id or project_id query parameter is required');
        }
      }
      case 'POST': {
        // Implement POST /tasks (Create task for a section)
        console.log(
          `Attempting to create a task, requested by user ${user.id}`,
        );

        // Parse request body
        // deno-lint-ignore no-explicit-any
        let newTaskData: any;
        try {
          newTaskData = await req.json();
          const errors: { [field: string]: string[] } = {};
          if (!newTaskData.name) errors.name = ['Task name is required'];
          if (!newTaskData.section_id) errors.section_id = ['Section ID is required'];
          // Validate status and priority enums
          validateEnum('status', newTaskData.status, validStatuses, errors);
          validateEnum('priority', newTaskData.priority, validPriorities, errors);

          if (Object.keys(errors).length > 0) {
             return createValidationErrorResponse(errors);
          }
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Invalid JSON body';
          return createBadRequestResponse(errorMessage);
        }
        const targetSectionId = newTaskData.section_id;

        // --- Dependency Validation (Basic) ---
        // Note: This only checks direct self-dependency. DB constraint handles this too.
        // A full cycle check might require a recursive query or different approach.
        // We don't have the new task's ID yet, so this check is better placed in PUT or handled by DB constraint.
        // --- End Dependency Validation ---


        // Check if user can access the section and get project info
        const { data: sectionToCheck, error: checkError } = await supabaseClient
          .from('sections')
          .select('project_id, projects ( company_id )')
          .eq('id', targetSectionId)
          .single();

        if (checkError || !sectionToCheck) {
          return createNotFoundResponse('Section not found or access denied');
        }

        // The join might return an array even with .single(), addressing TS2339
        // deno-lint-ignore no-explicit-any
        const projectCompanyId = (sectionToCheck?.projects as any)?.[0]?.company_id ?? (sectionToCheck?.projects as any)?.company_id;
        if (!projectCompanyId) {
          console.error(`Could not determine company ID for section ${targetSectionId}`);
          return createInternalServerErrorResponse('Project information not available');
        }

        // Permission check: Staff or user with 'task:manage'
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'task:manage',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(
            `User ${user.id} not authorized to manage tasks for section ${targetSectionId}.`,
          );
          return createForbiddenResponse();
        }

        // Get max order value for the section to place new task at the end
        const { data: maxOrderData, error: maxOrderError } =
          await supabaseClient
            .from('tasks')
            .select('order')
            .eq('section_id', targetSectionId)
            .order('order', { ascending: false })
            .limit(1)
            .maybeSingle(); // Use maybeSingle as section might be empty

        if (maxOrderError) {
          console.error(`Error fetching max order for section ${targetSectionId}:`, maxOrderError.message);
          throw maxOrderError;
        }

        const nextOrder = maxOrderData ? (maxOrderData.order + 1) : 0;

        // --- Calculate Initial Next Occurrence Date for Recurring Definitions ---
        let initialNextOccurrenceDate: string | null = newTaskData.next_occurrence_date || null;
        if (newTaskData.is_recurring_definition === true && newTaskData.recurrence_rule) {
          try {
            // Use 'now' as the effective start date for finding the first occurrence
            const now = new Date();
            // Ensure DTSTART is formatted correctly for RRule parsing
            const dtStartString = now.toISOString().replace(/[-:.]/g, '').substring(0, 15) + 'Z';
            const ruleString = `DTSTART:${dtStartString}\nRRULE:${newTaskData.recurrence_rule}`;
            console.log(`Attempting to parse RRULE string: ${ruleString}`); // Debug log
            const rule = RRule.fromString(ruleString);
            const firstOccurrence = rule.after(now, true); // Find first occurrence after or at 'now'

            if (firstOccurrence) {
              // Check against recurrence_end_date if provided
              if (newTaskData.recurrence_end_date && firstOccurrence > new Date(newTaskData.recurrence_end_date)) {
                console.log(`First occurrence (${firstOccurrence.toISOString()}) is after recurrence end date (${newTaskData.recurrence_end_date}). No initial occurrence.`);
                initialNextOccurrenceDate = null;
              } else {
                initialNextOccurrenceDate = firstOccurrence.toISOString();
                console.log(`Calculated initial next_occurrence_date: ${initialNextOccurrenceDate}`);
              }
            } else {
              console.warn(`Could not calculate first occurrence for rule: ${newTaskData.recurrence_rule}. Setting next_occurrence_date to null.`);
              initialNextOccurrenceDate = null;
            }
          } catch (parseError) {
            const parseErrorMessage = parseError instanceof Error ? parseError.message : 'Unknown error parsing RRULE';
            console.error(`Error parsing recurrence rule during task creation: ${parseErrorMessage}`);
            // Return validation error if rule is invalid
            return createValidationErrorResponse({ recurrence_rule: [`Invalid recurrence rule: ${parseErrorMessage}`] });
          }
        }
        // --- End Calculate Initial Next Occurrence Date ---

        // Insert new task
        const { data: createdTask, error: insertError } = await supabaseClient
          .from('tasks')
          .insert({
            section_id: targetSectionId,
            name: newTaskData.name,
            description: newTaskData.description,
            status: newTaskData.status || 'Open', // Default status
            priority: newTaskData.priority || 'Medium', // Default priority
            assigned_to_id: newTaskData.assigned_to_id,
            due_date: newTaskData.due_date,
            estimated_effort_hours: newTaskData.estimated_effort_hours, // Use correct field name
            actual_hours: newTaskData.actual_hours, // Add actual_hours
            milestone_id: newTaskData.milestone_id,
            depends_on_task_id: newTaskData.depends_on_task_id,
            order: nextOrder,
            // Recurrence fields
            is_recurring_definition: newTaskData.is_recurring_definition ?? false,
            recurrence_rule: newTaskData.recurrence_rule,
            recurrence_end_date: newTaskData.recurrence_end_date,
            next_occurrence_date: initialNextOccurrenceDate, // Use calculated date
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error creating task:', insertError.message);
          // TODO(db-error): Check for specific DB errors (e.g., FK violation, unique constraint) and return appropriate 4xx status codes.
          throw insertError;
        }

        // Handle custom fields provided in the request
        if (newTaskData.custom_fields && typeof newTaskData.custom_fields === 'object') {
          // Fetch relevant definitions for 'task' entity type
          const { data: definitions, error: defError } = await supabaseClient
            .from('custom_field_definitions')
            .select('id, name')
            .eq('entity_type', 'task');

          if (defError) {
            console.error("Error fetching custom field definitions for task:", defError.message);
          } else if (definitions) {
            // deno-lint-ignore no-explicit-any
            const valuesToUpsert: any[] = [];
            const definitionMap = new Map(definitions.map(d => [d.name, d.id]));

            for (const fieldName in newTaskData.custom_fields) {
              if (definitionMap.has(fieldName)) {
                valuesToUpsert.push({
                  definition_id: definitionMap.get(fieldName),
                  entity_id: createdTask.id, // Use the ID of the created task
                  value: newTaskData.custom_fields[fieldName]
                });
              } else {
                console.warn(`Custom field definition not found for task field: ${fieldName}`);
              }
            }

            if (valuesToUpsert.length > 0) {
              const { error: upsertError } = await supabaseClient
                .from('custom_field_values')
                .upsert(valuesToUpsert, { onConflict: 'definition_id, entity_id' });

              if (upsertError) {
                console.error("Error upserting custom field values for task:", upsertError.message);
                // Log error but don't fail the whole request
              }
            }
          }
        }

        console.log(
          `Successfully created task ${createdTask.id} for section ${targetSectionId}`,
        );
        return new Response(JSON.stringify(createdTask), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 201, // Created
        });
      }
      case 'PUT': {
        if (!taskId) {
          return createBadRequestResponse('Task ID missing in URL');
        }
        console.log(
          `Attempting to update task ${taskId}, requested by user ${user.id}`,
        );

        // Fetch task's section, project, and condition for permission/logic checks
        // Fetch task's section, project, condition, self-service status, and assignee for permission/logic checks
        const { data: taskToCheck, error: checkError } = await supabaseClient
          .from('tasks')
          .select(
            'id, condition, depends_on_task_id, section_id, is_self_service, assigned_to_id, sections ( project_id, projects ( company_id ) )', // Added is_self_service, assigned_to_id
          )
          .eq('id', taskId)
          .single();

        if (checkError || !taskToCheck) {
          console.error(
            `Error fetching task ${taskId} or task not found:`,
            checkError?.message,
          );
          return createNotFoundResponse('Task not found');
        }

        // Using 'any' cast to bypass complex type inference issue (TS2339)
        // deno-lint-ignore no-explicit-any
        const projectCompanyId = (taskToCheck?.sections as any)?.[0]?.projects?.[0]?.company_id ?? (taskToCheck?.sections as any)?.projects?.company_id;
        if (!projectCompanyId) {
          console.error(`Could not determine company ID for task ${taskId}`);
          return new Response(
            JSON.stringify({
              error: 'Internal Server Error: Project/Company information not available',
            }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Permission check: Staff, user with 'task:manage', or assigned user if self-service
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission', // Checks for 'task:manage'
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'task:manage',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        // Check if user has manage permission OR is staff OR is assigned to a self-service task
        const isSelfServiceAssignee = taskToCheck.is_self_service && taskToCheck.assigned_to_id === user.id;

        if (!profile?.is_staff && !permissionData && !isSelfServiceAssignee) {
          console.error(
            `User ${user.id} not authorized to update task ${taskId}. Staff: ${profile?.is_staff}, HasManagePerm: ${permissionData}, IsSelfServiceAssignee: ${isSelfServiceAssignee}`,
          );
          return createForbiddenResponse('Not authorized to update this task');
        }

        // Parse request body
        // deno-lint-ignore no-explicit-any
        let updateData: any;
        try {
          updateData = await req.json();
          if (Object.keys(updateData).length === 0) {
            throw new Error('No update data provided');
          }
          // Validate status and priority enums if present
          const errors: { [field: string]: string[] } = {};
          validateEnum('status', updateData.status, validStatuses, errors);
          validateEnum('priority', updateData.priority, validPriorities, errors);
          if (Object.keys(errors).length > 0) {
             return createValidationErrorResponse(errors);
          }
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Invalid JSON body';
          return createBadRequestResponse(errorMessage);
        }

        // --- Dependency Validation (Basic) ---
        if (updateData.depends_on_task_id && updateData.depends_on_task_id === taskId) {
             return createValidationErrorResponse({ depends_on_task_id: ['A task cannot depend on itself.'] });
        }
       // --- End Dependency Validation ---

       // --- Circular Dependency Check ---
       if (updateData.depends_on_task_id !== undefined && updateData.depends_on_task_id !== taskToCheck.depends_on_task_id) {
         console.log(`Checking for circular dependency: Task ${taskId} -> ${updateData.depends_on_task_id}`);
         const { data: isCircular, error: circularCheckError } = await supabaseClient.rpc(
           'check_task_circular_dependency',
           {
             task_id_to_check: taskId,
             proposed_dependency_id: updateData.depends_on_task_id,
           },
         );

         if (circularCheckError) {
           console.error('Error checking for circular dependency:', circularCheckError.message);
           // Don't block update if check fails, but log it. Consider making this fatal.
           // throw new Error(`Failed to check circular dependency: ${circularCheckError.message}`);
         }

         if (isCircular === true) {
           console.warn(`Circular dependency detected for task ${taskId} with dependency ${updateData.depends_on_task_id}`);
           return createBadRequestResponse('Setting this dependency would create a circular loop.');
         }
         console.log('No circular dependency detected.');
       }
       // --- End Circular Dependency Check ---

        // --- Condition & Dependency Enforcement ---
        if (updateData.status === 'Complete') {
            // 1. Check explicit dependency field first
            const explicitDependencyId = taskToCheck.depends_on_task_id;
            if (explicitDependencyId) {
                 console.log(`Checking explicit dependency ${explicitDependencyId} for task ${taskId} completion.`);
                 const { data: dependencyTask, error: depError } = await supabaseClient
                    .from('tasks')
                    .select('status')
                    .eq('id', currentDependencyId)
                    .single();

                 if (depError) {
                     console.error(`Error fetching dependency task ${currentDependencyId} for task ${taskId}:`, depError.message);
                     // Don't block completion if dependency fetch fails, but log it.
                 } else if (dependencyTask?.status !== 'Complete') {
                      console.warn(`Attempted to complete task ${taskId} but its dependency ${currentDependencyId} is not complete.`);
                      return createBadRequestResponse(`Cannot complete task: Explicit dependency task is not yet complete.`);
                 }
                 console.log(`Explicit dependency ${explicitDependencyId} is complete.`);
            }

            // 2. Check condition field (if present)
            if (taskToCheck.condition && typeof taskToCheck.condition === 'object') {
                console.log(`Checking condition field for task ${taskId} completion:`, taskToCheck.condition);
                // Example: Simple dependency status check from condition
                // Assumes structure: { "required_dependency_status": { "task_id": "uuid", "status": "Complete" } }
                const conditionDep = (taskToCheck.condition as any)?.required_dependency_status;
                if (conditionDep?.task_id && conditionDep?.status) {
                    const conditionDepId = conditionDep.task_id;
                    const requiredStatus = conditionDep.status;
                    console.log(`Condition requires task ${conditionDepId} to have status ${requiredStatus}.`);

                    const { data: conditionDepTask, error: condDepError } = await supabaseClient
                        .from('tasks')
                        .select('status')
                        .eq('id', conditionDepId)
                        .single();

                    if (condDepError) {
                        console.error(`Error fetching conditional dependency task ${conditionDepId} for task ${taskId}:`, condDepError.message);
                        // Potentially block completion if conditional dependency check fails
                        return createInternalServerErrorResponse(`Error checking task condition dependency: ${condDepError.message}`);
                    } else if (conditionDepTask?.status !== requiredStatus) {
                        console.warn(`Attempted to complete task ${taskId} but its conditional dependency ${conditionDepId} has status ${conditionDepTask?.status} (required: ${requiredStatus}).`);
                        return createBadRequestResponse(`Cannot complete task: Condition not met (dependency task status is '${conditionDepTask?.status ?? 'unknown'}').`);
                    }
                    console.log(`Conditional dependency ${conditionDepId} status check passed.`);
                } else {
                    console.warn(`Task ${taskId} has an unrecognised condition structure:`, taskToCheck.condition);
                    // Decide how to handle unknown conditions: block or allow? Blocking is safer.
                    // return createBadRequestResponse('Cannot complete task: Unknown condition structure.');
                }
            }
        }
        // --- End Condition & Dependency Enforcement ---


        // Prepare allowed update fields
        const allowedUpdates = {
          name: updateData.name,
          description: updateData.description,
          status: updateData.status,
          priority: updateData.priority, // Added
          assigned_to_id: updateData.assigned_to_id,
          due_date: updateData.due_date,
          estimated_effort_hours: updateData.estimated_effort_hours, // Use correct field name
          actual_hours: updateData.actual_hours, // Added
          milestone_id: updateData.milestone_id,
          depends_on_task_id: updateData.depends_on_task_id,
          order: updateData.order,
          // Recurrence fields (allow updating definition)
          is_recurring_definition: updateData.is_recurring_definition,
          recurrence_rule: updateData.recurrence_rule,
          recurrence_end_date: updateData.recurrence_end_date,
          // TODO(recurrence): Recalculate next_occurrence_date if rule/end_date changes.
          next_occurrence_date: updateData.next_occurrence_date, // Keep original value unless recalculated below
          // section_id should not be changed here - that would be a "move" operation
        };

        // --- Recalculate Next Occurrence Date if Rule/End Date Changes ---
        const isRecurringDefinition = taskToCheck.is_recurring_definition || allowedUpdates.is_recurring_definition === true;
        const ruleChanged = allowedUpdates.recurrence_rule !== undefined && allowedUpdates.recurrence_rule !== taskToCheck.recurrence_rule;
        const endDateChanged = allowedUpdates.recurrence_end_date !== undefined && allowedUpdates.recurrence_end_date !== taskToCheck.recurrence_end_date;

        if (isRecurringDefinition && (ruleChanged || endDateChanged)) {
          const newRule = allowedUpdates.recurrence_rule ?? taskToCheck.recurrence_rule;
          const newEndDate = allowedUpdates.recurrence_end_date ?? taskToCheck.recurrence_end_date;

          if (newRule) {
            try {
              const now = new Date();
              const ruleString = `DTSTART:${now.toISOString().replace(/[-:.]/g, '')}\nRRULE:${newRule}`;
              const rule = RRule.fromString(ruleString);
              const nextOccurrence = rule.after(now, true); // Find next occurrence after or at 'now'

              if (nextOccurrence) {
                if (newEndDate && nextOccurrence > new Date(newEndDate)) {
                  console.log(`Next calculated occurrence (${nextOccurrence.toISOString()}) is after new recurrence end date (${newEndDate}). Setting next_occurrence_date to null.`);
                  allowedUpdates.next_occurrence_date = null;
                } else {
                  allowedUpdates.next_occurrence_date = nextOccurrence.toISOString();
                  console.log(`Recalculated next_occurrence_date: ${allowedUpdates.next_occurrence_date}`);
                }
              } else {
                console.warn(`Could not calculate next occurrence for updated rule: ${newRule}. Setting next_occurrence_date to null.`);
                allowedUpdates.next_occurrence_date = null;
              }
            } catch (parseError) {
              const parseErrorMessage = parseError instanceof Error ? parseError.message : 'Unknown error parsing RRULE';
              console.error(`Error parsing recurrence rule during task update: ${parseErrorMessage}`);
              return createValidationErrorResponse({ recurrence_rule: [`Invalid recurrence rule: ${parseErrorMessage}`] });
            }
          } else {
            // If rule is removed, clear next occurrence date
            allowedUpdates.next_occurrence_date = null;
          }
        }
        // --- End Recalculate Next Occurrence Date ---

        // Remove undefined fields
        Object.keys(allowedUpdates).forEach((key) => {
          if (
            allowedUpdates[key as keyof typeof allowedUpdates] === undefined
          ) {
            delete allowedUpdates[key as keyof typeof allowedUpdates];
          }
        });

        // Update the task
        const { data: updatedTask, error: updateError } = await supabaseClient
          .from('tasks')
          .update(allowedUpdates)
          .eq('id', taskId)
          .select()
          .single(); // RLS should also prevent unauthorized updates

        if (updateError) {
          console.error(`Error updating task ${taskId}:`, updateError.message);
          if (updateError.code === 'PGRST204') { // No rows updated/selected
            return createNotFoundResponse('Task not found or update failed');
          }
          // TODO(db-error): Handle other specific DB errors (e.g., FK violation, unique constraint) with appropriate 4xx status codes.
          throw updateError;
        }

        // Handle custom fields provided in the request
        if (updateData.custom_fields && typeof updateData.custom_fields === 'object') {
           // Fetch relevant definitions for 'task' entity type
           const { data: definitions, error: defError } = await supabaseClient
             .from('custom_field_definitions')
             .select('id, name')
             .eq('entity_type', 'task');

           if (defError) {
             console.error("Error fetching custom field definitions during task update:", defError.message);
           } else if (definitions) {
             // deno-lint-ignore no-explicit-any
             const valuesToUpsert: any[] = [];
             const definitionMap = new Map(definitions.map(d => [d.name, d.id]));

             for (const fieldName in updateData.custom_fields) {
               if (definitionMap.has(fieldName)) {
                 valuesToUpsert.push({
                   definition_id: definitionMap.get(fieldName),
                   entity_id: updatedTask.id, // Use the ID of the updated task
                   value: updateData.custom_fields[fieldName]
                 });
               } else {
                 console.warn(`Custom field definition not found for task field during update: ${fieldName}`);
               }
             }

             if (valuesToUpsert.length > 0) {
               const { error: upsertError } = await supabaseClient
                 .from('custom_field_values')
                 .upsert(valuesToUpsert, { onConflict: 'definition_id, entity_id' });

               if (upsertError) {
                 console.error("Error upserting custom field values during task update:", upsertError.message);
                 // Log error but don't fail the whole request
               }
             }
           }
        }

        console.log(`Successfully updated task ${taskId}`);
        return new Response(JSON.stringify(updatedTask), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      case 'DELETE': {
        if (!taskId) {
           return createBadRequestResponse('Task ID missing in URL');
        }
        console.log(
          `Attempting to delete task ${taskId}, requested by user ${user.id}`,
        );

        // Fetch task's section and project for permission check
        const { data: taskToCheck, error: checkError } = await supabaseClient
          .from('tasks')
          .select(
            'section_id, sections ( project_id, projects ( company_id ) )',
          )
          .eq('id', taskId)
          .single();

        if (checkError || !taskToCheck) {
          console.error(
            `Error fetching task ${taskId} or task not found:`,
            checkError?.message,
          );
          return createNotFoundResponse('Task not found');
        }

        // Using 'any' cast to bypass complex type inference issue (TS2339)
        // deno-lint-ignore no-explicit-any
        const projectCompanyId = (taskToCheck?.sections as any)?.[0]?.projects?.[0]?.company_id ?? (taskToCheck?.sections as any)?.projects?.company_id;
        if (!projectCompanyId) {
           console.error(`Could not determine company ID for task ${taskId}`);
          return createInternalServerErrorResponse('Project/Company information not available');
        }

        // Permission check: Staff or user with 'task:manage'
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'task:manage',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(`User ${user.id} not authorized to manage tasks.`);
          return createForbiddenResponse();
        }

        // Delete the task
        const { error: deleteError } = await supabaseClient
          .from('tasks')
          .delete()
          .eq('id', taskId);

        if (deleteError) {
          console.error(`Error deleting task ${taskId}:`, deleteError.message);
          // TODO(db-error): Handle specific DB errors (e.g., restricted delete due to FK dependency) with appropriate 4xx status codes (e.g., 409 Conflict).
          throw deleteError;
        }

        console.log(`Successfully deleted task ${taskId}`);
        return new Response(null, { // No content response
          headers: { ...corsHeaders },
          status: 204, // No Content
        });
      }
      default:
        console.warn(`Method ${req.method} not allowed for /tasks`);
        return createMethodNotAllowedResponse();
    }
  } catch (error) {
    // Use the standardized internal server error response
    return createInternalServerErrorResponse(undefined, error);
  }
});

```

<write_to_file>
<path>supabase/functions/tasks/index.ts</path>
<content>
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { createBadRequestResponse, createValidationErrorResponse } from '../_shared/validation.ts'; // Import helpers

console.log('Tasks function started');

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

    console.log(`Handling ${req.method} request for user ${user.id}`);

    const url = new URL(req.url);
    // Path: /functions/v1/tasks/{taskId}
    const pathParts = url.pathname.split('/').filter((part) => part);
    const taskId = pathParts[3];
    const sectionId = url.searchParams.get('section_id'); // Allow filtering by section_id
    const projectId = url.searchParams.get('project_id'); // Allow filtering by project_id (alternative)

    // Routing based on HTTP method and path
    switch (req.method) {
      case 'GET': {
        if (taskId) {
          // Implement GET /tasks/{id} (Get specific task details)
          console.log(`Fetching details for task ${taskId}, user ${user.id}`);

          // Fetch the specific task with related data
          // RLS policy "Users can view tasks of their projects" should enforce access
          const { data: task, error: taskError } = await supabaseClient
            .from('tasks')
            .select(`
              *,
              assignee:assigned_to_id ( full_name ),
              milestone:milestone_id ( name ),
              depends_on:depends_on_task_id ( name )
            `)
            .eq('id', taskId)
            .maybeSingle(); // Use maybeSingle for potential 404

          if (taskError) {
            console.error(`Error fetching task ${taskId}:`, taskError.message);
            throw taskError;
          }

          if (!task) {
            console.log(`Task ${taskId} not found or access denied for user ${user.id}`);
            return new Response(
              JSON.stringify({ error: 'Task not found or access denied' }),
              {
                status: 404, // Not Found or Forbidden
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }

          // Format response similar to the list endpoint
          const taskDetails = {
            ...task,
            assigned_to_name: task.assignee?.full_name,
            milestone_name: task.milestone?.name,
            depends_on_task_name: task.depends_on?.name,
            assignee: undefined,
            milestone: undefined,
            depends_on: undefined,
          };

          // Fetch associated custom fields for this task
          const { data: customFields, error: cfError } = await supabaseClient
            .from('custom_field_values')
            .select(`
              value,
              custom_field_definitions ( name, label, field_type, options )
            `)
            .eq('entity_id', taskId)
            .eq('custom_field_definitions.entity_type', 'task'); // Filter for task custom fields


          if (cfError) {
             console.error(`Error fetching custom fields for task ${taskId}:`, cfError);
             // Don't fail the whole request, just log and return task details without custom fields
          }

          // Format custom fields
          // deno-lint-ignore no-explicit-any
          const formattedCustomFields: { [key: string]: any } = {};
          if (customFields !== null) {
            customFields?.forEach((cf) => {
              // deno-lint-ignore no-explicit-any
              const definition = (cf.custom_field_definitions as any)?.[0];
              if (definition) {
                formattedCustomFields[definition.name] = {
                  label: definition.label,
                  value: cf.value,
                  type: definition.field_type,
                  options: definition.options,
                };
              }
            });
          }
          // deno-lint-ignore no-explicit-any
          (taskDetails as any).custom_fields = formattedCustomFields; // Add to response

          console.log(`Successfully fetched task ${taskId} with custom fields`);
          return new Response(JSON.stringify(taskDetails), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });

        } else if (sectionId) {
          // Implement GET /tasks?section_id={sectionId} (List tasks for a section)
          console.log(
            `Fetching tasks for section ${sectionId}, user ${user.id}`,
          );

          // Check if user can access the section first (implicitly checks project access via RLS)
          const { data: sectionCheck, error: sectionCheckError } =
            await supabaseClient
              .from('sections')
              .select('id, project_id')
              .eq('id', sectionId)
              .maybeSingle(); // RLS on sections table will apply

          if (sectionCheckError) throw sectionCheckError;
          if (!sectionCheck) {
            console.log(
              `Section ${sectionId} not found or access denied for user ${user.id}`,
            );
            return new Response(
              JSON.stringify({ error: 'Section not found or access denied' }),
              {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }

          // Fetch tasks for the specified section
          // RLS policy "Users can view tasks of their projects" should enforce access
          const { data: tasks, error: tasksError } = await supabaseClient
            .from('tasks')
            .select(`
              *,
              assignee:assigned_to_id ( full_name ),
              milestone:milestone_id ( name ),
              depends_on:depends_on_task_id ( name )
            `)
            .eq('section_id', sectionId)
            .order('order', { ascending: true }); // Order by the 'order' column

          if (tasksError) {
            console.error(
              `Error fetching tasks for section ${sectionId}:`,
              tasksError.message,
            );
            throw tasksError;
          }

          // Format response
          const tasksList = tasks?.map((t) => ({
            ...t,
            assigned_to_name: t.assignee?.full_name,
            milestone_name: t.milestone?.name,
            depends_on_task_name: t.depends_on?.name,
            assignee: undefined,
            milestone: undefined,
            depends_on: undefined,
          })) || [];

          console.log(
            `Found ${tasksList.length} tasks for section ${sectionId}`,
          );
          return new Response(JSON.stringify(tasksList), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } else if (projectId) {
          // Implement GET /tasks?project_id={projectId} (List all tasks for a project)
          console.log(
            `Fetching all tasks for project ${projectId}, user ${user.id}`,
          );

          // Check if user can access the project first
          const { data: projectCheck, error: projectCheckError } =
            await supabaseClient
              .from('projects')
              .select('id')
              .eq('id', projectId)
              .maybeSingle(); // RLS on projects table will apply

          if (projectCheckError) throw projectCheckError;
          if (!projectCheck) {
            console.log(
              `Project ${projectId} not found or access denied for user ${user.id}`,
            );
            return new Response(
              JSON.stringify({ error: 'Project not found or access denied' }),
              {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }

          // Fetch tasks by joining through sections
          // RLS policy "Users can view tasks of their projects" should enforce access
          const { data: tasks, error: tasksError } = await supabaseClient
            .from('tasks')
            .select(`
              *,
              sections!inner ( project_id ),
              assignee:assigned_to_id ( full_name ),
              milestone:milestone_id ( name ),
              depends_on:depends_on_task_id ( name )
            `)
            .eq('sections.project_id', projectId)
            .order('order', { ascending: true }); // Order by task order

          if (tasksError) {
            console.error(
              `Error fetching tasks for project ${projectId}:`,
              tasksError.message,
            );
            throw tasksError;
          }

          // Format response
          const tasksList = tasks?.map((t) => ({
            ...t,
            assigned_to_name: t.assignee?.full_name,
            milestone_name: t.milestone?.name,
            depends_on_task_name: t.depends_on?.name,
            sections: undefined, // Remove join helper
            assignee: undefined,
            milestone: undefined,
            depends_on: undefined,
          })) || [];

          console.log(
            `Found ${tasksList.length} tasks for project ${projectId}`,
          );
          return new Response(JSON.stringify(tasksList), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });

        } else {
          // Require section_id or project_id for listing tasks
          return createBadRequestResponse('section_id or project_id query parameter is required');
        }
      }
      case 'POST': {
        // Implement POST /tasks (Create task for a section)
        console.log(
          `Attempting to create a task, requested by user ${user.id}`,
        );

        // Parse request body
        // deno-lint-ignore no-explicit-any
        let newTaskData: any;
        try {
          newTaskData = await req.json();
          const errors: { [field: string]: string[] } = {};
          if (!newTaskData.name) errors.name = ['Task name is required'];
          if (!newTaskData.section_id) errors.section_id = ['Section ID is required'];
          // TODO: Add validation for status, priority enums

          if (Object.keys(errors).length > 0) {
             return createValidationErrorResponse(errors);
          }
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Invalid JSON body';
          return createBadRequestResponse(errorMessage);
        }
        const targetSectionId = newTaskData.section_id;

        // --- Dependency Validation (Basic) ---
        // Note: This only checks direct self-dependency. DB constraint handles this too.
        // A full cycle check might require a recursive query or different approach.
        // We don't have the new task's ID yet, so this check is better placed in PUT or handled by DB constraint.
        // --- End Dependency Validation ---


        // Check if user can access the section and get project info
        const { data: sectionToCheck, error: checkError } = await supabaseClient
          .from('sections')
          .select('project_id, projects ( company_id )')
          .eq('id', targetSectionId)
          .single();

        if (checkError || !sectionToCheck) {
          return new Response(
            JSON.stringify({ error: 'Section not found or access denied' }),
            {
              status: 404, // Use 404 for not found / access denied
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // The join might return an array even with .single(), addressing TS2339
        // deno-lint-ignore no-explicit-any
        const projectCompanyId = (sectionToCheck?.projects as any)?.[0]?.company_id ?? (sectionToCheck?.projects as any)?.company_id;
        if (!projectCompanyId) {
          console.error(`Could not determine company ID for section ${targetSectionId}`);
          return new Response(
            JSON.stringify({ error: 'Internal Server Error: Project information not available' }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Permission check: Staff or user with 'task:manage'
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'task:manage',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(
            `User ${user.id} not authorized to manage tasks for section ${targetSectionId}.`,
          );
          return new Response(
            JSON.stringify({ error: 'Forbidden: Not authorized' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Get max order value for the section to place new task at the end
        const { data: maxOrderData, error: maxOrderError } =
          await supabaseClient
            .from('tasks')
            .select('order')
            .eq('section_id', targetSectionId)
            .order('order', { ascending: false })
            .limit(1)
            .maybeSingle(); // Use maybeSingle as section might be empty

        if (maxOrderError) {
          console.error(`Error fetching max order for section ${targetSectionId}:`, maxOrderError.message);
          throw maxOrderError;
        }

        const nextOrder = maxOrderData ? (maxOrderData.order + 1) : 0;

        // Insert new task
        const { data: createdTask, error: insertError } = await supabaseClient
          .from('tasks')
          .insert({
            section_id: targetSectionId,
            name: newTaskData.name,
            description: newTaskData.description,
            status: newTaskData.status || 'Open', // Default status
            priority: newTaskData.priority || 'Medium', // Default priority
            assigned_to_id: newTaskData.assigned_to_id,
            due_date: newTaskData.due_date,
            estimated_effort_hours: newTaskData.estimated_effort_hours, // Use correct field name
            actual_hours: newTaskData.actual_hours, // Add actual_hours
            milestone_id: newTaskData.milestone_id,
            depends_on_task_id: newTaskData.depends_on_task_id,
            order: nextOrder,
            // Recurrence fields
            is_recurring_definition: newTaskData.is_recurring_definition ?? false,
            recurrence_rule: newTaskData.recurrence_rule,
            recurrence_end_date: newTaskData.recurrence_end_date,
            // TODO: Calculate initial next_occurrence_date based on rule and start date/created_at if is_recurring_definition is true
            next_occurrence_date: newTaskData.next_occurrence_date,
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error creating task:', insertError.message);
          // TODO: Check for specific DB errors (e.g., FK violation) and return 4xx
          throw insertError;
        }

        // Handle custom fields provided in the request
        if (newTaskData.custom_fields && typeof newTaskData.custom_fields === 'object') {
          // Fetch relevant definitions for 'task' entity type
          const { data: definitions, error: defError } = await supabaseClient
            .from('custom_field_definitions')
            .select('id, name')
            .eq('entity_type', 'task');

          if (defError) {
            console.error("Error fetching custom field definitions for task:", defError.message);
          } else if (definitions) {
            // deno-lint-ignore no-explicit-any
            const valuesToUpsert: any[] = [];
            const definitionMap = new Map(definitions.map(d => [d.name, d.id]));

            for (const fieldName in newTaskData.custom_fields) {
              if (definitionMap.has(fieldName)) {
                valuesToUpsert.push({
                  definition_id: definitionMap.get(fieldName),
                  entity_id: createdTask.id, // Use the ID of the created task
                  value: newTaskData.custom_fields[fieldName]
                });
              } else {
                console.warn(`Custom field definition not found for task field: ${fieldName}`);
              }
            }

            if (valuesToUpsert.length > 0) {
              const { error: upsertError } = await supabaseClient
                .from('custom_field_values')
                .upsert(valuesToUpsert, { onConflict: 'definition_id, entity_id' });

              if (upsertError) {
                console.error("Error upserting custom field values for task:", upsertError.message);
                // Log error but don't fail the whole request
              }
            }
          }
        }

        console.log(
          `Successfully created task ${createdTask.id} for section ${targetSectionId}`,
        );
        return new Response(JSON.stringify(createdTask), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 201, // Created
        });
      }
      case 'PUT': {
        if (!taskId) {
          return createBadRequestResponse('Task ID missing in URL');
        }
        console.log(
          `Attempting to update task ${taskId}, requested by user ${user.id}`,
        );

        // Fetch task's section and project for permission check
        const { data: taskToCheck, error: checkError } = await supabaseClient
          .from('tasks')
          .select(
            'id, depends_on_task_id, section_id, sections ( project_id, projects ( company_id ) )', // Include current depends_on_task_id
          )
          .eq('id', taskId)
          .single();

        if (checkError || !taskToCheck) {
          console.error(
            `Error fetching task ${taskId} or task not found:`,
            checkError?.message,
          );
          return new Response(JSON.stringify({ error: 'Task not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Using 'any' cast to bypass complex type inference issue (TS2339)
        // deno-lint-ignore no-explicit-any
        const projectCompanyId = (taskToCheck?.sections as any)?.[0]?.projects?.[0]?.company_id ?? (taskToCheck?.sections as any)?.projects?.company_id;
        if (!projectCompanyId) {
          console.error(`Could not determine company ID for task ${taskId}`);
          return new Response(
            JSON.stringify({
              error: 'Internal Server Error: Project/Company information not available',
            }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Permission check: Staff or user with 'task:manage'
        // TODO: Refine for self-service updates if needed
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'task:manage',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(`User ${user.id} not authorized to manage tasks.`);
          return new Response(
            JSON.stringify({ error: 'Forbidden: Not authorized' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Parse request body
        // deno-lint-ignore no-explicit-any
        let updateData: any;
        try {
          updateData = await req.json();
          if (Object.keys(updateData).length === 0) {
            throw new Error('No update data provided');
          }
           // TODO: Add validation for status, priority enums if present
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Invalid JSON body';
          return createBadRequestResponse(errorMessage);
        }

        // --- Dependency Validation (Basic) ---
        if (updateData.depends_on_task_id && updateData.depends_on_task_id === taskId) {
             return createValidationErrorResponse({ depends_on_task_id: ['A task cannot depend on itself.'] });
        }
        // TODO: Add check for circular dependencies (A->B, B->A) if required.
        // --- End Dependency Validation ---


        // --- Dependency Enforcement ---
        if (updateData.status === 'Complete') {
            const currentDependencyId = taskToCheck.depends_on_task_id;
            if (currentDependencyId) {
                 const { data: dependencyTask, error: depError } = await supabaseClient
                    .from('tasks')
                    .select('status')
                    .eq('id', currentDependencyId)
                    .single();

                 if (depError) {
                     console.error(`Error fetching dependency task ${currentDependencyId} for task ${taskId}:`, depError.message);
                     // Don't block completion if dependency fetch fails, but log it.
                 } else if (dependencyTask?.status !== 'Complete') {
                      console.warn(`Attempted to complete task ${taskId} but its dependency ${currentDependencyId} is not complete.`);
                      return createValidationErrorResponse({ status: [`Cannot complete task: Dependency task is not yet complete.`] });
                 }
            }
        }
        // --- End Dependency Enforcement ---


        // Prepare allowed update fields
        const allowedUpdates = {
          name: updateData.name,
          description: updateData.description,
          status: updateData.status,
          priority: updateData.priority, // Added
          assigned_to_id: updateData.assigned_to_id,
          due_date: updateData.due_date,
          estimated_effort_hours: updateData.estimated_effort_hours, // Use correct field name
          actual_hours: updateData.actual_hours, // Added
          milestone_id: updateData.milestone_id,
          depends_on_task_id: updateData.depends_on_task_id,
          order: updateData.order,
          // Recurrence fields (allow updating definition)
          is_recurring_definition: updateData.is_recurring_definition,
          recurrence_rule: updateData.recurrence_rule,
          recurrence_end_date: updateData.recurrence_end_date,
          // TODO: Recalculate next_occurrence_date if rule/end_date changes
          next_occurrence_date: updateData.next_occurrence_date,
          // section_id should not be changed here - that would be a "move" operation
        };
        // Remove undefined fields
        Object.keys(allowedUpdates).forEach((key) => {
          if (
            allowedUpdates[key as keyof typeof allowedUpdates] === undefined
          ) {
            delete allowedUpdates[key as keyof typeof allowedUpdates];
          }
        });

        // Update the task
        const { data: updatedTask, error: updateError } = await supabaseClient
          .from('tasks')
          .update(allowedUpdates)
          .eq('id', taskId)
          .select()
          .single(); // RLS should also prevent unauthorized updates

        if (updateError) {
          console.error(`Error updating task ${taskId}:`, updateError.message);
          if (updateError.code === 'PGRST204') { // No rows updated/selected
            return new Response(
              JSON.stringify({ error: 'Task not found or update failed' }),
              {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }
          // TODO: Handle other specific DB errors (e.g., FK violation) with 4xx
          throw updateError;
        }

        // Handle custom fields provided in the request
        if (updateData.custom_fields && typeof updateData.custom_fields === 'object') {
           // Fetch relevant definitions for 'task' entity type
           const { data: definitions, error: defError } = await supabaseClient
             .from('custom_field_definitions')
             .select('id, name')
             .eq('entity_type', 'task');

           if (defError) {
             console.error("Error fetching custom field definitions during task update:", defError.message);
           } else if (definitions) {
             // deno-lint-ignore no-explicit-any
             const valuesToUpsert: any[] = [];
             const definitionMap = new Map(definitions.map(d => [d.name, d.id]));

             for (const fieldName in updateData.custom_fields) {
               if (definitionMap.has(fieldName)) {
                 valuesToUpsert.push({
                   definition_id: definitionMap.get(fieldName),
                   entity_id: updatedTask.id, // Use the ID of the updated task
                   value: updateData.custom_fields[fieldName]
                 });
               } else {
                 console.warn(`Custom field definition not found for task field during update: ${fieldName}`);
               }
             }

             if (valuesToUpsert.length > 0) {
               const { error: upsertError } = await supabaseClient
                 .from('custom_field_values')
                 .upsert(valuesToUpsert, { onConflict: 'definition_id, entity_id' });

               if (upsertError) {
                 console.error("Error upserting custom field values during task update:", upsertError.message);
                 // Log error but don't fail the whole request
               }
             }
           }
        }

        console.log(`Successfully updated task ${taskId}`);
        return new Response(JSON.stringify(updatedTask), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      case 'DELETE': {
        if (!taskId) {
           return createBadRequestResponse('Task ID missing in URL');
        }
        console.log(
          `Attempting to delete task ${taskId}, requested by user ${user.id}`,
        );

        // Fetch task's section and project for permission check
        const { data: taskToCheck, error: checkError } = await supabaseClient
          .from('tasks')
          .select(
            'section_id, sections ( project_id, projects ( company_id ) )',
          )
          .eq('id', taskId)
          .single();

        if (checkError || !taskToCheck) {
          console.error(
            `Error fetching task ${taskId} or task not found:`,
            checkError?.message,
          );
          return new Response(JSON.stringify({ error: 'Task not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Using 'any' cast to bypass complex type inference issue (TS2339)
        // deno-lint-ignore no-explicit-any
        const projectCompanyId = (taskToCheck?.sections as any)?.[0]?.projects?.[0]?.company_id ?? (taskToCheck?.sections as any)?.projects?.company_id;
        if (!projectCompanyId) {
           console.error(`Could not determine company ID for task ${taskId}`);
          return createInternalServerErrorResponse('Project/Company information not available');
        }

        // Permission check: Staff or user with 'task:manage'
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'task:manage',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(`User ${user.id} not authorized to manage tasks.`);
          return new Response(
            JSON.stringify({ error: 'Forbidden: Not authorized' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Delete the task
        const { error: deleteError } = await supabaseClient
          .from('tasks')
          .delete()
          .eq('id', taskId);

        if (deleteError) {
          console.error(`Error deleting task ${taskId}:`, deleteError.message);
          // TODO: Handle specific DB errors (e.g., restricted delete due to FK) with 4xx
          throw deleteError;
        }

        console.log(`Successfully deleted task ${taskId}`);
        return new Response(null, { // No content response
          headers: { ...corsHeaders },
          status: 204, // No Content
        });
      }
      default:
        console.warn(`Method ${req.method} not allowed for /tasks`);
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
    // Use generic 500 for now, specific handlers should throw specific errors
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
