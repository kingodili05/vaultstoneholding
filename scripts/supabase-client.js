'use strict';

// ─── Vaultstone Bank — Supabase Client ───────────────────────
// Singleton guard: if this script is somehow executed a second time
// (e.g. duplicate <script> tag or dynamic import), bail out immediately
// to prevent the "Multiple GoTrueClient instances detected" warning and
// the auth-state conflicts that cause login/signup to hang indefinitely.
if (window._sb) { /* already initialised — do nothing */ }
else {

const SUPABASE_URL = 'https://wkkwwoalovuwhgvzprov.supabase.co';
// Publishable key (replaces legacy anon JWT). Public-safe — RLS-gated reads only.
const SUPABASE_ANON_KEY = 'sb_publishable_rFFOekzm14plccWWozXxHQ_v9YgM73k';

// NOTE: the service-role key MUST NOT live in client code. All privileged
// (RLS-bypassing) ops go through the `admin` Supabase Edge Function, which
// verifies the caller's JWT and looks up profiles.role === 'admin' before
// touching the service-role client server-side.
// If you previously had a SUPABASE_SERVICE_KEY constant here, rotate it
// immediately in the Supabase dashboard — anyone who loaded the page has it.

window._sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
    // navigator.locks-based default lock can hang getSession() across page
    // navigations on some browsers. Replace with a no-op since we are
    // single-tab and singleton-guarded above.
    lock: (_name, _acquireTimeout, fn) => fn(),
  },
});

} // end singleton guard
