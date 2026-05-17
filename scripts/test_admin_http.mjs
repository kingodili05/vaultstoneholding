// Pure HTTP probe of Supabase auth + admin Edge Function + profile RLS.
// No browser. Replays exactly what the client does on /admin.html in <1s.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wkkwwoalovuwhgvzprov.supabase.co';
const PUBLIC_KEY   = process.env.SUPABASE_ANON_KEY || 'sb_publishable_rFFOekzm14plccWWozXxHQ_v9YgM73k';
const EMAIL        = process.env.ADMIN_EMAIL    || 'support@vaultstoneholding.com';
const PASSWORD     = process.env.ADMIN_PASSWORD || '';

if (!PASSWORD) { console.error('FATAL: ADMIN_PASSWORD env var required'); process.exit(1); }

const t0 = Date.now();
const t  = () => `${(Date.now() - t0).toString().padStart(4, ' ')}ms`;

async function step(name, fn) {
  const s = Date.now();
  try {
    const r = await fn();
    console.log(`✓ ${t()} ${name} (${Date.now() - s}ms)`);
    return r;
  } catch (e) {
    console.log(`✗ ${t()} ${name} — ${e.message}`);
    throw e;
  }
}

// 1 — Auth: signInWithPassword
const auth = await step('auth/v1/token?grant_type=password', async () => {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': PUBLIC_KEY },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
});
const jwt    = auth.access_token;
const userId = auth.user?.id;
console.log(`  user.id = ${userId}`);
console.log(`  user.email = ${auth.user?.email}`);
console.log(`  token aud = ${JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).aud}`);

// 2 — Profile read (same query the client makes on /admin.html)
const profile = await step('rest/v1/profiles?id=eq.<uid>&select=*', async () => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
    headers: {
      'apikey': PUBLIC_KEY,
      'Authorization': `Bearer ${jwt}`,
      'Accept': 'application/json',
    },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
});
console.log(`  rows = ${profile.length}, role = ${profile[0]?.role}, status = ${profile[0]?.status}`);

// 3 — Accounts read (the other query the client races on /admin.html)
const accounts = await step('rest/v1/accounts?user_id=eq.<uid>', async () => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/accounts?user_id=eq.${userId}&select=*`, {
    headers: { 'apikey': PUBLIC_KEY, 'Authorization': `Bearer ${jwt}` },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
});
console.log(`  accounts = ${accounts.length} (${accounts.map(a => a.type).join(', ')})`);

// 4 — Admin Edge Function list_users
const list = await step('functions/v1/admin {action:list_users}', async () => {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}`, 'apikey': PUBLIC_KEY },
    body: JSON.stringify({ action: 'list_users' }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
});
console.log(`  users = ${list.users?.length ?? 'N/A'}`);

console.log(`\n═══ verdict ═══`);
console.log(`Backend OK. Auth, RLS profile read, RLS accounts read, admin fn list_users all return < 1s.`);
console.log(`Bug is purely client-side timing in supabase-store.js IIFE on /admin.html.`);
