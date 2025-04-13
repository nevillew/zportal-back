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
  // createValidationErrorResponse, // Keep if needed for future validation
} from '../_shared/validation.ts'; // Import helpers

console.log('Task Files function started');

// Define the bucket name (using hyphenated version)
const BUCKET_NAME = 'task-attachments';

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
  // Path: /functions/v1/tasks/{taskId}/files
  // Path: /functions/v1/files/{fileId}
  const pathParts = url.pathname.split('/').filter((part) => part);
  let taskId: string | undefined;
  let fileId: string | undefined;

  if (pathParts[2] === 'tasks' && pathParts[4] === 'files') {
    taskId = pathParts[3];
  } else if (pathParts[2] === 'files') {
    fileId = pathParts[3];
  } else {
    return createBadRequestResponse('Invalid endpoint path');
  }

  console.log(`Task ID: ${taskId}, File ID: ${fileId}`);

  try {
    switch (req.method) {
      case 'GET': { // List files for a task
        if (!taskId) {
          return createBadRequestResponse('Task ID is required to list files');
        }
        console.log(`GET /tasks/${taskId}/files`);

        // --- Permission Check: Can the user view the task? ---
        // RLS on 'tasks' should prevent fetching if user doesn't have access.
        const { data: taskCheck, error: taskCheckError } = await supabaseClient
          .from('tasks')
          .select('id') // Minimal select
          .eq('id', taskId)
          .maybeSingle();

        if (taskCheckError) {
          console.error(
            `Error checking task ${taskId} access for listing files:`,
            taskCheckError.message,
          );
          throw new Error(
            `Error verifying task access: ${taskCheckError.message}`,
          );
        }
        if (!taskCheck) {
          console.warn(
            `User ${user.id} tried to list files for non-existent or inaccessible task ${taskId}`,
          );
          return createNotFoundResponse('Task not found or access denied');
        }
        // --- End Permission Check ---

        // --- Fetch File Records ---
        // RLS on task_files should be implemented to ensure visibility based on task access.
        const { data: fileRecords, error: fetchError } = await supabaseClient
          .from('task_files')
          .select('*') // Select all metadata
          .eq('task_id', taskId)
          .order('created_at', { ascending: true });

        if (fetchError) {
          console.error(
            `Error fetching file records for task ${taskId}:`,
            fetchError.message,
          );
          throw new Error(
            `Failed to fetch file records: ${fetchError.message}`,
          );
        }
        // --- End Fetch File Records ---

        // --- Generate Signed URLs ---
        const filesWithUrls = [];
        const expiresIn = 60 * 5; // Signed URL expiry time in seconds (e.g., 5 minutes)

        if (fileRecords) {
          for (const record of fileRecords) {
            const { data: signedUrlData, error: urlError } =
              await supabaseClient.storage
                .from(BUCKET_NAME)
                .createSignedUrl(record.file_path, expiresIn);

            if (urlError) {
              console.error(
                `Error generating signed URL for file ${record.file_path}:`,
                urlError.message,
              );
              // Include the record but indicate URL generation failure
              filesWithUrls.push({
                ...record,
                signedUrl: null,
                error: 'Failed to generate download URL',
              });
            } else {
              filesWithUrls.push({
                ...record,
                signedUrl: signedUrlData.signedUrl,
              });
            }
          }
        }
        // --- End Generate Signed URLs ---

        console.log(`Found ${filesWithUrls.length} files for task ${taskId}`);
        return new Response(JSON.stringify(filesWithUrls), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      case 'POST': { // Upload a file for a task
        if (!taskId) {
          return createBadRequestResponse(
            'Task ID is required to upload a file',
          );
        }
        console.log(`POST /tasks/${taskId}/files`);

        // --- Permission Check: Can the user modify the task? ---
        const { data: taskCheck, error: taskCheckError } = await supabaseClient
          .from('tasks')
          .select(
            'id, section_id, sections ( project_id, projects ( company_id ) )',
          )
          .eq('id', taskId)
          .single(); // Use single to ensure task exists

        if (taskCheckError || !taskCheck) {
          console.error(
            `Error fetching task ${taskId} for permission check or task not found:`,
            taskCheckError?.message,
          );
          return createNotFoundResponse(
            'Task not found or error checking permissions',
          );
        }
        // Use 'any' cast to bypass complex type inference issue (TS2339)
        const projectCompanyId =
          (taskCheck?.sections as any)?.[0]?.projects?.[0]?.company_id ??
            (taskCheck?.sections as any)?.projects?.company_id;
        if (!projectCompanyId) {
          console.error(`Could not determine company ID for task ${taskId}`);
          return createInternalServerErrorResponse(
            'Project/Company information not available for task',
          );
        }

        // Check for 'task:manage' permission or staff status
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
            `User ${user.id} not authorized to upload files for task ${taskId}.`,
          );
          return createForbiddenResponse();
        }
        // --- End Permission Check ---

        // --- Handle File Upload ---
        let fileData: ArrayBuffer | null = null;
        let fileName = 'unknown_file';
        let fileType = 'application/octet-stream'; // Default MIME type

        try {
          const contentType = req.headers.get('content-type');
          if (!contentType || !contentType.includes('multipart/form-data')) {
            throw new Error(
              "Invalid request format. Expected 'multipart/form-data'.",
            );
          }

          const formData = await req.formData();
          const file = formData.get('file'); // Assuming the file input name is 'file'
          if (!(file instanceof File)) {
            throw new Error(
              "No file found in form data or 'file' field is not a File object.",
            );
          }

          fileData = await file.arrayBuffer();
          fileName = file.name;
          fileType = file.type;

          if (!fileData || fileData.byteLength === 0) {
            throw new Error('File data could not be processed or is empty.');
          }
        } catch (e) {
          const errorMessage = e instanceof Error
            ? e.message
            : 'Error processing form data';
          return createBadRequestResponse(errorMessage);
        }
        // --- End Handle File Upload ---

        // --- Upload to Storage ---
        const fileUUID = crypto.randomUUID();
        const filePath = `${taskId}/${fileUUID}_${fileName}`;

        const { error: uploadError } = await supabaseClient.storage
          .from(BUCKET_NAME)
          .upload(filePath, fileData, {
            contentType: fileType,
          });

        if (uploadError) {
          console.error(
            `Error uploading file to storage for task ${taskId}:`,
            uploadError, // Log the original Supabase storage error object
          );
          // Return a more specific error response for storage failures
          return createInternalServerErrorResponse(
            `Storage upload failed: ${uploadError.message}`,
            uploadError, // Pass the original error for potential logging
          );
        }
        console.log(`Successfully uploaded file to path: ${filePath}`);
        // --- End Upload to Storage ---

        // --- Insert Metadata into DB ---
        const { data: newFileRecord, error: insertError } = await supabaseClient
          .from('task_files')
          .insert({
            task_id: taskId,
            file_path: filePath,
            file_name: fileName,
            mime_type: fileType,
            file_size: fileData.byteLength,
            uploaded_by_user_id: user.id,
          })
          .select()
          .single();

        if (insertError) {
          console.error(
            `Error inserting file metadata for task ${taskId}:`,
            insertError.message,
          );
          // Handle specific database errors for metadata insertion
          if (insertError.code === '23503') { // Foreign key violation
            // Attempt to clean up the uploaded storage file
            await supabaseClient.storage.from(BUCKET_NAME).remove([filePath]);
            console.log(
              `Cleaned up orphaned storage file due to FK violation: ${filePath}`,
            );
            const constraint = insertError.message.includes('task_id')
              ? 'task_id'
              : insertError.message.includes('uploaded_by_user_id')
              ? 'uploaded_by_user_id'
              : 'unknown foreign key';
            return createBadRequestResponse(
              `Invalid reference: ${constraint} refers to a record that doesn't exist`,
            );
          } else if (insertError.code === '23502') { // Not null violation
            // Attempt to clean up the uploaded storage file
            await supabaseClient.storage.from(BUCKET_NAME).remove([filePath]);
            console.log(
              `Cleaned up orphaned storage file due to NOT NULL violation: ${filePath}`,
            );
            const columnMatch = insertError.message.match(
              /null value in column "(.+?)"/,
            );
            const column = columnMatch ? columnMatch[1] : 'unknown';
            return createBadRequestResponse(
              `The ${column} field is required for file metadata.`,
            );
          }
          // For other insert errors, throw a generic internal server error
          throw new Error(
            `Failed to save file metadata: ${insertError.message}`, // Let the main handler return 500
          );
        }
        // --- End Insert Metadata ---

        console.log(
          `Successfully added file record ${newFileRecord.id} for task ${taskId}`,
        );
        return new Response(JSON.stringify(newFileRecord), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      case 'DELETE': { // Delete a file
        if (!fileId) {
          return createBadRequestResponse(
            'File ID is required to delete a file',
          );
        }
        console.log(`DELETE /files/${fileId}`);

        // --- Fetch File Record ---
        const { data: fileRecord, error: fetchError } = await supabaseClient
          .from('task_files')
          .select('id, file_path, task_id, uploaded_by_user_id') // Select basic file info first
          .eq('id', fileId)
          .single();

        if (fetchError) {
          console.error(
            `Error fetching file record ${fileId} for delete:`,
            fetchError.message,
          );
          const status = fetchError.code === 'PGRST116' ? 404 : 500;
          const message = fetchError.code === 'PGRST116'
            ? 'File record not found'
            : 'Error fetching file record';
          if (status === 404) {
            return createNotFoundResponse(message);
          } else {
            return createInternalServerErrorResponse(message);
          }
        }
        // --- End Fetch File Record ---

        // --- Permission Check ---
        const isUploader = fileRecord.uploaded_by_user_id === user.id;
        let hasManagePermission = false;
        let isStaffUser = false;

        // --- Fetch Company ID separately for Permission Check ---
        let projectCompanyId: string | null = null;
        if (fileRecord?.task_id) {
          const { data: taskCompanyData, error: taskCompanyError } =
            await supabaseClient
              .from('tasks')
              .select('sections ( projects ( company_id ) )')
              .eq('id', fileRecord.task_id)
              .single();

          if (taskCompanyError) {
            console.error(
              `Error fetching task details for company ID check (file ${fileId}):`,
              taskCompanyError.message,
            );
            // Proceed cautiously, relying on uploader check or staff status
          } else {
            // Access company_id, assuming potential arrays from joins
            projectCompanyId =
              (taskCompanyData?.sections as any)?.[0]?.projects?.[0]
                ?.company_id ?? null;
          }
        }
        // --- End Fetch Company ID ---

        if (projectCompanyId) {
          // Check task:manage permission
          const { data: permissionData, error: permissionError } =
            await supabaseClient.rpc(
              'has_permission',
              {
                user_id: user.id,
                company_id: projectCompanyId,
                permission_key: 'task:manage',
              },
            );
          if (permissionError) {
            console.error('Permission check error:', permissionError.message); // Log but don't block if staff check passes
          } else hasManagePermission = permissionData;

          // Check staff status
          const { data: profile, error: profileError } = await supabaseClient
            .from('user_profiles').select('is_staff').eq('user_id', user.id)
            .single();
          if (profileError) {
            console.error('Profile fetch error:', profileError.message); // Log but don't block if other checks pass
          } else isStaffUser = profile?.is_staff ?? false;
        } else {
          console.error(
            `Could not determine company ID for file ${fileId} via task ${fileRecord.task_id}`,
          );
          // Fallback to denying if company context is missing, unless uploader
          if (!isUploader) {
            return createInternalServerErrorResponse(
              'Internal error determining permissions',
            );
          }
        }

        if (!isUploader && !hasManagePermission && !isStaffUser) {
          console.warn(
            `User ${user.id} attempted to delete file ${fileId} without permission.`,
          );
          return createForbiddenResponse('Not authorized to delete this file');
        }
        // --- End Permission Check ---

        // --- Delete DB Record First ---
        const { error: deleteDbError } = await supabaseClient
          .from('task_files')
          .delete()
          .eq('id', fileId);

        if (deleteDbError) {
          console.error(
            `Error deleting file record ${fileId} from database:`,
            deleteDbError.message,
          );
          // Handle specific database errors for metadata deletion
          if (deleteDbError.code === 'PGRST204') { // Not Found (already deleted or never existed)
            return createNotFoundResponse(
              'File record not found or already deleted',
            );
          }
          // For other DB errors, let the main handler return 500
          throw new Error(`Database deletion failed: ${deleteDbError.message}`);
        }
        console.log(
          `Successfully deleted file record ${fileId} from database.`,
        );
        // --- End Delete DB Record ---

        // --- Delete Storage File ---
        const { error: deleteStorageError } = await supabaseClient.storage
          .from(BUCKET_NAME)
          .remove([fileRecord.file_path]); // Pass file_path in an array

        if (deleteStorageError) {
          // Log the error, but don't fail the request since the DB record is gone.
          // This might leave an orphaned file in storage, which might need cleanup later.
          console.error(
            `Error deleting file ${fileRecord.file_path} from storage (DB record already deleted):`,
            deleteStorageError.message,
          );
        } else {
          console.log(
            `Successfully deleted file ${fileRecord.file_path} from storage.`,
          );
        }
        // --- End Delete Storage File ---

        return new Response(null, { status: 204, headers: { ...corsHeaders } });
      }
      default:
        return createMethodNotAllowedResponse();
    }
  } catch (error) {
    // Use the standardized internal server error response
    return createInternalServerErrorResponse(undefined, error);
  }
});
