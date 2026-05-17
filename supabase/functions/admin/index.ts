// ─────────────────────────────────────────────────────────────
// Vaultstone Bank — Admin Edge Function
//
// Single dispatch endpoint for all privileged (service-role) ops.
// The service-role key NEVER leaves this function. Client calls
// it via Authorization: Bearer <user JWT>; this function:
//   1. verifies the JWT belongs to a real auth.users row
//   2. checks profiles.role === 'admin' for that user
//   3. dispatches on `action` to the correct service-role op
//
// Deploy:
//   supabase functions deploy admin --no-verify-jwt
// Env vars required (set via `supabase secrets set`):
//   SUPABASE_URL              (auto-injected)
//   SUPABASE_ANON_KEY         (auto-injected)
//   SUPABASE_SERVICE_ROLE_KEY (auto-injected)
// ─────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')              ?? '';
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')         ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

// Service-role client — bypasses RLS. Reused across requests.
const adm = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Auth gate ───────────────────────────────────────────────
async function requireAdmin(req: Request): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, res: json({ error: 'Missing Authorization header' }, 401) };

  // Verify token against Supabase auth using a per-request anon client.
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await anon.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false, res: json({ error: 'Invalid token' }, 401) };
  }

  const uid = userData.user.id;
  const { data: profile, error: profErr } = await adm
    .from('profiles')
    .select('role')
    .eq('id', uid)
    .single();

  if (profErr || !profile || profile.role !== 'admin') {
    return { ok: false, res: json({ error: 'Admin role required' }, 403) };
  }

  return { ok: true, userId: uid };
}

// ─── Action handlers ─────────────────────────────────────────
type Body = Record<string, unknown>;

async function listUsers(): Promise<Response> {
  const [profilesRes, accountsRes] = await Promise.all([
    adm.from('profiles').select('*').order('created_at', { ascending: false }),
    adm.from('accounts').select('*'),
  ]);
  if (profilesRes.error) return json({ error: profilesRes.error.message }, 500);
  return json({ profiles: profilesRes.data ?? [], accounts: accountsRes.data ?? [] });
}

async function getUserFull(b: Body): Promise<Response> {
  const userId = String(b.userId ?? '');
  if (!userId) return json({ error: 'userId required' }, 400);
  const [profileRes, accountsRes] = await Promise.all([
    adm.from('profiles').select('*').eq('id', userId).single(),
    adm.from('accounts').select('*').eq('user_id', userId),
  ]);
  if (profileRes.error) return json({ error: profileRes.error.message }, 404);
  return json({ profile: profileRes.data, accounts: accountsRes.data ?? [] });
}

async function updateProfile(b: Body): Promise<Response> {
  const userId  = String(b.userId ?? '');
  const updates = (b.updates ?? {}) as Record<string, unknown>;
  if (!userId) return json({ error: 'userId required' }, 400);

  // Allow-list of mutable columns — never trust client to name columns.
  const ALLOWED = new Set([
    'full_name', 'phone', 'country', 'dob',
    'status', 'kyc_status', 'role', 'last_login', 'account_type',
  ]);
  const mapped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (ALLOWED.has(k)) mapped[k] = v;
  }
  if (Object.keys(mapped).length === 0) return json({ error: 'No valid fields' }, 400);

  const { data, error } = await adm.from('profiles').update(mapped).eq('id', userId).select('*').single();
  if (error) return json({ error: error.message }, 500);
  return json({ profile: data });
}

async function deleteUser(b: Body): Promise<Response> {
  const userId = String(b.userId ?? '');
  if (!userId) return json({ error: 'userId required' }, 400);
  const { error } = await adm.from('profiles').delete().eq('id', userId);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

async function setStatus(b: Body, adminId: string): Promise<Response> {
  const userId = String(b.userId ?? '');
  const status = String(b.status ?? '');
  const VALID = new Set(['active', 'pending_kyc', 'pending', 'suspended', 'locked']);
  if (!userId || !VALID.has(status)) return json({ error: 'userId and valid status required' }, 400);

  const { data, error } = await adm.rpc('admin_set_status', {
    p_user_id: userId, p_status: status, p_admin_id: adminId,
  });
  if (error) return json({ error: error.message }, 500);
  return json({ result: data });
}

async function adjustBalance(b: Body, adminId: string): Promise<Response> {
  const userId   = String(b.userId ?? '');
  const delta    = Number(b.delta);
  const acctType = String(b.acctType ?? 'checking');
  if (!userId || !Number.isFinite(delta)) return json({ error: 'userId and numeric delta required' }, 400);

  const { data, error } = await adm.rpc('admin_adjust_balance', {
    p_user_id: userId, p_delta: delta, p_admin_id: adminId, p_acct_type: acctType,
  });
  if (error) return json({ error: error.message }, 500);
  return json({ result: data });
}

async function reviewKyc(b: Body, adminId: string): Promise<Response> {
  const userId       = String(b.userId ?? '');
  const decision     = String(b.decision ?? '');
  const submissionId = b.submissionId != null ? String(b.submissionId) : null;
  const reason       = b.reason       != null ? String(b.reason)       : null;
  if (!userId || !['approve', 'reject'].includes(decision)) {
    return json({ error: 'userId and decision (approve|reject) required' }, 400);
  }
  const { data, error } = await adm.rpc('admin_review_kyc', {
    p_user_id:       userId,
    p_action:        decision,
    p_admin_id:      adminId,
    p_submission_id: submissionId,
    p_reason:        reason,
  });
  if (error) return json({ error: error.message }, 500);
  return json({ result: data });
}

async function listTransfers(): Promise<Response> {
  const { data, error } = await adm.from('transfers').select('*').order('created_at', { ascending: false });
  if (error) return json({ error: error.message }, 500);
  return json({ transfers: data ?? [] });
}

async function listTransactions(): Promise<Response> {
  const { data, error } = await adm
    .from('transactions')
    .select('*')
    .order('date', { ascending: false })
    .limit(200);
  if (error) return json({ error: error.message }, 500);
  return json({ transactions: data ?? [] });
}

async function insertTransactions(b: Body): Promise<Response> {
  const rows = Array.isArray(b.rows) ? b.rows : null;
  if (!rows || rows.length === 0) return json({ error: 'rows array required' }, 400);
  if (rows.length > 500) return json({ error: 'Max 500 rows per call' }, 413);

  const CHUNK = 100;
  const inserted: unknown[] = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { data, error } = await adm.from('transactions').insert(rows.slice(i, i + CHUNK)).select();
    if (error) return json({ error: error.message, insertedSoFar: inserted.length }, 500);
    inserted.push(...(data ?? []));
  }
  return json({ inserted });
}

// ─── Dispatcher ──────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.res;
  const adminId = gate.userId;

  let body: Body;
  try { body = await req.json() as Body; }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const action = String(body.action ?? '');

  try {
    switch (action) {
      case 'list_users':           return await listUsers();
      case 'get_user_full':        return await getUserFull(body);
      case 'update_profile':       return await updateProfile(body);
      case 'delete_user':          return await deleteUser(body);
      case 'set_status':           return await setStatus(body, adminId);
      case 'adjust_balance':       return await adjustBalance(body, adminId);
      case 'review_kyc':           return await reviewKyc(body, adminId);
      case 'list_transfers':       return await listTransfers();
      case 'list_transactions':    return await listTransactions();
      case 'insert_transactions':  return await insertTransactions(body);
      default:                     return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error('[admin]', action, e);
    return json({ error: (e as Error).message }, 500);
  }
});
