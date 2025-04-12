import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

console.log('Issues function started');

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
    // Path: /functions/v1/issues/{issueId}
    const pathParts = url.pathname.split('/').filter((part) => part);
    const issueId = pathParts[3];
    const projectId = url.searchParams.get('project_id'); // Allow filtering by project_id

    // Routing based on HTTP method and path
    switch (req.method) {
      case 'GET': {
        if (issueId) {
          // Implement GET /issues/{id} (Get specific issue details)
          console.log(`Fetching details for issue ${issueId}, user ${user.id}`);

          // Fetch the specific issue with related data
          // RLS policy "Users can view issues of their projects" should enforce access
          const { data: issue, error: issueError } = await supabaseClient
            .from('issues')
            .select(`
              *,
              reporter:reported_by_user_id ( full_name ),
              assignee:assigned_to_user_id ( full_name ),
              related_risk:related_risk_id ( description )
            `)
            .eq('id', issueId)
            .maybeSingle(); // Use maybeSingle for potential 404

          if (issueError) {
            console.error(
              `Error fetching issue ${issueId}:`,
              issueError.message,
            );
            throw issueError;
          }

          if (!issue) {
            console.log(
              `Issue ${issueId} not found or access denied for user ${user.id}`,
            );
            return new Response(
              JSON.stringify({ error: 'Issue not found or access denied' }),
              {
                status: 404, // Not Found or Forbidden
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }

          // Format response similar to the list endpoint
          const issueDetails = {
            ...issue,
            reported_by_name: issue.reporter?.full_name,
            assigned_to_name: issue.assignee?.full_name,
            related_risk_description: issue.related_risk?.description,
            reporter: undefined,
            assignee: undefined,
            related_risk: undefined,
          };

          console.log(`Successfully fetched issue ${issueId}`);
          return new Response(JSON.stringify(issueDetails), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } else if (projectId) {
          // Implement GET /issues?project_id={projectId} (List issues for a project)
          console.log(
            `Fetching issues for project ${projectId}, user ${user.id}`,
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

          // Fetch issues for the specified project
          // RLS policy "Users can view issues of their projects" should enforce access
          const { data: issues, error: issuesError } = await supabaseClient
            .from('issues')
            .select(`
              *,
              reporter:reported_by_user_id ( full_name ),
              assignee:assigned_to_user_id ( full_name ),
              related_risk:related_risk_id ( description )
            `)
            .eq('project_id', projectId)
            .order('created_at', { ascending: false }); // Order by creation date

          if (issuesError) {
            console.error(
              `Error fetching issues for project ${projectId}:`,
              issuesError.message,
            );
            throw issuesError;
          }

          // Format response
          const issuesList = issues?.map((i) => ({
            ...i,
            reported_by_name: i.reporter?.full_name,
            assigned_to_name: i.assignee?.full_name,
            related_risk_description: i.related_risk?.description,
            reporter: undefined, // Remove nested object
            assignee: undefined, // Remove nested object
            related_risk: undefined, // Remove nested object
          })) || [];

          console.log(
            `Found ${issuesList.length} issues for project ${projectId}`,
          );
          return new Response(JSON.stringify(issuesList), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } else {
          // Require project_id for listing issues
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
        // Implement POST /issues (Create issue for a project)
        console.log(
          `Attempting to create an issue, requested by user ${user.id}`,
        );

        // Parse request body
        let newIssueData;
        try {
          newIssueData = await req.json();
          if (!newIssueData.description || !newIssueData.project_id) {
            throw new Error('Missing required fields: description, project_id');
          }
            // Validate status enum if provided
          if (newIssueData.status && !['Open', 'Investigating', 'Resolved', 'Closed'].includes(newIssueData.status)) {
            throw new Error("Status must be one of: 'Open', 'Investigating', 'Resolved', 'Closed'");
          }
          
          // Validate priority enum if provided
          if (newIssueData.priority && !['Low', 'Medium', 'High', 'Critical'].includes(newIssueData.priority)) {
            throw new Error("Priority must be one of: 'Low', 'Medium', 'High', 'Critical'");
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
        const targetProjectId = newIssueData.project_id;

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
        const companyId = projectToCheck.company_id;

        // Permission check using has_permission RPC function
        const { data: hasPermission, error: permissionError } = await supabaseClient.rpc(
          'has_permission',
          {
            user_id: user.id,
            company_id: companyId,
            permission_key: 'issue:manage',
          },
        );
        
        if (permissionError) {
          console.error(
            `Error checking permissions for user ${user.id}:`,
            permissionError.message,
          );
          throw permissionError;
        }

        if (!hasPermission) {
          console.error(
            `User ${user.id} is not authorized to create issues for project ${targetProjectId}.`,
          );
          return new Response(
            JSON.stringify({ error: 'Forbidden: Not authorized to create issues for this project' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Insert new issue
        const { data: createdIssue, error: insertError } = await supabaseClient
          .from('issues')
          .insert({
            project_id: targetProjectId,
            description: newIssueData.description,
            reported_by_user_id: user.id, // Set reporter to current user
            assigned_to_user_id: newIssueData.assigned_to_user_id, // Optional
            status: newIssueData.status || 'Open', // Default
            priority: newIssueData.priority || 'Medium', // Default
            resolution: newIssueData.resolution, // Optional
            related_risk_id: newIssueData.related_risk_id, // Optional
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error creating issue:', insertError.message);
          
          // Handle specific database errors
          if (insertError.code === '23503') { // Foreign key violation
            const constraint = insertError.message.includes('project_id') 
              ? 'project_id' 
              : insertError.message.includes('related_risk_id') 
                ? 'related_risk_id' 
                : insertError.message.includes('reported_by_user_id')
                  ? 'reported_by_user_id'
                  : insertError.message.includes('assigned_to_user_id')
                    ? 'assigned_to_user_id'
                    : 'unknown foreign key';
            
            return new Response(
              JSON.stringify({ 
                error: `Invalid reference: ${constraint} refers to a record that doesn't exist` 
              }),
              {
                status: 400, // Bad Request
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          } else if (insertError.code === '23514') { // Check constraint violation
            return new Response(
              JSON.stringify({
                error: `Invalid field value: ${insertError.message}`
              }),
              {
                status: 400, // Bad Request
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          } else if (insertError.code === '23502') { // Not null violation
            const columnMatch = insertError.message.match(/null value in column "(.+?)"/);
            const column = columnMatch ? columnMatch[1] : 'unknown';
            
            return new Response(
              JSON.stringify({
                error: `The ${column} field is required.`
              }),
              {
                status: 400, // Bad Request
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }
          
          throw insertError;
        }

        console.log(
          `Successfully created issue ${createdIssue.id} for project ${targetProjectId}`,
        );
        return new Response(JSON.stringify(createdIssue), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 201, // Created
        });
      }
      case 'PUT': {
        if (!issueId) {
          return new Response(
            JSON.stringify({ error: 'Bad Request: Issue ID missing in URL' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        console.log(
          `Attempting to update issue ${issueId}, requested by user ${user.id}`,
        );

        // Fetch issue's project and company for permission check
        const { data: issueToCheck, error: checkError } = await supabaseClient
          .from('issues')
          .select('project_id, projects ( company_id )')
          .eq('id', issueId)
          .single();

        // The join might return an array even with .single(), addressing TS2339
        const projectCompanyId = issueToCheck?.projects?.[0]?.company_id;
        if (checkError || !projectCompanyId) {
          console.error(
            `Error fetching issue ${issueId} for permission check or issue/project/company not found:`,
            checkError?.message,
          );
          return new Response(
            JSON.stringify({
              error: 'Issue or associated project/company not found',
            }),
            {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Permission check using has_permission RPC function
        const { data: hasPermission, error: permissionError } = await supabaseClient.rpc(
          'has_permission',
          {
            user_id: user.id,
            company_id: projectCompanyId,
            permission_key: 'issue:manage',
          },
        );
        
        if (permissionError) {
          console.error(
            `Error checking permissions for user ${user.id}:`,
            permissionError.message,
          );
          throw permissionError;
        }

        if (!hasPermission) {
          console.error(
            `User ${user.id} not authorized to update issue ${issueId} in project ${issueToCheck.project_id}.`,
          );
          return new Response(
            JSON.stringify({ error: 'Forbidden: Not authorized to update this issue' }),
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
          
          // Validate status enum if provided
          if (updateData.status && !['Open', 'Investigating', 'Resolved', 'Closed'].includes(updateData.status)) {
            throw new Error("Status must be one of: 'Open', 'Investigating', 'Resolved', 'Closed'");
          }
          
          // Validate priority enum if provided
          if (updateData.priority && !['Low', 'Medium', 'High', 'Critical'].includes(updateData.priority)) {
            throw new Error("Priority must be one of: 'Low', 'Medium', 'High', 'Critical'");
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
          priority: updateData.priority,
          resolution: updateData.resolution,
          related_risk_id: updateData.related_risk_id,
          // project_id and reported_by_user_id should not be changed
        };
        // Using type assertion to handle TS7053
        Object.keys(allowedUpdates).forEach((key) => {
          if (
            allowedUpdates[key as keyof typeof allowedUpdates] === undefined
          ) {
            delete allowedUpdates[key as keyof typeof allowedUpdates];
          }
        });

        // Update the issue
        const { data: updatedIssue, error: updateError } = await supabaseClient
          .from('issues')
          .update(allowedUpdates)
          .eq('id', issueId)
          .select()
          .single(); // RLS should also prevent unauthorized updates

        if (updateError) {
          console.error(
            `Error updating issue ${issueId}:`,
            updateError.message,
          );
          
          // Handle specific errors
          if (updateError.code === 'PGRST204') { // No rows updated/selected
            return new Response(
              JSON.stringify({ error: 'Issue not found or update failed' }),
              {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          } else if (updateError.code === '23503') { // Foreign key violation
            const constraint = updateError.message.includes('related_risk_id') 
              ? 'related_risk_id' 
              : updateError.message.includes('assigned_to_user_id')
                ? 'assigned_to_user_id'
                : 'unknown foreign key';
            
            return new Response(
              JSON.stringify({ 
                error: `Invalid reference: ${constraint} refers to a record that doesn't exist` 
              }),
              {
                status: 400, // Bad Request
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          } else if (updateError.code === '23514') { // Check constraint violation
            return new Response(
              JSON.stringify({
                error: `Invalid field value: ${updateError.message}`
              }),
              {
                status: 400, // Bad Request
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          } else if (updateError.code === '23502') { // Not null violation
            const columnMatch = updateError.message.match(/null value in column "(.+?)"/);
            const column = columnMatch ? columnMatch[1] : 'unknown';
            
            return new Response(
              JSON.stringify({
                error: `The ${column} field is required.`
              }),
              {
                status: 400, // Bad Request
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }
          
          throw updateError;
        }

        console.log(`Successfully updated issue ${issueId}`);
        return new Response(JSON.stringify(updatedIssue), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      case 'DELETE': {
        if (!issueId) {
          return new Response(
            JSON.stringify({ error: 'Bad Request: Issue ID missing in URL' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        console.log(
          `Attempting to delete issue ${issueId}, requested by user ${user.id}`,
        );

        // Fetch issue's project and company for permission check
        const { data: issueToCheck, error: checkError } = await supabaseClient
          .from('issues')
          .select('project_id, projects ( company_id )')
          .eq('id', issueId)
          .single();

        // The join might return an array even with .single(), addressing TS2339
        const projectCompanyId = issueToCheck?.projects?.[0]?.company_id;
        if (checkError || !projectCompanyId) {
          console.error(
            `Error fetching issue ${issueId} for permission check or issue/project/company not found:`,
            checkError?.message,
          );
          return new Response(
            JSON.stringify({
              error: 'Issue or associated project/company not found',
            }),
            {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Permission check using has_permission RPC function
        const { data: hasPermission, error: permissionError } = await supabaseClient.rpc(
          'has_permission',
          {
            user_id: user.id,
            company_id: projectCompanyId,
            permission_key: 'issue:manage',
          },
        );
        
        if (permissionError) {
          console.error(
            `Error checking permissions for user ${user.id}:`,
            permissionError.message,
          );
          throw permissionError;
        }

        if (!hasPermission) {
          console.error(
            `User ${user.id} not authorized to update issue ${issueId} in project ${issueToCheck.project_id}.`,
          );
          return new Response(
            JSON.stringify({ error: 'Forbidden: Not authorized to update this issue' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Delete the issue
        const { error: deleteError } = await supabaseClient
          .from('issues')
          .delete()
          .eq('id', issueId);

        if (deleteError) {
          console.error(
            `Error deleting issue ${issueId}:`,
            deleteError.message,
          );
          
          // Handle specific database errors
          if (deleteError.code === 'PGRST204') { // No rows deleted
            return new Response(
              JSON.stringify({ error: 'Issue not found or already deleted' }),
              {
                status: 404, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          } else if (deleteError.code === '23503') { // Foreign key violation
            return new Response(
              JSON.stringify({ 
                error: 'Cannot delete this issue because it is referenced by other records' 
              }),
              {
                status: 409, // Conflict
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            );
          }
          
          throw deleteError;
        }

        console.log(`Successfully deleted issue ${issueId}`);
        return new Response(null, { // No content response
          headers: { ...corsHeaders },
          status: 204, // No Content
        });
      }
      default:
        console.warn(`Method ${req.method} not allowed for /issues`);
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
