const SUPABASE_URL = 'https://lpsupabase.ferrisoluciones.com';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzE1MDUwODAwLAogICJleHAiOiAxODcyODE3MjAwCn0.mKBTuXoyxw3lXRGl1VpSlGbSeiMnRardlIx1q5n-o0k';

let supabaseClient = null;

function initSupabase() {
    if (supabaseClient) return supabaseClient;
    if (typeof window.supabase !== 'undefined') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return supabaseClient;
    }
    return null;
}

function getSupabaseClient() {
    if (!supabaseClient) initSupabase();
    return supabaseClient;
}
