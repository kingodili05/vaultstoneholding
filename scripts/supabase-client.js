'use strict';

// ─── Vaultstone Bank — Supabase Client ───────────────────────
// Replace the two placeholder values below with your project's
// credentials from: Supabase Dashboard → Settings → API
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://wkkwwoalovuwhgvzprov.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indra3d3b2Fsb3Z1d2hndnpwcm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NDgxMjMsImV4cCI6MjA5MjUyNDEyM30.2BdduVQN4X_Fa54Um8f5KAcmrbmqKCwAO7PKU3QDU98';

const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

window._sb = _sb;
