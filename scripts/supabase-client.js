'use strict';

// ─── Vaultstone Bank — Supabase Client ───────────────────────
// Singleton guard: if this script is somehow executed a second time
// (e.g. duplicate <script> tag or dynamic import), bail out immediately
// to prevent the "Multiple GoTrueClient instances detected" warning and
// the auth-state conflicts that cause login/signup to hang indefinitely.
if (window._sb) { /* already initialised — do nothing */ }
else {

const SUPABASE_URL = 'https://wkkwwoalovuwhgvzprov.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indra3d3b2Fsb3Z1d2hndnpwcm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NDgxMjMsImV4cCI6MjA5MjUyNDEyM30.2BdduVQN4X_Fa54Um8f5KAcmrbmqKCwAO7PKU3QDU98';

// Service-role key — bypasses RLS. Used only for admin dashboard operations.
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indra3d3b2Fsb3Z1d2hndnpwcm92Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk0ODEyMywiZXhwIjoyMDkyNTI0MTIzfQ.0bnCaOPkaI7yjz3ij3n1VxDnuJ6nXCkyMD13435Mxg0';

window._sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
  },
});

// Admin client: second instance is intentional (service-role, no session persistence).
// persistSession:false prevents a second GoTrueClient from managing token storage,
// which is what causes the "Multiple GoTrueClient instances" warning when two
// session-persisting clients exist simultaneously.
if (SUPABASE_SERVICE_KEY) {
  window._sbAdmin = window.supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      persistSession:     false,
      autoRefreshToken:   false,
      detectSessionInUrl: false,
      storageKey:         'sb-vaultstone-admin',
    },
  });
}

} // end singleton guard
