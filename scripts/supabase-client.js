'use strict';

// ─── Vaultstone Bank — Supabase Client ───────────────────────
// Replace the values below with your project's credentials from
// Supabase Dashboard → Settings → API
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://wkkwwoalovuwhgvzprov.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indra3d3b2Fsb3Z1d2hndnpwcm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NDgxMjMsImV4cCI6MjA5MjUyNDEyM30.2BdduVQN4X_Fa54Um8f5KAcmrbmqKCwAO7PKU3QDU98';

// ─── Admin / service-role key — bypasses RLS for admin dashboard
// Get from: Supabase Dashboard → Settings → API → service_role (secret key)
// Paste your service_role key below (the long JWT starting with "eyJ...")
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indra3d3b2Fsb3Z1d2hndnpwcm92Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk0ODEyMywiZXhwIjoyMDkyNTI0MTIzfQ.0bnCaOPkaI7yjz3ij3n1VxDnuJ6nXCkyMD13435Mxg0';

const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
window._sb = _sb;

// Create a second client with the service role key if provided.
// This client bypasses all RLS policies and is used only for admin reads/writes.
if (SUPABASE_SERVICE_KEY) {
  window._sbAdmin = window.supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
