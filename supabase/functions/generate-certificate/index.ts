// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  createBadRequestResponse,
  createInternalServerErrorResponse,
  createMethodNotAllowedResponse,
  createUnauthorizedResponse,
} from '../_shared/validation.ts';

console.log('Generate Certificate function started');

const CERTIFICATES_BUCKET = 'certificates';

// --- Helper: Get Secret from Vault ---
// (Assuming this helper exists or is added, similar to send-notification function)
async function getSecret(
  client: SupabaseClient,
  secretName: string,
): Promise<string | null> {
  console.log(`Attempting to fetch secret: ${secretName}`);
  try {
    const secretValue = Deno.env.get(secretName); // Using env var as placeholder/fallback
    if (!secretValue) {
      console.warn(`Secret ${secretName} not found in environment variables.`);
      // TODO: Implement actual Vault fetching logic here using RPC or other secure method
      return null;
    }
    console.log(`Successfully retrieved secret: ${secretName}`);
    return secretValue;
  } catch (error) {
    console.error(`Error fetching secret ${secretName}:`, error);
    return null;
  }
}

// --- Helper: Log Failure ---
// (Assuming this helper exists or is added, similar to generate-recurring-tasks function)
async function logFailure(
  client: SupabaseClient,
  jobName: string,
  payload: any | null,
  error: Error,
) {
  console.error(`Logging failure for job ${jobName}:`, error.message);
  try {
    const { error: logInsertError } = await client
      .from('background_job_failures')
      .insert({
        job_name: jobName,
        payload: payload ? JSON.parse(JSON.stringify(payload)) : null,
        error_message: error.message,
        stack_trace: error.stack,
        status: 'logged',
      });
    if (logInsertError) {
      console.error('!!! Failed to log failure to database:', logInsertError.message);
    } else {
      console.log(`Failure logged successfully for job ${jobName}.`);
    }
  } catch (e) {
    const loggingErrorMessage = e instanceof Error ? e.message : 'Unknown error during logging';
    console.error(`!!! CRITICAL: Error occurred while trying to log job failure: ${loggingErrorMessage}`);
  }
}

// --- Main Handler ---
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return createMethodNotAllowedResponse();
  }

  // --- Internal Authentication ---
  let internalAuthSecret: string | null = null;
  let supabaseAdminClient: SupabaseClient | null = null;
  try {
    supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // Use Service Role Key
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    internalAuthSecret = await getSecret(supabaseAdminClient, 'INTERNAL_FUNCTION_SECRET');
    if (!internalAuthSecret) throw new Error('Internal function secret not configured.');

    const authorizationHeader = req.headers.get('Authorization');
    if (!authorizationHeader || authorizationHeader !== `Bearer ${internalAuthSecret}`) {
      return createUnauthorizedResponse('Invalid internal authorization');
    }
  } catch (e) {
    const authErrorMessage = e instanceof Error ? e.message : 'Internal auth setup error';
    console.error('Internal Auth Setup Error:', authErrorMessage);
    return createInternalServerErrorResponse(authErrorMessage);
  }
  // --- End Internal Authentication ---

  // --- Parse Payload ---
  let payload: { user_id: string; course_id: string; company_id: string };
  try {
    payload = await req.json();
    if (!payload.user_id || !payload.course_id || !payload.company_id) {
      throw new Error('Missing required fields: user_id, course_id, company_id');
    }
  } catch (e) {
    const parseErrorMessage = e instanceof Error ? e.message : 'Invalid JSON body';
    console.error('Payload Parsing Error:', parseErrorMessage);
    return createBadRequestResponse(parseErrorMessage);
  }

  console.log(`Generating certificate for user ${payload.user_id}, course ${payload.course_id}, company ${payload.company_id}`);

  // --- Main Logic ---
  try {
    // 1. Fetch necessary data (User Name, Course Name, Company Name)
    const [userRes, courseRes, companyRes] = await Promise.all([
      supabaseAdminClient.from('user_profiles').select('full_name').eq('user_id', payload.user_id).single(),
      supabaseAdminClient.from('courses').select('name').eq('id', payload.course_id).single(),
      supabaseAdminClient.from('companies').select('name').eq('id', payload.company_id).single(),
    ]);

    if (userRes.error || !userRes.data) throw new Error(`User not found: ${userRes.error?.message}`);
    if (courseRes.error || !courseRes.data) throw new Error(`Course not found: ${courseRes.error?.message}`);
    if (companyRes.error || !companyRes.data) throw new Error(`Company not found: ${companyRes.error?.message}`);

    const userName = userRes.data.full_name || 'Participant';
    const courseName = courseRes.data.name;
    const companyName = companyRes.data.name;
    const completionDate = new Date().toLocaleDateString('en-AU'); // Format date as needed

    // 2. Fetch PDFMonkey Secrets
    const pdfMonkeyApiKey = await getSecret(supabaseAdminClient, 'PDFMONKEY_API_KEY');
    const pdfMonkeyTemplateId = await getSecret(supabaseAdminClient, 'PDFMONKEY_CERTIFICATE_TEMPLATE_ID');

    if (!pdfMonkeyApiKey || !pdfMonkeyTemplateId) {
      throw new Error('PDFMonkey API Key or Template ID not configured in Vault.');
    }

    // 3. Prepare PDFMonkey Payload
    const pdfMonkeyPayload = {
      document: {
        document_template_id: pdfMonkeyTemplateId,
        payload: {
          user_name: userName,
          course_name: courseName,
          company_name: companyName,
          completion_date: completionDate,
          // Add any other dynamic data your template requires
        },
        status: 'pending', // Or 'draft' if you want to review first
        // meta: { _filename: `${userName}_${courseName}_Certificate.pdf` } // Optional filename hint
      },
    };

    // 4. Call PDFMonkey API to generate document
    console.log('Calling PDFMonkey API...');
    const pdfMonkeyResponse = await fetch('https://api.pdfmonkey.io/v1/documents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pdfMonkeyApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pdfMonkeyPayload),
    });

    if (!pdfMonkeyResponse.ok) {
      const errorBody = await pdfMonkeyResponse.text();
      throw new Error(`PDFMonkey API error: ${pdfMonkeyResponse.status} - ${errorBody}`);
    }

    const pdfMonkeyResult = await pdfMonkeyResponse.json();
    const downloadUrl = pdfMonkeyResult?.document?.download_url;
    const generatedDocId = pdfMonkeyResult?.document?.id;

    if (!downloadUrl || !generatedDocId) {
      throw new Error('PDFMonkey response did not include download_url or document ID.');
    }
    console.log(`PDF generated successfully (PDFMonkey ID: ${generatedDocId}). Download URL: ${downloadUrl}`);

    // 5. Download the generated PDF
    console.log('Downloading generated PDF...');
    const pdfResponse = await fetch(downloadUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download generated PDF from ${downloadUrl}`);
    }
    const pdfData = await pdfResponse.arrayBuffer();
    console.log(`PDF downloaded (${pdfData.byteLength} bytes).`);

    // 6. Upload PDF to Supabase Storage
    const storageFileName = `${payload.company_id}/${payload.user_id}/${payload.course_id}_${new Date().toISOString()}.pdf`;
    const storagePath = `${CERTIFICATES_BUCKET}/${storageFileName}`; // Use bucket name directly in path for upload
    console.log(`Uploading PDF to Supabase Storage: ${storagePath}`);

    const { error: uploadError } = await supabaseAdminClient.storage
      .from(CERTIFICATES_BUCKET)
      .upload(storageFileName, pdfData, { // Use filename without bucket prefix here
        contentType: 'application/pdf',
        upsert: true, // Overwrite if exists?
      });

    if (uploadError) {
      throw new Error(`Failed to upload certificate to storage: ${uploadError.message}`);
    }
    console.log('PDF uploaded successfully.');

    // 7. Create course_certificates record
    const { error: insertCertError } = await supabaseAdminClient
      .from('course_certificates')
      .insert({
        user_id: payload.user_id,
        course_id: payload.course_id,
        company_id: payload.company_id,
        certificate_url: storageFileName, // Store the path within the bucket
        issued_at: new Date().toISOString(),
      });

    if (insertCertError) {
      // Attempt cleanup of storage file if DB insert fails
      await supabaseAdminClient.storage.from(CERTIFICATES_BUCKET).remove([storageFileName]);
      console.warn(`Cleaned up storage file ${storageFileName} due to DB insert error.`);
      throw new Error(`Failed to create certificate record: ${insertCertError.message}`);
    }

    console.log('Certificate record created successfully.');

    // --- Success ---
    return new Response(JSON.stringify({ message: 'Certificate generated successfully', path: storageFileName }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const processErrorMessage = error instanceof Error ? error.message : 'Unknown error generating certificate';
    console.error('Certificate Generation Error:', processErrorMessage, error);
    await logFailure(supabaseAdminClient, 'generate-certificate', payload, error);
    return createInternalServerErrorResponse(processErrorMessage, error);
  }
});
