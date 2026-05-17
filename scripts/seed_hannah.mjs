/**
 * One-shot seed script: provisions Hannah Baron as a fully-active customer
 * with ~2.5M checking balance, 40 historical transactions, and executes one
 * outbound transfer to prove the rails work end-to-end.
 *
 *   Required env vars (loaded from .env in project root):
 *     SUPABASE_URL
 *     SUPABASE_SERVICE_KEY
 *     HANNAH_PASSWORD       (optional, defaults to random 24-char string)
 *
 *   Usage:
 *     node --env-file=.env scripts/seed_hannah.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_KEY env vars are required.');
  console.error('Create a .env file in the project root and run with: node --env-file=.env scripts/seed_hannah.mjs');
  process.exit(1);
}

const HANNAH_EMAIL    = 'hannah.baron2026@gmail.com';
const HANNAH_PASSWORD = process.env.HANNAH_PASSWORD
  || randomBytes(18).toString('base64url');
const HANNAH_NAME     = 'Hannah Baron';
const TARGET_BALANCE  = 2_500_000;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function log(...a) { console.log(...a); }
function die(msg, err) { console.error('FATAL:', msg, err); process.exit(1); }

async function ensureUser() {
  // Try to find existing user first
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = list?.users?.find(u => u.email?.toLowerCase() === HANNAH_EMAIL.toLowerCase());
  if (found) {
    log('User already exists — id:', found.id);
    // Reset password to known value
    await admin.auth.admin.updateUserById(found.id, { password: HANNAH_PASSWORD, email_confirm: true });
    return found.id;
  }

  log('Creating auth.users entry…');
  const { data, error } = await admin.auth.admin.createUser({
    email: HANNAH_EMAIL,
    password: HANNAH_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name:    HANNAH_NAME,
      phone:        '+15551234567',
      country:      'US',
      dob:          '1992-07-15',
      account_type: 'personal',
    },
  });
  if (error) die('createUser failed', error);
  log('Created. id:', data.user.id);
  return data.user.id;
}

async function waitForProfile(userId, maxMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { data } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (data) return data;
    await new Promise(r => setTimeout(r, 200));
  }
  return null;
}

async function activateProfile(userId) {
  log('Activating profile (status=active, kyc=approved)…');
  const { error } = await admin
    .from('profiles')
    .update({ status: 'active', kyc_status: 'approved', full_name: HANNAH_NAME })
    .eq('id', userId);
  if (error) die('activateProfile failed', error);
}

async function setBalance(userId) {
  log(`Setting checking balance to $${TARGET_BALANCE.toLocaleString()}…`);
  // Service-role bypasses RLS — direct UPDATE (admin_adjust_balance RPC
  // requires an actual admin profile which we don't seed here)
  const { data, error } = await admin
    .from('accounts')
    .update({ balance: TARGET_BALANCE, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('type', 'checking')
    .select()
    .single();
  if (error) die('setBalance failed', error);
  log(`Balance set: $${parseFloat(data.balance).toLocaleString()}`);
}

async function generateHistory(userId) {
  log('Generating 40 historical transactions…');
  const MERCHANTS = [
    { m: 'Whole Foods Market',   c: 'Groceries',     min: 35,   max: 220 },
    { m: 'Target',               c: 'Retail',        min: 25,   max: 350 },
    { m: 'Amazon',               c: 'Retail',        min: 15,   max: 600 },
    { m: 'Starbucks',            c: 'Food & Drink',  min: 6,    max: 28 },
    { m: 'Shell Gas',            c: 'Fuel',          min: 35,   max: 95 },
    { m: 'Uber',                 c: 'Transport',     min: 8,    max: 75 },
    { m: 'Netflix',              c: 'Entertainment', min: 16,   max: 16 },
    { m: 'Spotify',              c: 'Entertainment', min: 12,   max: 12 },
    { m: 'Apple iCloud',         c: 'Utilities',     min: 3,    max: 12 },
    { m: 'CVS Pharmacy',         c: 'Health',        min: 12,   max: 180 },
    { m: 'United Airlines',      c: 'Travel',        min: 280,  max: 1800 },
    { m: 'Marriott',             c: 'Travel',        min: 220,  max: 850 },
    { m: 'Best Buy',             c: 'Retail',        min: 90,   max: 1400 },
    { m: 'Trader Joe\'s',        c: 'Groceries',     min: 45,   max: 180 },
    { m: 'Chipotle',             c: 'Food & Drink',  min: 12,   max: 35 },
  ];
  const INCOMES = [
    { m: 'Goldman Sachs Payroll',         c: 'Salary',   min: 18000, max: 22000 },
    { m: 'Stripe Dividend',               c: 'Income',   min: 4500,  max: 8000 },
    { m: 'Vaultstone Interest',           c: 'Interest', min: 850,   max: 1400 },
  ];

  const rows = [];
  const now = Date.now();
  for (let i = 0; i < 40; i++) {
    const isIncome = i % 7 === 0; // every 7th = credit
    const pool = isIncome ? INCOMES : MERCHANTS;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const amount = +(pick.min + Math.random() * (pick.max - pick.min)).toFixed(2);
    const daysAgo = Math.floor(Math.random() * 90);
    const date = new Date(now - daysAgo * 86400000 - Math.random() * 86400000).toISOString();
    rows.push({
      user_id:     userId,
      type:        isIncome ? 'credit' : 'debit',
      amount,
      description: isIncome ? `Deposit from ${pick.m}` : `Purchase at ${pick.m}`,
      category:    pick.c,
      merchant:    pick.m,
      status:      'completed',
      date,
    });
  }
  rows.sort((a, b) => new Date(b.date) - new Date(a.date));

  const { error } = await admin.from('transactions').insert(rows);
  if (error) die('insert transactions failed', error);
  log(`Inserted ${rows.length} transactions.`);
}

async function executeTransfer(userId) {
  log('Submitting outbound transfer for $50,000…');
  const { data: row, error } = await admin.from('transfers').insert({
    from_user_id:      userId,
    from_name:         HANNAH_NAME,
    to_user_id:        null,
    to_name:           'Sarah Chen',
    to_account_number: '4521-7788-1234',
    to_bank:           'Chase Bank',
    amount:            50000,
    currency:          'USD',
    note:              'Initial property deposit',
    type:              'external',
    status:            'pending',
  }).select().single();
  if (error) die('createTransfer failed', error);
  log('Transfer pending. id:', row.id);

  log('Approving transfer (admin RPC)…');
  const { data: approveData, error: approveErr } = await admin.rpc('approve_transfer', {
    p_transfer_id: row.id,
    p_admin_id:    userId,
  });
  if (approveErr) die('approve_transfer failed', approveErr);
  log('approve_transfer →', approveData);

  // Verify status
  const { data: final } = await admin.from('transfers').select('*').eq('id', row.id).single();
  if (final.status !== 'approved') die(`Transfer status = ${final.status}, expected approved`, final);
  log(`Transfer status: ${final.status}. processed_at: ${final.processed_at}`);
  return final;
}

async function verifyFinalState(userId) {
  const { data: profile } = await admin.from('profiles').select('*').eq('id', userId).single();
  const { data: accounts } = await admin.from('accounts').select('*').eq('user_id', userId);
  const checking = accounts.find(a => a.type === 'checking');
  const { count: txCount } = await admin.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  const { count: xferCount } = await admin.from('transfers').select('id', { count: 'exact', head: true }).eq('from_user_id', userId);

  log('\n========================================');
  log('  HANNAH BARON — FINAL STATE');
  log('========================================');
  log('Email:           ', HANNAH_EMAIL);
  log('Password:        ', HANNAH_PASSWORD);
  log('User ID:         ', userId);
  log('Status:          ', profile.status);
  log('KYC:             ', profile.kyc_status);
  log('Checking balance:', `$${parseFloat(checking.balance).toLocaleString()}`);
  log('Transactions:    ', txCount);
  log('Transfers sent:  ', xferCount);
  log('========================================\n');
}

(async () => {
  log('━━━ Seeding Hannah Baron ━━━');
  const userId = await ensureUser();
  const profile = await waitForProfile(userId);
  if (!profile) die('Profile never appeared after createUser', null);
  await activateProfile(userId);
  await setBalance(userId);
  await generateHistory(userId);
  await executeTransfer(userId);
  await verifyFinalState(userId);
  log('Done.');
})().catch(e => die('Unhandled', e));
