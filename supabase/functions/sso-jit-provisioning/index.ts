// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts'; // Although not strictly needed for hooks, good practice
import { createInternalServerErrorResponse } from '../_shared/validation.ts';

console.log('SSO JIT Provisioning function started');

// --- Interfaces (Based on Supabase Custom Access Token Hook Payload) ---
interface HookUser {
  id: string;
  aud: string;
  role: string;
  email?: string;
  app_metadata: {
    provider?: string; // e.g., 'saml', 'oidc'
    providers?: string[];
    [key: string]: any; // Allow other metadata
  };
  user_metadata: {
    [key: string]: any; // User-specific metadata from IdP
  };
  identities?: any[];
  // ... other potential user fields
}

interface HookPayload {
  type: 'custom_access_token';
  event: { type: string }; // e.g., "user.signed_in"
  user: HookUser;
  claims: { // Claims intended for the final JWT
    session_id: string;
    [key: string]: any;
  };
}

interface SsoConfig {
  id: string;
  company_id: string;
  provider_type: 'saml' | 'oidc';
  is_active: boolean;
  domain?: string;
  attribute_mapping?: {
    email?: string; // Path in claims/metadata to find email
    full_name?: string; // Path to find full name
    role?: { // Role mapping config
      attribute_name: string; // Path to find group/role attribute
      mappings: { [idpRole: string]: string }; // Map IdP role/group to internal role_name
      default_role: string; // Default internal role if no mapping found
    };
    // Add other mappings as needed (e.g., department, phone)
  };
}

// --- Helper: Get value from nested object using path string ---
function getValueFromPath(obj: any, path: string | undefined): any {
  if (!path) return undefined;
  // Simple path notation for now (e.g., 'user_metadata.name', 'app_metadata.groups[0]')
  // Needs enhancement for more complex paths or JSONata/JMESPath if required.
  return path.split('.').reduce((o, k) => {
    // Basic handling for array index like groups[0]
    const arrMatch = k.match(/^(.+)\[(\d+)\]$/);
    if (arrMatch) {
      const key = arrMatch[1];
      const index = parseInt(arrMatch[2], 10);
      return o?.[key]?.[index];
    }
    return o?.[k];
  }, obj);
}

// --- Main Handler ---
serve(async (req) => {
  // Basic check for POST method
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // --- Client Setup (using Service Role Key for elevated privileges) ---
  let supabaseAdminClient: SupabaseClient;
  try {
    supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // Use Service Role Key
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  } catch (e) {
    const setupErrorMessage = e instanceof Error
      ? e.message
      : 'Unknown error during admin client setup';
    console.error('Admin Client Setup Error:', setupErrorMessage);
    return createInternalServerErrorResponse(
      `Admin Client Setup Error: ${setupErrorMessage}`,
    );
  }

  // --- Parse Hook Payload ---
  let payload: HookPayload;
  try {
    payload = await req.json();
    // Basic validation of payload structure
    if (payload.type !== 'custom_access_token' || !payload.user || !payload.claims) {
      throw new Error('Invalid hook payload structure');
    }
  } catch (e) {
    const parseErrorMessage = e instanceof Error
      ? e.message
      : 'Invalid JSON body';
    console.error('Hook Payload Parsing Error:', parseErrorMessage);
    return new Response(JSON.stringify({ error: `Bad Request: ${parseErrorMessage}` }), { status: 400 });
  }

  const { user, claims } = payload;
  console.log(`Processing JIT provisioning for user: ${user.id} (${user.email})`);

  // --- Main JIT Logic ---
  try {
    // 1. Identify Company via Email Domain (or other claim if configured)
    const email = user.email;
    if (!email) {
      console.error(`User ${user.id} has no email, cannot determine company.`);
      // Return original claims, effectively skipping JIT for this user
      return new Response(JSON.stringify({ custom_claims: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const domain = email.split('@')[1];
    if (!domain) {
      console.error(`Could not extract domain from email: ${email}`);
      return new Response(JSON.stringify({ custom_claims: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log(`User domain identified as: ${domain}`);

    // 2. Lookup SSO Configuration
    const { data: ssoConfig, error: configError } = await supabaseAdminClient
      .from('sso_configurations')
      .select('*') // Select all fields including attribute_mapping
      .eq('domain', domain)
      .eq('is_active', true)
      .maybeSingle(); // Use maybeSingle as config might not exist

    if (configError) {
      console.error(`Error fetching SSO config for domain ${domain}:`, configError.message);
      throw new Error(`Database error fetching SSO config: ${configError.message}`);
    }

    if (!ssoConfig) {
      console.warn(`No active SSO configuration found for domain: ${domain}. Skipping JIT.`);
      return new Response(JSON.stringify({ custom_claims: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log(`Found active SSO config for company ${ssoConfig.company_id}`);
    const config = ssoConfig as SsoConfig; // Type assertion

    // 3. Parse Attributes based on Mapping
    const attributeMapping = config.attribute_mapping;
    const userFullName = getValueFromPath(user, attributeMapping?.full_name) || user.email; // Fallback to email if name not mapped/found
    console.log(`Mapped full_name: ${userFullName}`);

    // 4. Create/Update User Profile
    const { data: profile, error: profileUpsertError } = await supabaseAdminClient
      .from('user_profiles')
      .upsert(
        {
          user_id: user.id,
          full_name: userFullName,
          is_active: true, // Ensure user is marked active on SSO login
        },
        { onConflict: 'user_id' },
      )
      .select('user_id') // Select minimal data
      .single();

    if (profileUpsertError) {
      console.error(`Error upserting user profile for ${user.id}:`, profileUpsertError.message);
      throw new Error(`Database error upserting profile: ${profileUpsertError.message}`);
    }
    console.log(`User profile upserted for ${user.id}`);

    // 5. Determine Role based on Mapping
    let assignedRole = attributeMapping?.role?.default_role || 'Client Viewer'; // Fallback role
    if (attributeMapping?.role?.attribute_name && attributeMapping?.role?.mappings) {
      const roleAttributeValue = getValueFromPath(user, attributeMapping.role.attribute_name);
      console.log(`Role attribute (${attributeMapping.role.attribute_name}) value: ${roleAttributeValue}`);
      if (roleAttributeValue) {
        // Handle single value or array of values
        const rolesToCheck = Array.isArray(roleAttributeValue) ? roleAttributeValue : [roleAttributeValue];
        for (const idpRole of rolesToCheck) {
          if (attributeMapping.role.mappings[idpRole]) {
            assignedRole = attributeMapping.role.mappings[idpRole];
            console.log(`Mapped IdP role "${idpRole}" to internal role "${assignedRole}"`);
            break; // Use the first match found
          }
        }
      }
    }
    console.log(`Final assigned role for user ${user.id} in company ${config.company_id}: ${assignedRole}`);

    // 6. Create/Update Company User Association
    const { error: companyUserUpsertError } = await supabaseAdminClient
      .from('company_users')
      .upsert(
        {
          company_id: config.company_id,
          user_id: user.id,
          role: assignedRole,
        },
        { onConflict: 'company_id, user_id' }, // Upsert based on unique constraint
      );

    if (companyUserUpsertError) {
      console.error(`Error upserting company user record for user ${user.id}, company ${config.company_id}:`, companyUserUpsertError.message);
      // Check for specific errors like invalid role FK
      if (companyUserUpsertError.code === '23503' && companyUserUpsertError.message.includes('company_users_role_fkey')) {
         console.error(`Invalid role "${assignedRole}" assigned via SSO mapping. Check roles table and SSO config.`);
         // Potentially assign a default valid role here instead of failing? Or log and return error?
         // For now, let the error propagate.
      }
      throw new Error(`Database error upserting company user: ${companyUserUpsertError.message}`);
    }
    console.log(`Company user record upserted for user ${user.id}, company ${config.company_id}`);

    // 7. Prepare Custom Claims to Return
    const customClaims = {
      company_id: config.company_id,
      role: assignedRole,
      // Add any other claims needed in the JWT session
    };

    console.log(`JIT provisioning complete for user ${user.id}. Returning custom claims:`, customClaims);

    // --- Return Modified Claims ---
    return new Response(
      JSON.stringify({ custom_claims: customClaims }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    const processErrorMessage = error instanceof Error
      ? error.message
      : 'Unknown internal server error during JIT processing';
    console.error('SSO JIT Processing Error:', processErrorMessage, error);
    // Log failure but return original claims to avoid blocking login entirely
    // TODO: Consider logging to background_job_failures table
    return new Response(JSON.stringify({ custom_claims: {} }), { // Return empty custom claims on error
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, // Must return 200 OK for the hook
    });
  }
});
