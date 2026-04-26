'use strict';

// ─── Vaultstone Bank — Supabase VaultStore ───────────────────
// Drop-in async replacement for store.js.
// Exposes the same VaultStore API; all mutations are persisted
// to Supabase while keeping an in-memory cache for sync access.
// ─────────────────────────────────────────────────────────────

const VaultStore = (() => {

  const sb = window._sb;
  // Admin client: uses service-role key (bypasses RLS). Falls back to anon if not configured.
  const _adm = () => window._sbAdmin || sb;

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
  const ready = (async () => {
    try {
      const { data: { session } } = await sb.auth.getSession();
      _session = session;
      if (!session) return;

      const [profileRes, accountsRes] = await Promise.all([
        sb.from('profiles').select('*').eq('id', session.user.id).single(),
        sb.from('accounts').select('*').eq('user_id', session.user.id),
      ]);

      if (profileRes.data) {
        _user = _flattenProfile(profileRes.data, accountsRes.data || []);
      }

      // Update last_login
      sb.from('profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('id', session.user.id)
        .then(() => {});

    } catch (e) {
      console.error('[VaultStore] init error:', e);
    }
  })();

  // Keep cache in sync when auth state changes
  sb.auth.onAuthStateChange(async (event, session) => {
    _session = session;
    if (event === 'SIGNED_OUT') {
      _user = null;
      return;
    }
    if (session && (!_user || _user.id !== session.user.id)) {
      const [profileRes, accountsRes] = await Promise.all([
        sb.from('profiles').select('*').eq('id', session.user.id).single(),
        sb.from('accounts').select('*').eq('user_id', session.user.id),
      ]);
      if (profileRes.data) {
        _user = _flattenProfile(profileRes.data, accountsRes.data || []);
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
    if (profile.status === 'locked')
      return { ok: false, error: 'This account is locked. Please verify your identity.' };

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

  function _hasAdminSession() {
    if (_user && _user.role === 'admin') return true;
    try { return !!(JSON.parse(localStorage.getItem('vs_admin_session') || 'null')?.adminId); } catch { return false; }
  }

  async function adminLogin(password) {
    if (password === 'Vaultstone@Admin2024') {
      localStorage.setItem('vs_admin_session', JSON.stringify({ adminId: 'admin_root', loginAt: new Date().toISOString() }));
      return true;
    }
    if (!_user) return false;
    return _user.role === 'admin';
  }

  function getAdminSession() {
    if (_user && _user.role === 'admin') return { adminId: _user.id, loginAt: new Date().toISOString() };
    try { return JSON.parse(localStorage.getItem('vs_admin_session') || 'null'); } catch { return null; }
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
    const { data, error } = await _adm().from('profiles').select('*, accounts(*)').order('created_at', { ascending: false });
    if (error) {
      console.error('[VaultStore] _loadAllUsers error:', error.message, '— Add SUPABASE_SERVICE_KEY to supabase-client.js.');
      return [];
    }
    _allUsers = (data || []).map(p => _flattenProfile(p, p.accounts || []));
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

    const { data, error } = await _adm().from('profiles').update(mapped).eq('id', id).select('*').single();
    if (error) { console.error('[updateUser]', error); return null; }

    if (_user && _user.id === id) {
      const [accountsRes] = await Promise.all([
        _adm().from('accounts').select('*').eq('user_id', id),
      ]);
      _user = _flattenProfile(data, accountsRes.data || []);
      emit('user_updated', _user);
    }
    return _user;
  }

  async function deleteUser(id) {
    await _adm().from('profiles').delete().eq('id', id);
    _allUsers = _allUsers.filter(u => u.id !== id);
    emit('user_deleted', { id });
  }

  /* ═══════════════════════════════════════════════════════════
     ACCOUNT STATUS  (admin)
  ═══════════════════════════════════════════════════════════ */
  async function lockAccount(userId) {
    const res = await _adm().rpc('admin_set_status', {
      p_user_id: userId, p_status: 'locked', p_admin_id: _user?.id,
    });
    await _refreshUser(userId);
    emit('account_updated', { userId });
    return res.data;
  }

  async function unlockAccount(userId) {
    const res = await _adm().rpc('admin_set_status', {
      p_user_id: userId, p_status: 'active', p_admin_id: _user?.id,
    });
    await _refreshUser(userId);
    emit('account_updated', { userId });
    return res.data;
  }

  async function suspendAccount(userId) {
    const res = await _adm().rpc('admin_set_status', {
      p_user_id: userId, p_status: 'suspended', p_admin_id: _user?.id,
    });
    await _refreshUser(userId);
    emit('account_updated', { userId });
    return res.data;
  }

  async function activateAccount(userId) {
    const res = await _adm().rpc('admin_set_status', {
      p_user_id: userId, p_status: 'active', p_admin_id: _user?.id,
    });
    await _refreshUser(userId);
    emit('account_updated', { userId });
    return res.data;
  }

  async function _refreshUser(userId) {
    const { data } = await _adm().from('profiles')
      .select('*, accounts(*)')
      .eq('id', userId)
      .single();
    if (!data) return;
    const flat = _flattenProfile(data, data.accounts || []);
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
    const { data } = await _adm().rpc('admin_adjust_balance', {
      p_user_id:   userId,
      p_delta:     delta,
      p_admin_id:  _user?.id,
      p_acct_type: acctType,
    });
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
    const { data } = await _adm().from('transfers')
      .select('*')
      .order('created_at', { ascending: false });
    return (data || []).map(_flattenTransfer);
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
  async function _loadTransactions(userId, limit = 50) {
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
    const { data: row, error } = await _adm().from('transactions').insert(payload).select().single();
    if (error) { console.error('[addTransaction]', error); return null; }
    const flat = _flattenTx(row);
    if (!_txCache[data.userId]) _txCache[data.userId] = [];
    _txCache[data.userId].unshift(flat);
    emit('transaction_added', flat);
    return flat;
  }

  async function generateTransactions(userId, { targetBalance, count = 25, daysBack = 90 } = {}) {
    const MERCHANTS = [
      { name: 'Amazon',         cat: 'Shopping'      },
      { name: 'Netflix',        cat: 'Entertainment' },
      { name: 'Uber',           cat: 'Transport'     },
      { name: 'Whole Foods',    cat: 'Groceries'     },
      { name: 'Shell',          cat: 'Fuel'          },
      { name: 'Starbucks',      cat: 'Food & Drink'  },
      { name: 'Apple',          cat: 'Tech'          },
      { name: 'Spotify',        cat: 'Music'         },
      { name: 'Delta Airlines', cat: 'Travel'        },
      { name: 'Target',         cat: 'Retail'        },
      { name: 'Walmart',        cat: 'Groceries'     },
      { name: 'Zara',           cat: 'Shopping'      },
      { name: 'IKEA',           cat: 'Shopping'      },
      { name: 'DoorDash',       cat: 'Food & Drink'  },
      { name: 'Airbnb',         cat: 'Travel'        },
      { name: 'Best Buy',       cat: 'Tech'          },
      { name: 'Costco',         cat: 'Groceries'     },
      { name: 'Lyft',           cat: 'Transport'     },
      { name: 'Hulu',           cat: 'Entertainment' },
      { name: 'AT&T',           cat: 'Utilities'     },
    ];
    const INCOMES = ['Salary Deposit', 'ACH Transfer', 'Wire Transfer', 'Client Payment', 'Invoice Payment'];

    const now      = Date.now();
    const msPerDay = 86_400_000;

    // Sorted dates oldest → newest
    const dates = Array.from({ length: count }, () =>
      new Date(now - (Math.floor(Math.random() * daysBack) + 1) * msPerDay)
    ).sort((a, b) => a - b);

    const rows   = [];
    let running  = 0;

    for (let i = 0; i < count - 1; i++) {
      const progress  = i / Math.max(count - 2, 1);
      // Bias toward credits early to build up balance, then more debits
      const isCredit  = Math.random() < 0.42 - progress * 0.12;

      let type, amount, merchant, category, description;

      if (isCredit) {
        amount      = parseFloat((Math.random() * 3000 + 500).toFixed(2));
        merchant    = INCOMES[Math.floor(Math.random() * INCOMES.length)];
        category    = 'Transfer';
        description = merchant;
        type        = 'credit';
      } else {
        const m     = MERCHANTS[Math.floor(Math.random() * MERCHANTS.length)];
        const cap   = Math.max(20, running + 200);   // keep balance from going deeply negative
        amount      = parseFloat(Math.min(Math.random() * 400 + 5, cap).toFixed(2));
        merchant    = m.name;
        category    = m.cat;
        description = m.name;
        type        = 'debit';
      }

      running = parseFloat((running + (type === 'credit' ? amount : -amount)).toFixed(2));
      rows.push({ type, amount, merchant, category, description, date: dates[i], balAfter: Math.max(0, running) });
    }

    // Final transaction to land exactly on targetBalance
    const diff = parseFloat((targetBalance - running).toFixed(2));
    if (Math.abs(diff) >= 0.01) {
      rows.push({
        type:        diff > 0 ? 'credit' : 'debit',
        amount:      Math.abs(diff),
        merchant:    diff > 0 ? 'Account Funding' : 'Account Adjustment',
        category:    'Transfer',
        description: diff > 0 ? 'Funding Credit'  : 'Balance Adjustment',
        date:        dates[count - 1],
        balAfter:    targetBalance,
      });
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

    // Batch inserts in chunks of 50 to stay within Supabase limits
    const CHUNK    = 50;
    const inserted = [];
    for (let i = 0; i < payloads.length; i += CHUNK) {
      const { data, error } = await _adm().from('transactions').insert(payloads.slice(i, i + CHUNK)).select();
      if (error) { console.error('[generateTransactions]', error); return { ok: false, error: error.message }; }
      inserted.push(...(data || []));
    }

    const flat = inserted.map(_flattenTx);
    if (!_txCache[userId]) _txCache[userId] = [];
    _txCache[userId] = [...flat, ..._txCache[userId]].sort((a, b) => new Date(b.date) - new Date(a.date));
    return { ok: true, count: flat.length };
  }

  async function fundAccount(userId, delta, acctType = 'checking', { generateHistory = false, txCount = 25, daysBack = 90 } = {}) {
    const updatedUser = await adjustBalance(userId, delta, acctType);
    if (!updatedUser) return { ok: false, error: 'Balance update failed.' };

    const newBalance =
      acctType === 'savings'    ? updatedUser.savingsBalance :
      acctType === 'investment' ? updatedUser.investmentBalance :
                                  updatedUser.balance;

    if (generateHistory) {
      return generateTransactions(userId, { targetBalance: newBalance, count: txCount, daysBack });
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
    const { data } = await sb.rpc('admin_review_kyc', {
      p_user_id:       userId,
      p_action:        'approve',
      p_admin_id:      _user.id,
      p_submission_id: submissionId,
    });
    await _refreshUser(userId);
    emit('kyc_approved', { userId });
    return data;
  }

  async function rejectKYC(userId, reason = 'Documents could not be verified.', submissionId = null) {
    const { data } = await sb.rpc('admin_review_kyc', {
      p_user_id:       userId,
      p_action:        'reject',
      p_admin_id:      _user.id,
      p_submission_id: submissionId,
      p_reason:        reason,
    });
    await _refreshUser(userId);
    emit('kyc_rejected', { userId, reason });
    return data;
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
    return sb.channel(`xfer:${userId}`)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'transfers',
        filter: `from_user_id=eq.${userId}`,
      }, payload => {
        const flat = _flattenTransfer(payload.new || payload.old);
        onChange(payload.eventType, flat);
      })
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
      _adm().from('transactions').select('*').order('date', { ascending: false }).limit(200)
        .then(({ data }) => (data || []).map(_flattenTx)),
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
    // Notifications
    getNotifications, getUnreadCount, addNotification,
    markNotificationRead, markAllRead,
    // KYC
    submitKYC, approveKYC, rejectKYC, uploadKYCFile,
    // Real-time
    subscribeToNotifications, subscribeToTransfers,
    // Data loaders
    loadDashboardData, loadAdminData,
    // Events
    on, off, emit,
  };

})();

window.VaultStore = VaultStore;
