import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

console.log('Risks function started');

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
    // Path: /functions/v1/risks/{riskId}
    const pathParts = url.pathname.split('/').filter((part) => part);
    const riskId = pathParts[3];
    const projectId = url.searchParams.get('project_id'); // Allow filtering by project_id

    // Routing based on HTTP method and path
    switch (req.method) {
      case 'GET': {
        if (riskId) {
          // TODO: Implement GET /risks/{id} (Get specific risk details)
          console.log(`Fetching details for risk ${riskId}`);
          return new Response(
            JSON.stringify({ message: `GET /risks/${riskId} not implemented yet` }),
            {
              status: 501,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        } else if (projectId) {
          // Implement GET /risks?project_id={projectId} (List risks for a project)
          console.log(`Fetching risks for project ${projectId}, user ${user.id}`);

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

          // Fetch risks for the specified project
          // RLS policy "Users can view risks of their projects" should enforce access
          const { data: risks, error: risksError } = await supabaseClient
            .from('risks')
            .select(`
              *,
              reporter:reported_by_user_id ( full_name ),
              assignee:assigned_to_user_id ( full_name )
            `)
            .eq('project_id', projectId)
            .order('created_at', { ascending: false }); // Order by creation date

          if (risksError) {
            console.error(
              `Error fetching risks for project ${projectId}:`,
              risksError.message,
            );
            throw risksError;
          }

          // Format response
          const risksList = risks?.map((r) => ({
            ...r,
            reported_by_name: r.reporter?.full_name,
            assigned_to_name: r.assignee?.full_name,
            reporter: undefined, // Remove nested object
            assignee: undefined, // Remove nested object
          })) || [];

          console.log(`Found ${risksList.length} risks for project ${projectId}`);
          return new Response(JSON.stringify(risksList), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } else {
          // Require project_id for listing risks
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
        // Implement POST /risks (Create risk for a project)
        console.log(`Attempting to create a risk, requested by user ${user.id}`);

        // Parse request body
        let newRiskData;
        try {
          newRiskData = await req.json();
          if (!newRiskData.description || !newRiskData.project_id) {
            throw new Error('Missing required fields: description, project_id');
          }
          // TODO: Validate status, probability, impact enums if provided
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
        const targetProjectId = newRiskData.project_id;

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

        // Permission check: Staff or user with 'risk:manage'
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'risk:manage',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(
            `User ${user.id} not authorized to manage risks for project ${targetProjectId}.`,
          );
          return new Response(
            JSON.stringify({ error: 'Forbidden: Not authorized' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Insert new risk
        const { data: createdRisk, error: insertError } = await supabaseClient
          .from('risks')
          .insert({
            project_id: targetProjectId,
            description: newRiskData.description,
            reported_by_user_id: user.id, // Set reporter to current user
            assigned_to_user_id: newRiskData.assigned_to_user_id, // Optional
            status: newRiskData.status || 'Potential', // Default
            probability: newRiskData.probability, // Optional
            impact: newRiskData.impact, // Optional
            mitigation_plan: newRiskData.mitigation_plan, // Optional
            contingency_plan: newRiskData.contingency_plan, // Optional
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error creating risk:', insertError.message);
          throw insertError;
        }

        console.log(
          `Successfully created risk ${createdRisk.id} for project ${targetProjectId}`,
        );
        return new Response(JSON.stringify(createdRisk), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 201, // Created
        });
      }
      case 'PUT': {
        if (!riskId) {
          return new Response(
            JSON.stringify({ error: 'Bad Request: Risk ID missing in URL' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        console.log(`Attempting to update risk ${riskId}, requested by user ${user.id}`);

        // Fetch risk's project and company for permission check
        const { data: riskToCheck, error: checkError } = await supabaseClient
          .from('risks')
          .select('project_id, projects ( company_id )')
          .eq('id', riskId)
          .single();

        // The join might return an array even with .single(), addressing TS2339
        const projectCompanyId = riskToCheck?.projects?.[0]?.company_id;
        if (checkError || !projectCompanyId) {
          console.error(
            `Error fetching risk ${riskId} for permission check or risk/project/company not found:`,
            checkError?.message,
          );
          return new Response(
            JSON.stringify({
              error: 'Risk or associated project/company not found',
            }),
            {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Permission check: Staff or user with 'risk:manage'
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'risk:manage',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(
            `User ${user.id} not authorized to manage risks for project ${riskToCheck.project_id}.`,
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
          description: updateData.description,
          assigned_to_user_id: updateData.assigned_to_user_id,
          status: updateData.status,
          probability: updateData.probability,
          impact: updateData.impact,
          mitigation_plan: updateData.mitigation_plan,
          contingency_plan: updateData.contingency_plan,
          // project_id and reported_by_user_id should not be changed
        };
        // Using type assertion to handle TS7053
        Object.keys(allowedUpdates).forEach((key) => {
          if (allowedUpdates[key as keyof typeof allowedUpdates] === undefined) {
            delete allowedUpdates[key as keyof typeof allowedUpdates];
          }
        });

        // Update the risk
        const { data: updatedRisk, error: updateError } = await supabaseClient
          .from('risks')
          .update(allowedUpdates)
          .eq('id', riskId)
          .select()
          .single(); // RLS should also prevent unauthorized updates

        if (updateError) {
          console.error(`Error updating risk ${riskId}:`, updateError.message);
          if (updateError.code === 'PGRST204') { // No rows updated/selected
            return new Response(
              JSON.stringify({ error: 'Risk not found or update failed' }),
              {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }
          throw updateError;
        }

        console.log(`Successfully updated risk ${riskId}`);
        return new Response(JSON.stringify(updatedRisk), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      case 'DELETE': {
        if (!riskId) {
          return new Response(
            JSON.stringify({ error: 'Bad Request: Risk ID missing in URL' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        console.log(`Attempting to delete risk ${riskId}, requested by user ${user.id}`);

        // Fetch risk's project and company for permission check
        const { data: riskToCheck, error: checkError } = await supabaseClient
          .from('risks')
          .select('project_id, projects ( company_id )')
          .eq('id', riskId)
          .single();

        // The join might return an array even with .single(), addressing TS2339
        const projectCompanyId = riskToCheck?.projects?.[0]?.company_id;
        if (checkError || !projectCompanyId) {
          console.error(
            `Error fetching risk ${riskId} for permission check or risk/project/company not found:`,
            checkError?.message,
          );
          return new Response(
            JSON.stringify({
              error: 'Risk or associated project/company not found',
            }),
            {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Permission check: Staff or user with 'risk:manage'
        const { data: permissionData, error: permissionError } =
          await supabaseClient.rpc(
            'has_permission',
            {
              user_id: user.id,
              company_id: projectCompanyId,
              permission_key: 'risk:manage',
            },
          );
        if (permissionError) throw permissionError;
        const { data: profile, error: profileError } = await supabaseClient
          .from('user_profiles').select('is_staff').eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        if (!profile?.is_staff && !permissionData) {
          console.error(
            `User ${user.id} not authorized to manage risks for project ${riskToCheck.project_id}.`,
          );
          return new Response(
            JSON.stringify({ error: 'Forbidden: Not authorized' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Delete the risk
        const { error: deleteError } = await supabaseClient
          .from('risks')
          .delete()
          .eq('id', riskId);

        if (deleteError) {
          console.error(`Error deleting risk ${riskId}:`, deleteError.message);
          throw deleteError;
        }

        console.log(`Successfully deleted risk ${riskId}`);
        return new Response(null, { // No content response
          headers: { ...corsHeaders },
          status: 204, // No Content
        });
      }
      default:
        console.warn(`Method ${req.method} not allowed for /risks`);
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
