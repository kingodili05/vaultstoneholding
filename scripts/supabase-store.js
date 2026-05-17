'use strict';

// ─── Vaultstone Bank — Supabase VaultStore ───────────────────
// Drop-in async replacement for store.js.
// Exposes the same VaultStore API; all mutations are persisted
// to Supabase while keeping an in-memory cache for sync access.
// ─────────────────────────────────────────────────────────────

const VaultStore = (() => {

  const sb = window._sb;

  // ─── Admin Edge Function bridge ─────────────────────────────
  // All service-role ops now route through the `admin` Edge Function.
  // The function verifies caller JWT and profiles.role === 'admin'
  // server-side; no service-role key exists on the client.
  function _supabaseUrl() {
    // sb.supabaseUrl set by createClient — keeps URL out of duplicate consts.
    return (sb && sb.supabaseUrl) || (window._SUPABASE_URL || '');
  }

  async function _adminFn(action, payload = {}) {
    const token = _session?.access_token;
    if (!token) {
      return { ok: false, error: 'Not authenticated' };
    }
    const res = await fetch(`${_supabaseUrl()}/functions/v1/admin`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ action, ...payload }),
    });
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) {
      return { ok: false, error: (json && json.error) || `HTTP ${res.status}` };
    }
    return { ok: true, ...(json || {}) };
  }

  /* ── In-memory cache ─────────────────────────────────────── */
  let _user    = null;   // current user profile (flat object matching old schema)
  let _session = null;   // Supabase session

  // Per-user caches (loaded on demand)
  const _txCache     = {};   // userId → transaction[]
  const _notifCache  = {};   // userId → notification[]
  const _xferCache   = {};   // userId → transfer[]
  let   _allUsers    = [];   // admin: all profiles

  /* ── Shape normalizers ───────────────────────────────────── */
  function _flattenProfile(profile, accounts = []) {
    const checking   = accounts.find(a => a.type === 'checking')   || {};
    const savings    = accounts.find(a => a.type === 'savings')    || {};
    const investment = accounts.find(a => a.type === 'investment') || {};
    // Guard against null full_name — derive a safe display name from email fallback
    const fullName   = profile.full_name || (profile.email ? profile.email.split('@')[0] : 'User');
    return {
      id:                profile.id,
      name:              fullName,
      email:             profile.email || '',
      phone:             profile.phone || '',
      accountType:       profile.account_type || 'checking',
      accountNumber:     profile.account_number || '',
      balance:           parseFloat(checking.balance   || 0),
      savingsBalance:    parseFloat(savings.balance    || 0),
      investmentBalance: parseFloat(investment.balance || 0),
      savingsId:         savings.id    || '',
      investmentId:      investment.id || '',
      status:            profile.status    || 'pending_kyc',
      kycStatus:         profile.kyc_status || 'not_started',
      role:              profile.role       || 'user',
      avatar:            profile.avatar     || fullName.slice(0, 2).toUpperCase(),
      country:           profile.country || 'US',
      dob:               profile.dob || '',
      createdAt:         profile.created_at,
      lastLogin:         profile.last_login,
      cardNumber:        (profile.account_number || '').slice(-4),
      _raw: profile,
    };
  }

  function _flattenTx(tx) {
    return {
      id:          tx.id,
      userId:      tx.user_id,
      type:        tx.type,
      amount:      parseFloat(tx.amount),
      balance:     parseFloat(tx.balance_after || 0),
      description: tx.description,
      category:    tx.category,
      merchant:    tx.merchant,
      date:        tx.date || tx.created_at,
      status:      tx.status,
      transferId:  tx.transfer_id,
    };
  }

  function _flattenTransfer(t) {
    return {
      id:              t.id,
      fromUserId:      t.from_user_id,
      fromName:        t.from_name,
      toUserId:        t.to_user_id,
      toName:          t.to_name,
      toAccountNumber: t.to_account_number,
      toBank:          t.to_bank,
      amount:          parseFloat(t.amount),
      currency:        t.currency,
      note:            t.note,
      type:            t.type,
      status:          t.status,
      createdAt:       t.created_at,
      processedAt:     t.processed_at,
      approvedBy:      t.approved_by,
      rejectionReason: t.rejection_reason,
    };
  }

  function _flattenNotif(n) {
    return {
      id:        n.id,
      userId:    n.user_id,
      type:      n.type,
      title:     n.title,
      message:   n.message,
      read:      n.read,
      createdAt: n.created_at,
    };
  }

  /* ── Initialization ──────────────────────────────────────── */
  // ready resolves once BOTH getSession() AND the first onAuthStateChange event
  // have been processed. On mobile, getSession() can return null when the
  // access token has expired and the network refresh fails, while
  // onAuthStateChange INITIAL_SESSION still reads a valid token from
  // localStorage. Waiting for both prevents a false "no session" that would
  // redirect the user to login on every reload.
  let _readyResolve;
  const ready = new Promise(r => { _readyResolve = r; });
  function _resolveReady() {
    if (_readyResolve) { const fn = _readyResolve; _readyResolve = null; fn(); }
  }

  // Single deterministic init: getSession → load profile → resolve.
  // Resolves as soon as the network round-trip completes (~1s typical).
  (async () => {
    try {
      const { data: { session } } = await sb.auth.getSession();
      _session = session;
      if (session) {
        const [profileRes, accountsRes] = await Promise.all([
          sb.from('profiles').select('*').eq('id', session.user.id).single(),
          sb.from('accounts').select('*').eq('user_id', session.user.id),
        ]);
        if (profileRes.data) {
          _user = _flattenProfile(profileRes.data, accountsRes.data || []);
        }
        sb.from('profiles')
          .update({ last_login: new Date().toISOString() })
          .eq('id', session.user.id)
          .then(() => {});
      }
    } catch (e) {
      console.error('[VaultStore] init error:', e);
    } finally {
      _resolveReady();
    }
  })();

  // Safety net — guarantee `ready` resolves even if getSession() hangs.
  setTimeout(_resolveReady, 6000);

  // Handle later auth events. Does NOT gate `ready`.
  // Only act on explicit events — supabase-js occasionally fires
  // INITIAL_SESSION or TOKEN_REFRESHED with a transient null session,
  // and we must NOT wipe the cached _user / _session that the init
  // flow above already populated on the strength of getSession().
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') {
      _session = null;
      _user    = null;
      return;
    }
    if (event === 'TOKEN_REFRESHED' && session) {
      _session = session;            // refreshed token only; profile unchanged
      return;
    }
    if (event === 'SIGNED_IN' && session && (!_user || _user.id !== session.user.id)) {
      _session = session;
      try {
        const [profileRes, accountsRes] = await Promise.all([
          sb.from('profiles').select('*').eq('id', session.user.id).single(),
          sb.from('accounts').select('*').eq('user_id', session.user.id),
        ]);
        if (profileRes.data) {
          _user = _flattenProfile(profileRes.data, accountsRes.data || []);
        }
      } catch (e) {
        console.error('[VaultStore] auth state error:', e);
      }
    }
  });

  /* ── Emit helper (fires local listeners only) ────────────── */
  const _listeners = {};
  function emit(event, data) {
    (_listeners[event] || []).forEach(cb => cb(data));
    (_listeners['*']   || []).forEach(cb => cb(event, data));
  }
  function on(event, cb) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(cb);
  }
  function off(event, cb) {
    if (_listeners[event]) _listeners[event] = _listeners[event].filter(f => f !== cb);
  }

  /* ═══════════════════════════════════════════════════════════
     SESSION
  ═══════════════════════════════════════════════════════════ */
  async function login(email, password) {
    let data, error;
    try {
      ({ data, error } = await sb.auth.signInWithPassword({ email, password }));
    } catch (e) {
      return { ok: false, error: 'Network error. Please check your connection and try again.' };
    }
    if (error) return { ok: false, error: error.message };
    if (!data?.user) return { ok: false, error: 'Please confirm your email address before signing in.' };

    const [profileRes, accountsRes] = await Promise.all([
      sb.from('profiles').select('*').eq('id', data.user.id).single(),
      sb.from('accounts').select('*').eq('user_id', data.user.id),
    ]);

    if (profileRes.error) return { ok: false, error: profileRes.error.message };

    const profile = profileRes.data;
    if (profile.status === 'suspended')
      return { ok: false, error: 'This account has been suspended. Contact support.' };
    // Locked accounts are allowed to log in and view their dashboard,
    // but all transfer/payment functions are disabled at the UI layer.

    _session = data.session;
    _user    = _flattenProfile(profile, accountsRes.data || []);

    await sb.from('profiles')
      .update({ last_login: new Date().toISOString() })
      .eq('id', data.user.id);

    return { ok: true, user: _user };
  }

  async function logout() {
    await sb.auth.signOut();
    _user    = null;
    _session = null;
    emit('logout', {});
  }

  function getSession() { return _session; }

  function getCurrentUser() { return _user; }

  function requireAuth(redirectTo = 'login.html') {
    if (!_user) {
      window.location.href = redirectTo;
      return null;
    }
    return _user;
  }

  function requireKYC(redirectTo = 'kyc.html') {
    if (!_user) { window.location.href = 'login.html'; return null; }
    if (_user.status === 'pending_kyc' || _user.kycStatus === 'not_started') {
      window.location.href = redirectTo;
      return null;
    }
    return _user;
  }

  // Admin = real Supabase auth user whose profiles.role === 'admin'.
  // The hardcoded-password / localStorage backdoor has been removed because
  // it granted UI access without granting the Edge Function any real JWT,
  // leaving admin pages broken anyway. Promote a real user with:
  //   UPDATE profiles SET role='admin' WHERE id='<auth.users.id>';
  function _hasAdminSession() {
    return !!(_user && _user.role === 'admin');
  }

  async function adminLogin(_passwordIgnored) {
    // Kept for backwards compatibility with admin.js DOMContentLoaded handler.
    // Real auth happens via the normal login() flow; role check below.
    return _hasAdminSession();
  }

  function getAdminSession() {
    return _hasAdminSession()
      ? { adminId: _user.id, loginAt: new Date().toISOString() }
      : null;
  }

  function requireAdmin(redirectTo = 'login.html') {
    if (_hasAdminSession()) return true;
    window.location.href = redirectTo;
    return false;
  }

  /* ═══════════════════════════════════════════════════════════
     USERS
  ═══════════════════════════════════════════════════════════ */
  async function _loadAllUsers() {
    if (!_hasAdminSession()) return [];
    const res = await _adminFn('list_users');
    if (!res.ok) {
      console.error('[VaultStore] _loadAllUsers error:', res.error);
      return [];
    }
    const accounts = res.accounts || [];
    _allUsers = (res.profiles || []).map(p => {
      const userAccounts = accounts.filter(a => a.user_id === p.id);
      return _flattenProfile(p, userAccounts);
    });
    return _allUsers;
  }

  function getUsers() { return _allUsers; }

  function getUser(id) {
    if (_user && _user.id === id) return _user;
    return _allUsers.find(u => u.id === id) || null;
  }

  function getUserByEmail(email) {
    if (_user && _user.email.toLowerCase() === email.toLowerCase()) return _user;
    return _allUsers.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  }

  async function createUser(data) {
    const opts = {
      data: {
        full_name:    data.name         || '',
        phone:        data.phone        || '',
        country:      data.country      || 'US',
        dob:          data.dob          || '',
        account_type: data.accountType  || 'personal',
      },
    };
    if (data.emailRedirectTo) opts.emailRedirectTo = data.emailRedirectTo;
    const { data: authData, error } = await sb.auth.signUp({
      email:    data.email,
      password: data.password,
      options:  opts,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, user: authData.user };
  }

  async function resendConfirmation(email) {
    const { error } = await sb.auth.resend({ email, type: 'signup' });
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  async function sendOtp(email, metadata, emailRedirectTo) {
    const options = { shouldCreateUser: true, data: metadata };
    if (emailRedirectTo) options.emailRedirectTo = emailRedirectTo;
    const { error } = await sb.auth.signInWithOtp({ email, options });
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  async function verifyOtpCode(email, token) {
    // type:'signup' matches the OTP sent by signUp(); try 'email' as fallback
    let { data, error } = await sb.auth.verifyOtp({ email, token, type: 'signup' });
    if (error) {
      ({ data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' }));
    }
    if (error) return { ok: false, error: error.message };

    // Explicitly hydrate _user so downstream pages don't race against the
    // onAuthStateChange handler. handle_new_auth_user trigger may also need a
    // tick to insert the profile row — retry up to 3 times.
    const uid = data?.user?.id;
    if (uid) {
      _session = data.session || _session;
      for (let i = 0; i < 3; i++) {
        const [profileRes, accountsRes] = await Promise.all([
          sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
          sb.from('accounts').select('*').eq('user_id', uid),
        ]);
        if (profileRes.data) {
          _user = _flattenProfile(profileRes.data, accountsRes.data || []);
          break;
        }
        await new Promise(r => setTimeout(r, 400));
      }
    }
    return { ok: true, user: data.user };
  }

  async function setPassword(password) {
    const { error } = await sb.auth.updateUser({ password });
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  async function updateUser(id, updates) {
    // Map old field names → new column names
    const mapped = {};
    if (updates.name         != null) mapped.full_name     = updates.name;
    if (updates.phone        != null) mapped.phone         = updates.phone;
    if (updates.country      != null) mapped.country       = updates.country;
    if (updates.dob          != null) mapped.dob           = updates.dob;
    if (updates.status       != null) mapped.status        = updates.status;
    if (updates.kycStatus    != null) mapped.kyc_status    = updates.kycStatus;
    if (updates.role         != null) mapped.role          = updates.role;
    if (updates.lastLogin    != null) mapped.last_login    = updates.lastLogin;
    if (updates.accountType  != null) mapped.account_type  = updates.accountType;

    if (Object.keys(mapped).length === 0) return _user;

    // Self-update (e.g. user editing own profile on dashboard settings):
    // go direct via RLS-gated UPDATE — the admin Edge Function rejects
    // non-admin callers, which would silently break the settings form.
    const isSelf = !!(_user && _user.id === id);
    if (isSelf) {
      // Strip privileged columns the user must not be able to set on themself.
      delete mapped.role;
      delete mapped.status;
      delete mapped.kyc_status;
      const { error } = await sb.from('profiles').update(mapped).eq('id', id);
      if (error) { console.error('[updateUser self]', error); return null; }
      const [profileRes, accountsRes] = await Promise.all([
        sb.from('profiles').select('*').eq('id', id).single(),
        sb.from('accounts').select('*').eq('user_id', id),
      ]);
      if (profileRes.data) {
        _user = _flattenProfile(profileRes.data, accountsRes.data || []);
        emit('user_updated', _user);
      }
      return _user;
    }

    // Admin editing someone else — route through the privileged Edge Function.
    const res = await _adminFn('update_profile', { userId: id, updates: mapped });
    if (!res.ok) { console.error('[updateUser]', res.error); return null; }
    return null;
  }

  async function deleteUser(id) {
    const res = await _adminFn('delete_user', { userId: id });
    if (!res.ok) { console.error('[deleteUser]', res.error); return; }
    _allUsers = _allUsers.filter(u => u.id !== id);
    emit('user_deleted', { id });
  }

  // Admin-only: change a user's email (updates both auth.users + profiles).
  // Cannot be done with a plain UPDATE on profiles — auth.users owns the
  // login email and must be updated via the Auth admin API server-side.
  async function adminChangeUserEmail(userId, email) {
    if (!userId || !email) return { ok: false, error: 'userId and email required' };
    const res = await _adminFn('change_email', { userId, email });
    if (!res.ok) return res;
    if (_user && _user.id === userId) _user.email = email;
    const cached = _allUsers.find(u => u.id === userId);
    if (cached) cached.email = email;
    emit('user_updated', { id: userId, email });
    return res;
  }

  /* ═══════════════════════════════════════════════════════════
     ACCOUNT STATUS  (admin)
  ═══════════════════════════════════════════════════════════ */
  async function _setStatus(userId, status) {
    const res = await _adminFn('set_status', { userId, status });
    await _refreshUser(userId);
    emit('account_updated', { userId });
    return res.ok ? res.result : null;
  }

  async function lockAccount(userId)     { return _setStatus(userId, 'locked');    }
  async function unlockAccount(userId)   { return _setStatus(userId, 'active');    }
  async function suspendAccount(userId)  { return _setStatus(userId, 'suspended'); }
  async function activateAccount(userId) { return _setStatus(userId, 'active');    }

  async function _refreshUser(userId) {
    const res = await _adminFn('get_user_full', { userId });
    if (!res.ok || !res.profile) return;
    const flat = _flattenProfile(res.profile, res.accounts || []);
    const idx  = _allUsers.findIndex(u => u.id === userId);
    if (idx > -1) _allUsers[idx] = flat;
    if (_user && _user.id === userId) _user = flat;
  }

  /* ═══════════════════════════════════════════════════════════
     BALANCE  (admin convenience wrappers)
  ═══════════════════════════════════════════════════════════ */
  async function updateBalance(userId, newBalance) {
    const current = getUser(userId);
    if (!current) return null;
    const delta = newBalance - current.balance;
    return adjustBalance(userId, delta);
  }

  async function adjustBalance(userId, delta, acctType = 'checking') {
    const res = await _adminFn('adjust_balance', { userId, delta, acctType });
    if (!res.ok) { console.error('[adjustBalance]', res.error); return null; }
    await _refreshUser(userId);
    const u = getUser(userId);
    emit('balance_updated', { userId, balance: u?.balance });
    return u;
  }

  /* ═══════════════════════════════════════════════════════════
     TRANSFERS
  ═══════════════════════════════════════════════════════════ */
  async function _loadTransfers(userId) {
    const { data } = await sb.from('transfers')
      .select('*')
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .order('created_at', { ascending: false });
    _xferCache[userId] = (data || []).map(_flattenTransfer);
    return _xferCache[userId];
  }

  async function _loadAllTransfers() {
    const res = await _adminFn('list_transfers');
    if (!res.ok) { console.error('[_loadAllTransfers]', res.error); return []; }
    return (res.transfers || []).map(_flattenTransfer);
  }

  function getTransfers() {
    if (_user) return _xferCache[_user.id] || [];
    return [];
  }

  function getUserTransfers(userId) {
    return (_xferCache[userId] || []).filter(
      t => t.fromUserId === userId || t.toUserId === userId
    );
  }

  function getPendingTransfers() {
    const all = Object.values(_xferCache).flat();
    return all.filter(t => t.status === 'pending');
  }

  async function createTransfer(data) {
    const payload = {
      from_user_id:      data.fromUserId,
      from_name:         data.fromName,
      to_user_id:        data.toUserId   || null,
      to_name:           data.toName,
      to_account_number: data.toAccountNumber || '',
      to_bank:           data.toBank     || 'Vaultstone Bank',
      amount:            parseFloat(data.amount),
      currency:          data.currency   || 'USD',
      note:              data.note       || '',
      type:              data.type       || 'internal',
      status:            'pending',
    };

    const { data: row, error } = await sb.from('transfers').insert(payload).select().single();
    if (error) { console.error('[createTransfer]', error); return null; }

    // Notify user
    await sb.from('notifications').insert({
      user_id: data.fromUserId,
      type:    'info',
      title:   'Transfer Submitted',
      message: `Your transfer of $${parseFloat(data.amount).toLocaleString()} to ${data.toName} is pending approval.`,
    });

    const flat = _flattenTransfer(row);
    if (!_xferCache[data.fromUserId]) _xferCache[data.fromUserId] = [];
    _xferCache[data.fromUserId].unshift(flat);
    emit('transfer_created', flat);
    return flat;
  }

  async function approveTransfer(transferId) {
    const { data, error } = await sb.rpc('approve_transfer', {
      p_transfer_id: transferId,
      p_admin_id:    _user.id,
    });
    if (error) { console.error('[approveTransfer]', error); return null; }

    // Refresh caches
    await _loadAllTransfers().then(ts => {
      ts.forEach(t => {
        if (!_xferCache[t.fromUserId]) _xferCache[t.fromUserId] = [];
        const idx = _xferCache[t.fromUserId].findIndex(x => x.id === t.id);
        if (idx > -1) _xferCache[t.fromUserId][idx] = t;
      });
    });
    emit('transfer_updated', { id: transferId, status: 'approved' });
    return data;
  }

  async function rejectTransfer(transferId, reason = 'Transfer rejected by compliance.') {
    const { data, error } = await sb.rpc('reject_transfer', {
      p_transfer_id: transferId,
      p_admin_id:    _user.id,
      p_reason:      reason,
    });
    if (error) { console.error('[rejectTransfer]', error); return null; }
    emit('transfer_updated', { id: transferId, status: 'rejected' });
    return data;
  }

  async function updateTransfer(id, updates) {
    const { data } = await sb.from('transfers').update(updates).eq('id', id).select().single();
    return data ? _flattenTransfer(data) : null;
  }

  /* ═══════════════════════════════════════════════════════════
     TRANSACTIONS
  ═══════════════════════════════════════════════════════════ */
  async function _loadTransactions(userId, limit = 200) {
    const { data } = await sb.from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(limit);
    _txCache[userId] = (data || []).map(_flattenTx);
    return _txCache[userId];
  }

  function getTransactions() {
    if (_user) return _txCache[_user.id] || [];
    return [];
  }

  function getUserTransactions(userId) {
    return (_txCache[userId] || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  // ── Admin-only transaction ops ─────────────────────────────
  async function adminListUserTransactions(userId, limit = 500) {
    const res = await _adminFn('list_user_transactions', { userId, limit });
    if (!res.ok) { console.error('[adminListUserTransactions]', res.error); return []; }
    return (res.transactions || []).map(_flattenTx);
  }

  // revertBalance defaults to true so a one-off delete restores the
  // user's checking balance by the inverse of the row's impact (deleting
  // a debit returns money, deleting a credit removes it). Pass false
  // when you're about to regenerate fresh history anyway so the balance
  // is not adjusted twice.
  async function deleteTransactions(txIds, { revertBalance = true } = {}) {
    if (!Array.isArray(txIds) || txIds.length === 0) {
      return { ok: false, error: 'tx_ids required' };
    }
    const res = await _adminFn('delete_transactions', { tx_ids: txIds, revertBalance });
    if (!res.ok) { console.error('[deleteTransactions]', res.error); return res; }
    // Drop the deleted ids from every cached user list.
    const dead = new Set(txIds.map(String));
    for (const uid of Object.keys(_txCache)) {
      _txCache[uid] = _txCache[uid].filter(t => !dead.has(String(t.id)));
    }
    // Refresh balances on every affected user so the admin UI shows
    // the reverted numbers immediately.
    if (revertBalance && Array.isArray(res.adjustments)) {
      const touched = [...new Set(res.adjustments.map(a => a.userId))];
      await Promise.all(touched.map(uid => _refreshUser(uid)));
    }
    emit('transactions_deleted', { ids: txIds });
    return res;
  }

  async function addTransaction(data) {
    const payload = {
      user_id:      data.userId,
      type:         data.type,
      amount:       parseFloat(data.amount),
      balance_after: data.balance || null,
      description:  data.description || '',
      category:     data.category    || 'Other',
      merchant:     data.merchant    || '',
      status:       data.status      || 'completed',
      transfer_id:  data.transferId  || null,
      date:         data.date        || new Date().toISOString(),
    };
    const res = await _adminFn('insert_transactions', { rows: [payload] });
    if (!res.ok || !res.inserted?.[0]) { console.error('[addTransaction]', res.error); return null; }
    const flat = _flattenTx(res.inserted[0]);
    if (!_txCache[data.userId]) _txCache[data.userId] = [];
    _txCache[data.userId].unshift(flat);
    emit('transaction_added', flat);
    return flat;
  }

  async function generateTransactions(userId, { targetBalance, count = 25, daysBack = 90, startDate = null, endDate = null } = {}) {
    const MERCHANTS = [
      // Groceries
      { name: 'Whole Foods Market', cat: 'Groceries'     },
      { name: 'Kroger',             cat: 'Groceries'     },
      { name: 'Safeway',            cat: 'Groceries'     },
      { name: 'Trader Joe\'s',      cat: 'Groceries'     },
      { name: 'Publix',             cat: 'Groceries'     },
      { name: 'Walmart',            cat: 'Groceries'     },
      { name: 'Costco',             cat: 'Groceries'     },
      { name: 'Sam\'s Club',        cat: 'Groceries'     },
      // Retail
      { name: 'Target',             cat: 'Retail'        },
      { name: 'Amazon',             cat: 'Shopping'      },
      { name: 'Best Buy',           cat: 'Tech'          },
      { name: 'Home Depot',         cat: 'Home'          },
      { name: 'Lowe\'s',            cat: 'Home'          },
      { name: 'Macy\'s',            cat: 'Shopping'      },
      { name: 'TJ Maxx',            cat: 'Shopping'      },
      { name: 'Nordstrom',          cat: 'Shopping'      },
      { name: 'IKEA',               cat: 'Home'          },
      // Food & Drink
      { name: 'Starbucks',          cat: 'Food & Drink'  },
      { name: 'McDonald\'s',        cat: 'Food & Drink'  },
      { name: 'Chick-fil-A',        cat: 'Food & Drink'  },
      { name: 'Chipotle',           cat: 'Food & Drink'  },
      { name: 'Domino\'s Pizza',    cat: 'Food & Drink'  },
      { name: 'Panera Bread',       cat: 'Food & Drink'  },
      { name: 'Dunkin\'',           cat: 'Food & Drink'  },
      { name: 'Subway',             cat: 'Food & Drink'  },
      { name: 'DoorDash',           cat: 'Food & Drink'  },
      { name: 'Uber Eats',          cat: 'Food & Drink'  },
      { name: 'Grubhub',            cat: 'Food & Drink'  },
      // Fuel & Transport
      { name: 'Shell',              cat: 'Fuel'          },
      { name: 'Chevron',            cat: 'Fuel'          },
      { name: 'ExxonMobil',         cat: 'Fuel'          },
      { name: 'BP',                 cat: 'Fuel'          },
      { name: 'Uber',               cat: 'Transport'     },
      { name: 'Lyft',               cat: 'Transport'     },
      // Entertainment & Subscriptions
      { name: 'Netflix',            cat: 'Entertainment' },
      { name: 'Hulu',               cat: 'Entertainment' },
      { name: 'Disney+',            cat: 'Entertainment' },
      { name: 'Spotify',            cat: 'Entertainment' },
      { name: 'Apple',              cat: 'Tech'          },
      { name: 'YouTube Premium',    cat: 'Entertainment' },
      { name: 'Xbox Game Pass',     cat: 'Entertainment' },
      // Utilities & Telecom
      { name: 'AT&T',               cat: 'Utilities'     },
      { name: 'Verizon',            cat: 'Utilities'     },
      { name: 'T-Mobile',           cat: 'Utilities'     },
      { name: 'Comcast/Xfinity',    cat: 'Utilities'     },
      { name: 'Con Edison',         cat: 'Utilities'     },
      { name: 'National Grid',      cat: 'Utilities'     },
      // Health & Pharmacy
      { name: 'CVS Pharmacy',       cat: 'Health'        },
      { name: 'Walgreens',          cat: 'Health'        },
      { name: 'Rite Aid',           cat: 'Health'        },
      { name: 'Planet Fitness',     cat: 'Health'        },
      { name: 'Equinox',            cat: 'Health'        },
      // Travel
      { name: 'Delta Airlines',     cat: 'Travel'        },
      { name: 'American Airlines',  cat: 'Travel'        },
      { name: 'United Airlines',    cat: 'Travel'        },
      { name: 'Airbnb',             cat: 'Travel'        },
      { name: 'Marriott Hotels',    cat: 'Travel'        },
      { name: 'Hilton Hotels',      cat: 'Travel'        },
      { name: 'Enterprise Rent-A-Car', cat: 'Travel'     },
    ];
    const INCOMES = [
      'Payroll Direct Deposit',
      'ACH Credit Transfer',
      'Wire Transfer Received',
      'Client Payment',
      'Invoice Payment',
      'Freelance Income',
      'Dividend Credit',
      'Refund Credit',
    ];

    const msPerDay = 86_400_000;
    // Date window — explicit start/end takes priority over relative daysBack.
    const endMs   = endDate   ? new Date(endDate).getTime()   : Date.now();
    const startMs = startDate ? new Date(startDate).getTime() : (endMs - daysBack * msPerDay);
    const rangeMs = Math.max(endMs - startMs, msPerDay);

    // Sorted dates oldest → newest
    const dates = Array.from({ length: count }, () =>
      new Date(startMs + Math.floor(Math.random() * rangeMs))
    ).sort((a, b) => a - b);

    // Real bank statements don't start from $0 — they carry forward the
    // balance from a prior period. Mirror that here: row 0 is a single
    // "Balance Carried Forward" credit that primes the running balance
    // to ~85% of target (random within 80–92%), so subsequent rows look
    // like normal in-period activity ending at targetBalance instead of
    // a slow ramp from zero followed by a giant correction credit.
    const rows = [];

    function _pickIncome() {
      const m = INCOMES[Math.floor(Math.random() * INCOMES.length)];
      return { merchant: m, category: 'Transfer' };
    }
    function _pickMerchant() {
      const m = MERCHANTS[Math.floor(Math.random() * MERCHANTS.length)];
      return { merchant: m.name, category: m.cat };
    }

    const startBal = parseFloat((targetBalance * (0.80 + Math.random() * 0.12)).toFixed(2));
    rows.push({
      type:        'credit',
      amount:      startBal,
      merchant:    'Balance Carried Forward',
      category:    'Transfer',
      description: 'Balance Carried Forward',
      date:        dates[0],
      balAfter:    startBal,
    });
    let running = startBal;

    // Allocate types for the remaining rows: ~55% credits, ~45% debits.
    // No early-credit bias is needed now since the primer above already
    // put us most of the way to target.
    const remaining = count - 1;
    const types = [];
    for (let i = 0; i < remaining; i++) {
      types.push(Math.random() < 0.55 ? 'credit' : 'debit');
    }

    // Realistic debit window — clamped so small accounts still produce
    // visible rows and huge accounts still get retail-sized debits.
    const debitFloor = Math.max(20, targetBalance * 0.00005);
    const debitCeil  = Math.max(debitFloor * 4, Math.min(targetBalance * 0.0003, 800));

    for (let i = 0; i < remaining; i++) {
      let type    = types[i];
      let amount  = 0;
      let merchant, category;

      if (type === 'debit') {
        amount = debitFloor + Math.random() * (debitCeil - debitFloor);
        if (running - amount < 0) amount = Math.max(0, running - 0.01);
        if (amount < 1) { type = 'credit'; amount = debitFloor; }
      }

      if (type === 'credit') {
        const creditsLeft = types.slice(i).filter(t => t === 'credit').length || 1;
        const gap         = targetBalance - running;
        const avgNeeded   = gap / creditsLeft;
        const jitter      = Math.abs(avgNeeded) * 0.45 * (Math.random() - 0.5) * 2;
        amount            = Math.max(50, avgNeeded + jitter);
        // If gap is already very small, fall back to a tier-scaled amount
        // so the row still feels like an in-period transaction.
        if (avgNeeded < debitCeil) {
          amount = debitCeil * (0.5 + Math.random() * 2.5); // small-medium credit
        }
      }

      amount = parseFloat(amount.toFixed(2));
      if (type === 'credit') ({ merchant, category } = _pickIncome());
      else                   ({ merchant, category } = _pickMerchant());

      running = parseFloat((running + (type === 'credit' ? amount : -amount)).toFixed(2));
      rows.push({ type, amount, merchant, category, description: merchant, date: dates[i + 1], balAfter: Math.max(0, running) });
    }

    // Tiny final correction on the last row so we land exactly on target.
    const drift = parseFloat((targetBalance - running).toFixed(2));
    if (rows.length && Math.abs(drift) >= 0.01) {
      const last = rows[rows.length - 1];
      const newAmount = last.type === 'credit' ? last.amount + drift : last.amount - drift;
      if (newAmount >= 0) {
        last.amount = parseFloat(newAmount.toFixed(2));
      } else {
        last.type   = last.type === 'credit' ? 'debit' : 'credit';
        last.amount = parseFloat(Math.abs(newAmount).toFixed(2));
        const picked = last.type === 'credit' ? _pickIncome() : _pickMerchant();
        last.merchant    = picked.merchant;
        last.category    = picked.category;
        last.description = picked.merchant;
      }
      last.balAfter = targetBalance;
      running       = targetBalance;
    }

    const payloads = rows.map(r => ({
      user_id:      userId,
      type:         r.type,
      amount:       parseFloat(r.amount.toFixed(2)),
      balance_after: r.balAfter,
      description:  r.description,
      category:     r.category,
      merchant:     r.merchant,
      status:       'completed',
      date:         r.date.toISOString(),
    }));

    // Batch inserts via Edge Function (function caps at 500/call; chunk to stay below)
    const CHUNK    = 50;
    const inserted = [];
    for (let i = 0; i < payloads.length; i += CHUNK) {
      const res = await _adminFn('insert_transactions', { rows: payloads.slice(i, i + CHUNK) });
      if (!res.ok) { console.error('[generateTransactions]', res.error); return { ok: false, error: res.error }; }
      inserted.push(...(res.inserted || []));
    }

    const flat = inserted.map(_flattenTx);
    if (!_txCache[userId]) _txCache[userId] = [];
    _txCache[userId] = [...flat, ..._txCache[userId]].sort((a, b) => new Date(b.date) - new Date(a.date));
    return { ok: true, count: flat.length };
  }

  async function fundAccount(userId, delta, acctType = 'checking', { generateHistory = false, txCount = 25, daysBack = 90, startDate = null, endDate = null } = {}) {
    const updatedUser = await adjustBalance(userId, delta, acctType);
    if (!updatedUser) return { ok: false, error: 'Balance update failed.' };

    const newBalance =
      acctType === 'savings'    ? updatedUser.savingsBalance :
      acctType === 'investment' ? updatedUser.investmentBalance :
                                  updatedUser.balance;

    if (generateHistory) {
      return generateTransactions(userId, { targetBalance: newBalance, count: txCount, daysBack, startDate, endDate });
    }

    await addTransaction({
      userId,
      type:        'credit',
      amount:      delta,
      balance:     newBalance,
      description: 'Admin Deposit',
      category:    'Transfer',
      merchant:    'Vaultstone Bank',
      status:      'completed',
    });
    return { ok: true, user: updatedUser };
  }

  /* ═══════════════════════════════════════════════════════════
     NOTIFICATIONS
  ═══════════════════════════════════════════════════════════ */
  async function _loadNotifications(userId) {
    const { data } = await sb.from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    _notifCache[userId] = (data || []).map(_flattenNotif);
    return _notifCache[userId];
  }

  function getNotifications(userId) {
    return _notifCache[userId] || [];
  }

  function getUnreadCount(userId) {
    return (getNotifications(userId)).filter(n => !n.read).length;
  }

  async function addNotification(userId, data) {
    const payload = {
      user_id: userId,
      type:    data.type    || 'info',
      title:   data.title,
      message: data.message || '',
    };
    const { data: row } = await sb.from('notifications').insert(payload).select().single();
    if (row) {
      const flat = _flattenNotif(row);
      if (!_notifCache[userId]) _notifCache[userId] = [];
      _notifCache[userId].unshift(flat);
      emit('notification', flat);
      return flat;
    }
    return null;
  }

  async function markNotificationRead(id) {
    await sb.from('notifications').update({ read: true }).eq('id', id);
    Object.values(_notifCache).forEach(arr => {
      const n = arr.find(x => x.id === id);
      if (n) n.read = true;
    });
  }

  async function markAllRead(userId) {
    await sb.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    if (_notifCache[userId]) _notifCache[userId].forEach(n => { n.read = true; });
  }

  /* ═══════════════════════════════════════════════════════════
     KYC
  ═══════════════════════════════════════════════════════════ */
  async function submitKYC(userId, kycData) {
    const submission = {
      user_id:             userId,
      document_type:       kycData.documentType,
      document_number:     kycData.documentNumber || '',
      expiry_date:         kycData.expiryDate || null,
      front_document_url:  kycData.frontDocumentUrl || null,
      back_document_url:   kycData.backDocumentUrl  || null,
      selfie_url:          kycData.selfieUrl || null,
      status:              'pending',
    };

    const { error } = await sb.from('kyc_submissions').insert(submission);
    if (error) { console.error('[submitKYC]', error); return null; }

    await sb.from('profiles').update({ kyc_status: 'under_review', status: 'pending' }).eq('id', userId);
    await sb.from('notifications').insert({
      user_id: userId, type: 'info', title: 'KYC Submitted',
      message: 'Your identity documents are under review. This typically takes 1–2 business days.',
    });

    if (_user && _user.id === userId) {
      _user.kycStatus = 'under_review';
      _user.status    = 'pending';
    }
    emit('kyc_submitted', { userId });
    return _user;
  }

  async function approveKYC(userId, submissionId = null) {
    const res = await _adminFn('review_kyc', { userId, decision: 'approve', submissionId });
    if (!res.ok) { console.error('[approveKYC]', res.error); return null; }
    await _refreshUser(userId);
    emit('kyc_approved', { userId });
    return res.result;
  }

  async function rejectKYC(userId, reason = 'Documents could not be verified.', submissionId = null) {
    const res = await _adminFn('review_kyc', { userId, decision: 'reject', submissionId, reason });
    if (!res.ok) { console.error('[rejectKYC]', res.error); return null; }
    await _refreshUser(userId);
    emit('kyc_rejected', { userId, reason });
    return res.result;
  }

  /* ═══════════════════════════════════════════════════════════
     KYC FILE UPLOAD (Supabase Storage)
  ═══════════════════════════════════════════════════════════ */
  async function uploadKYCFile(userId, file, label) {
    const ext  = file.name.split('.').pop();
    const path = `${userId}/${label}_${Date.now()}.${ext}`;
    const { data, error } = await sb.storage
      .from('kyc-documents')
      .upload(path, file, { upsert: true });
    if (error) { console.error('[uploadKYCFile]', error); return null; }
    return data.path;
  }

  /* ═══════════════════════════════════════════════════════════
     REAL-TIME SUBSCRIPTIONS
  ═══════════════════════════════════════════════════════════ */
  function subscribeToNotifications(userId, onNew) {
    return sb.channel(`notif:${userId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${userId}`,
      }, payload => {
        const flat = _flattenNotif(payload.new);
        if (!_notifCache[userId]) _notifCache[userId] = [];
        _notifCache[userId].unshift(flat);
        onNew(flat);
      })
      .subscribe();
  }

  function subscribeToTransfers(userId, onChange) {
    const handler = payload => {
      const flat = _flattenTransfer(payload.new || payload.old);
      onChange(payload.eventType, flat);
    };
    return sb.channel(`xfer:${userId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'transfers',
        filter: `from_user_id=eq.${userId}`,
      }, handler)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'transfers',
        filter: `to_user_id=eq.${userId}`,
      }, handler)
      .subscribe();
  }

  /* ═══════════════════════════════════════════════════════════
     DATA LOADERS  (call once per page to warm caches)
  ═══════════════════════════════════════════════════════════ */
  async function loadDashboardData(userId) {
    await Promise.all([
      _loadTransactions(userId),
      _loadNotifications(userId),
      _loadTransfers(userId),
    ]);
  }

  async function loadAdminData() {
    const [users, transfers, txs] = await Promise.all([
      _loadAllUsers(),
      _loadAllTransfers(),
      _adminFn('list_transactions').then(r => (r.ok ? (r.transactions || []).map(_flattenTx) : [])),
    ]);
    // Cache all user transactions globally
    txs.forEach(tx => {
      if (!_txCache[tx.userId]) _txCache[tx.userId] = [];
      const exists = _txCache[tx.userId].find(x => x.id === tx.id);
      if (!exists) _txCache[tx.userId].push(tx);
    });
    // Cache all pending transfers
    transfers.forEach(t => {
      if (!_xferCache[t.fromUserId]) _xferCache[t.fromUserId] = [];
      const exists = _xferCache[t.fromUserId].find(x => x.id === t.id);
      if (!exists) _xferCache[t.fromUserId].push(t);
    });
    return { users, transfers, transactions: txs };
  }

  async function getAllTransfers() {
    return _loadAllTransfers();
  }

  /* ─── Public API ─────────────────────────────────────────── */
  return {
    ready,
    // Auth
    login, logout, getSession, getCurrentUser, requireAuth, requireKYC,
    adminLogin, getAdminSession, requireAdmin,
    // Users
    getUsers, getUser, getUserByEmail, createUser, updateUser, deleteUser,
    adminChangeUserEmail,
    sendOtp, verifyOtpCode, resendConfirmation, setPassword,
    // Account status (admin)
    lockAccount, unlockAccount, suspendAccount, activateAccount,
    // Balance (admin)
    updateBalance, adjustBalance, fundAccount, generateTransactions,
    // Transfers
    getTransfers, getUserTransfers, getPendingTransfers,
    createTransfer, updateTransfer, approveTransfer, rejectTransfer,
    getAllTransfers,
    // Transactions
    getTransactions, getUserTransactions, addTransaction,
    adminListUserTransactions, deleteTransactions,
    // Notifications
    getNotifications, getUnreadCount, addNotification,
    markNotificationRead, markAllRead,
    // KYC
    submitKYC, approveKYC, rejectKYC, uploadKYCFile,
    // Real-time
    subscribeToNotifications, subscribeToTransfers,
    // Data loaders
    loadDashboardData, loadAdminData,
    refreshCurrentUser: (userId) => _refreshUser(userId || (_user && _user.id)),
    // Events
    on, off, emit,
  };

})();

window.VaultStore = VaultStore;
