// Standard CORS headers for Supabase functions
export const corsHeaders = {
  // TODO(security): Restrict Access-Control-Allow-Origin to specific frontend domain(s) in production.
  'Access-Control-Allow-Origin': '*', // Or specific origins
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};
