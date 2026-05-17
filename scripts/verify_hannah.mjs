// Usage:
//   node --env-file=.env scripts/verify_hannah.mjs
// Required env: SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY,
//               HANNAH_UID, HANNAH_EMAIL, HANNAH_PASSWORD
import { createClient } from '@supabase/supabase-js';

const {
  SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY,
  HANNAH_UID, HANNAH_EMAIL, HANNAH_PASSWORD,
} = process.env;

const missing = Object.entries({
  SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY,
  HANNAH_UID, HANNAH_EMAIL, HANNAH_PASSWORD,
}).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error('FATAL: missing env vars:', missing.join(', '));
  process.exit(1);
}

const adm = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth:{persistSession:false,autoRefreshToken:false} });
const usr = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const UID = HANNAH_UID;

// Service-role view
const { data: profile } = await adm.from('profiles').select('*').eq('id', UID).single();
const { data: accts }   = await adm.from('accounts').select('*').eq('user_id', UID);
console.log('--- SERVICE ROLE VIEW ---');
console.log('profile:', { status: profile.status, kyc_status: profile.kyc_status, full_name: profile.full_name });
console.log('accounts:', accts.map(a => ({ type: a.type, balance: a.balance, id: a.id })));

// User login + anon view (what UI actually sees)
const { data: login, error: loginErr } = await usr.auth.signInWithPassword({
  email: HANNAH_EMAIL,
  password: HANNAH_PASSWORD,
});
if (loginErr) { console.error('LOGIN ERR:', loginErr); process.exit(1); }
console.log('\n--- USER LOGIN ---');
console.log('user.id:', login.user.id, ' email_confirmed:', !!login.user.email_confirmed_at);

const { data: pProf, error: pErr } = await usr.from('profiles').select('*').eq('id', UID).maybeSingle();
const { data: pAccts, error: aErr } = await usr.from('accounts').select('*').eq('user_id', UID);
console.log('\n--- ANON RLS VIEW ---');
console.log('profile (anon):', pErr || (pProf ? { status: pProf.status, kyc_status: pProf.kyc_status } : 'NULL'));
console.log('accounts (anon):', aErr || pAccts.map(a => ({ type: a.type, balance: a.balance })));
