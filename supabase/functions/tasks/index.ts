import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

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
          // TODO: Implement GET /tasks/{id} (Get specific task details)
          console.log(`Fetching details for task ${taskId}`);
          return new Response(
            JSON.stringify({ message: `GET /tasks/${taskId} not implemented yet` }),
            {
              status: 501,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        } else if (sectionId) {
          // Implement GET /tasks?section_id={sectionId} (List tasks for a section)
          console.log(`Fetching tasks for section ${sectionId}, user ${user.id}`);

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

          console.log(`Found ${tasksList.length} tasks for section ${sectionId}`);
          return new Response(JSON.stringify(tasksList), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } else if (projectId) {
          // TODO: Implement GET /tasks?project_id={projectId} (List all tasks for a project)
          // This might require joining sections or careful RLS.
          console.log(
            `Fetching all tasks for project ${projectId} (not implemented yet)`,
          );
          return new Response(
            JSON.stringify({
              message: `Listing all tasks for a project not implemented yet`,
            }),
            {
              status: 501,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        } else {
          // Require section_id or project_id for listing tasks
          return new Response(
            JSON.stringify({
              error:
                'Bad Request: section_id or project_id query parameter is required',
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
      }
      case 'POST': {
        // Implement POST /tasks (Create task for a section)
        console.log(`Attempting to create a task, requested by user ${user.id}`);

        // Parse request body
        let newTaskData;
        try {
          newTaskData = await req.json();
          if (!newTaskData.name || !newTaskData.section_id) {
            throw new Error('Missing required fields: name, section_id');
          }
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Unknown error';
          console.error('Error parsing request body:', errorMessage);
          return new Response(
            JSON.stringify({ error: `Bad Request: ${errorMessage}` }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        const targetSectionId = newTaskData.section_id;

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
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // The join might return an array even with .single(), addressing TS2339
        const projectCompanyId = sectionToCheck?.projects?.[0]?.company_id;
        if (!projectCompanyId) {
          return new Response(
            JSON.stringify({ error: 'Project information not available' }),
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
        const { data: maxOrderData, error: maxOrderError } = await supabaseClient
          .from('tasks')
          .select('order')
          .eq('section_id', targetSectionId)
          .order('order', { ascending: false })
          .limit(1)
          .single();

        if (maxOrderError && maxOrderError.code !== 'PGRST116') { // Ignore 'range not found' error
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
            status: newTaskData.status || 'Not Started', // Default
            priority: newTaskData.priority || 'Medium', // Default
            assigned_to_id: newTaskData.assigned_to_id, // Optional
            due_date: newTaskData.due_date, // Optional
            estimated_hours: newTaskData.estimated_hours, // Optional
            milestone_id: newTaskData.milestone_id, // Optional
            depends_on_task_id: newTaskData.depends_on_task_id, // Optional
            order: nextOrder, // Place at the end of the section
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error creating task:', insertError.message);
          throw insertError;
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
          return new Response(
            JSON.stringify({ error: 'Bad Request: Task ID missing in URL' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        console.log(`Attempting to update task ${taskId}, requested by user ${user.id}`);

        // Fetch task's section and project for permission check
        const { data: taskToCheck, error: checkError } = await supabaseClient
          .from('tasks')
          .select('section_id, sections ( project_id, projects ( company_id ) )')
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

        // The join might return an array even with .single(), addressing TS2339
        const projectCompanyId = taskToCheck?.sections?.projects?.[0]?.company_id; // Re-applying corrected access
        if (!projectCompanyId) {
          return new Response(
            JSON.stringify({ error: 'Project/Company information not available' }),
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
        let updateData;
        try {
          updateData = await req.json();
          if (Object.keys(updateData).length === 0) {
            throw new Error('No update data provided');
          }
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Unknown error';
          console.error('Error parsing request body:', errorMessage);
          return new Response(
            JSON.stringify({ error: `Bad Request: ${errorMessage}` }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Prepare allowed update fields
        const allowedUpdates = {
          name: updateData.name,
          description: updateData.description,
          status: updateData.status,
          priority: updateData.priority,
          assigned_to_id: updateData.assigned_to_id,
          due_date: updateData.due_date,
          estimated_hours: updateData.estimated_hours,
          actual_hours: updateData.actual_hours,
          milestone_id: updateData.milestone_id,
          depends_on_task_id: updateData.depends_on_task_id,
          order: updateData.order,
          // section_id should not be changed here - that would be a "move" operation
        };
        // Using type assertion to handle TS7053
        Object.keys(allowedUpdates).forEach((key) => {
          if (allowedUpdates[key as keyof typeof allowedUpdates] === undefined) {
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
          throw updateError;
        }

        console.log(`Successfully updated task ${taskId}`);
        return new Response(JSON.stringify(updatedTask), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      case 'DELETE': {
        if (!taskId) {
          return new Response(
            JSON.stringify({ error: 'Bad Request: Task ID missing in URL' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        console.log(`Attempting to delete task ${taskId}, requested by user ${user.id}`);

        // Fetch task's section and project for permission check
        const { data: taskToCheck, error: checkError } = await supabaseClient
          .from('tasks')
          .select('section_id, sections ( project_id, projects ( company_id ) )')
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

        // The join might return an array even with .single(), addressing TS2339
        const projectCompanyId = taskToCheck?.sections?.projects?.[0]?.company_id; // Re-applying corrected access
        if (!projectCompanyId) {
          return new Response(
            JSON.stringify({ error: 'Project/Company information not available' }),
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown internal server error';
    console.error('Internal Server Error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
