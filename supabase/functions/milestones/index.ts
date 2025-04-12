import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

console.log('Milestones function started');

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
    // Path: /functions/v1/milestones/{milestoneId}
    const pathParts = url.pathname.split('/').filter((part) => part);
    const milestoneId = pathParts[3];
    const projectId = url.searchParams.get('project_id'); // Allow filtering by project_id

    // Routing based on HTTP method and path
    switch (req.method) {
      case 'GET': {
        if (milestoneId) {
          // TODO: Implement GET /milestones/{id} (Get specific milestone details)
          console.log(`Fetching details for milestone ${milestoneId}`);
          return new Response(
            JSON.stringify({
              message: `GET /milestones/${milestoneId} not implemented yet`,
            }),
            {
              status: 501,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        } else if (projectId) {
          // Implement GET /milestones?project_id={projectId} (List milestones for a project)
          console.log(
            `Fetching milestones for project ${projectId}, user ${user.id}`,
          );

          // Check if user can access the project first (RLS on milestones depends on project access)
          const { data: projectCheck, error: projectCheckError } =
            await supabaseClient
              .from('projects')
              .select('id, company_id') // Need company_id for RLS check on milestones potentially
              .eq('id', projectId)
              .maybeSingle(); // RLS on projects table will apply here

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

          // Fetch milestones for the specified project
          // RLS policy "Users can view milestones of their projects" should enforce access
          const { data: milestones, error: milestonesError } =
            await supabaseClient
              .from('milestones')
              .select(`
              *,
              user_profiles ( full_name )
            `)
              .eq('project_id', projectId)
              .order('order', { ascending: true }); // Order by the 'order' column

          if (milestonesError) {
            console.error(
              `Error fetching milestones for project ${projectId}:`,
              milestonesError.message,
            );
            throw milestonesError;
          }

          // Format response
          const milestonesList = milestones?.map((m) => ({
            ...m,
            signed_off_by_name: m.user_profiles?.full_name,
            user_profiles: undefined, // Remove nested object
          })) || [];

          console.log(
            `Found ${milestonesList.length} milestones for project ${projectId}`,
          );
          return new Response(JSON.stringify(milestonesList), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } else {
          // Listing all milestones across all accessible projects might be too broad/inefficient.
          // Require project_id for listing.
          return new Response(
            JSON.stringify({
              error: 'Bad Request: project_id query parameter is required',
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
      }
      case 'POST': {
        // Implement POST /milestones (Create milestone for a project)
        console.log(
          `Attempting to create a milestone, requested by user ${user.id}`,
        );

        // Parse request body
        let newMilestoneData;
        try {
          newMilestoneData = await req.json();
          if (!newMilestoneData.name || !newMilestoneData.project_id) {
            throw new Error('Missing required fields: name, project_id');
          }
          // TODO: Validate status enum if provided
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
        const targetProjectId = newMilestoneData.project_id;

        // Fetch project company_id for permission check
        const { data: projectToCheck, error: checkError } = await supabaseClient
          .from('projects')
          .select('company_id')
          .eq('id', targetProjectId)
          .single();
        if (checkError || !projectToCheck) {
          return new Response(JSON.stringify({ error: 'Project not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const projectCompanyId = projectToCheck.company_id;

        // Permission check: Staff or user with 'milestone:manage'
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'milestone:manage',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(
            `User ${user.id} not authorized to manage milestones for project ${targetProjectId}.`,
          );
          return new Response(
            JSON.stringify({ error: 'Forbidden: Not authorized' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Insert new milestone
        const { data: createdMilestone, error: insertError } =
          await supabaseClient
            .from('milestones')
            .insert({
              project_id: targetProjectId,
              name: newMilestoneData.name,
              description: newMilestoneData.description, // Optional
              due_date: newMilestoneData.due_date, // Optional
              status: newMilestoneData.status || 'Pending', // Default
              order: newMilestoneData.order || 0, // Default
              sign_off_required: newMilestoneData.sign_off_required || false, // Default
              approval_id: newMilestoneData.approval_id, // Optional
              // signed_off fields are typically updated via PUT/PATCH
            })
            .select()
            .single();

        if (insertError) {
          console.error('Error creating milestone:', insertError.message);
          throw insertError;
        }

        console.log(
          `Successfully created milestone ${createdMilestone.id} for project ${targetProjectId}`,
        );
        return new Response(JSON.stringify(createdMilestone), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 201, // Created
        });
      }
      case 'PUT': {
        if (!milestoneId) {
          return new Response(
            JSON.stringify({
              error: 'Bad Request: Milestone ID missing in URL',
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        console.log(
          `Attempting to update milestone ${milestoneId}, requested by user ${user.id}`,
        );

        // Fetch milestone's project and company for permission check
        const { data: milestoneToCheck, error: checkError } =
          await supabaseClient
            .from('milestones')
            .select('project_id, projects ( company_id )')
            .eq('id', milestoneId)
            .single();

        // Explicitly check the structure and access company_id
        // The join might return an array even with .single(), addressing TS2339
        const projectCompanyId = milestoneToCheck?.projects?.[0]?.company_id;
        if (checkError || !projectCompanyId) {
          console.error(
            `Error fetching milestone ${milestoneId} for permission check or milestone/project/company not found:`,
            checkError?.message,
          );
          return new Response(
            JSON.stringify({
              error: 'Milestone or associated project/company not found',
            }),
            {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        // const projectCompanyId = projectData.company_id; // Already extracted above

        // Permission check: Staff or user with 'milestone:manage'
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'milestone:manage',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(
            `User ${user.id} not authorized to manage milestones for project ${milestoneToCheck.project_id}.`,
          );
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
          due_date: updateData.due_date,
          status: updateData.status,
          order: updateData.order,
          sign_off_required: updateData.sign_off_required,
          signed_off_by_user_id: updateData.signed_off_by_user_id,
          signed_off_at: updateData.signed_off_at,
          approval_id: updateData.approval_id,
          // project_id should not be changed
        };
        // Using type assertion to handle TS7053
        Object.keys(allowedUpdates).forEach((key) => {
          if (allowedUpdates[key as keyof typeof allowedUpdates] === undefined) {
            delete allowedUpdates[key as keyof typeof allowedUpdates];
          }
        });

        // Update the milestone
        const { data: updatedMilestone, error: updateError } =
          await supabaseClient
            .from('milestones')
            .update(allowedUpdates)
            .eq('id', milestoneId)
            .select()
            .single(); // RLS should also prevent unauthorized updates

        if (updateError) {
          console.error(
            `Error updating milestone ${milestoneId}:`,
            updateError.message,
          );
          if (updateError.code === 'PGRST204') { // No rows updated/selected
            return new Response(
              JSON.stringify({ error: 'Milestone not found or update failed' }),
              {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }
          throw updateError;
        }

        console.log(`Successfully updated milestone ${milestoneId}`);
        return new Response(JSON.stringify(updatedMilestone), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      case 'DELETE': {
        if (!milestoneId) {
          return new Response(
            JSON.stringify({
              error: 'Bad Request: Milestone ID missing in URL',
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        console.log(
          `Attempting to delete milestone ${milestoneId}, requested by user ${user.id}`,
        );

        // Fetch milestone's project and company for permission check
        const { data: milestoneToCheck, error: checkError } =
          await supabaseClient
            .from('milestones')
            .select('project_id, projects ( company_id )')
            .eq('id', milestoneId)
            .single();

        // The join might return an array even with .single(), addressing TS2339
        const projectCompanyId = milestoneToCheck?.projects?.[0]?.company_id;
        if (checkError || !projectCompanyId) {
          console.error(
            `Error fetching milestone ${milestoneId} for permission check or milestone/project/company not found:`,
            checkError?.message,
          );
          return new Response(
            JSON.stringify({
              error: 'Milestone or associated project/company not found',
            }),
            {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        // const projectCompanyId = projectData.company_id; // Already extracted above

        // Permission check: Staff or user with 'milestone:manage'
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'milestone:manage',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(
            `User ${user.id} not authorized to manage milestones for project ${milestoneToCheck.project_id}.`,
          );
          return new Response(
            JSON.stringify({ error: 'Forbidden: Not authorized' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Delete the milestone
        const { error: deleteError } = await supabaseClient
          .from('milestones')
          .delete()
          .eq('id', milestoneId);

        if (deleteError) {
          console.error(
            `Error deleting milestone ${milestoneId}:`,
            deleteError.message,
          );
          throw deleteError;
        }

        console.log(`Successfully deleted milestone ${milestoneId}`);
        return new Response(null, { // No content response
          headers: { ...corsHeaders },
          status: 204, // No Content
        });
      }
      default:
        console.warn(`Method ${req.method} not allowed for /milestones`);
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
