'use strict';

// ─── Vaultstone Bank — Supabase VaultStore ───────────────────
// Drop-in async replacement for store.js.
// Exposes the same VaultStore API; all mutations are persisted
// to Supabase while keeping an in-memory cache for sync access.
// ─────────────────────────────────────────────────────────────

const VaultStore = (() => {

  const sb = window._sb;

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
    return {
      id:                profile.id,
      name:              profile.full_name,
      email:             profile.email,
      phone:             profile.phone || '',
      accountType:       profile.account_type,
      accountNumber:     profile.account_number || '',
      balance:           parseFloat(checking.balance   || 0),
      savingsBalance:    parseFloat(savings.balance    || 0),
      investmentBalance: parseFloat(investment.balance || 0),
      status:            profile.status,
      kycStatus:         profile.kyc_status,
      role:              profile.role,
      avatar:            profile.avatar || profile.full_name.slice(0, 2).toUpperCase(),
      country:           profile.country || 'US',
      dob:               profile.dob || '',
      createdAt:         profile.created_at,
      lastLogin:         profile.last_login,
      cardNumber:        (profile.account_number || '').slice(-4),
      // raw profile for updates
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
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };

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
    if (!_user && !_session) {
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

  // Admin login: verify the signed-in user has role=admin
  async function adminLogin(password) {
    // password param kept for API compat — role is checked server-side
    if (!_user) return false;
    return _user.role === 'admin';
  }

  function getAdminSession() {
    if (_user && _user.role === 'admin') return { adminId: _user.id, loginAt: new Date().toISOString() };
    return null;
  }

  function requireAdmin(redirectTo = 'login.html') {
    if (!_user || _user.role !== 'admin') {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  }

  /* ═══════════════════════════════════════════════════════════
     USERS
  ═══════════════════════════════════════════════════════════ */
  async function _loadAllUsers() {
    if (!_user || _user.role !== 'admin') return [];
    const { data } = await sb.from('profiles').select('*, accounts(*)').order('created_at', { ascending: false });
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
    const { data: authData, error } = await sb.auth.signUp({
      email:    data.email,
      password: data.password,
      options:  {
        data: {
          full_name:    data.name,
          phone:        data.phone    || '',
          country:      data.country  || 'US',
          dob:          data.dob      || '',
          account_type: data.accountType || 'personal',
        },
      },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, user: authData.user };
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

    const { data, error } = await sb.from('profiles').update(mapped).eq('id', id).select('*').single();
    if (error) { console.error('[updateUser]', error); return null; }

    if (_user && _user.id === id) {
      const [accountsRes] = await Promise.all([
        sb.from('accounts').select('*').eq('user_id', id),
      ]);
      _user = _flattenProfile(data, accountsRes.data || []);
      emit('user_updated', _user);
    }
    return _user;
  }

  async function deleteUser(id) {
    await sb.from('profiles').delete().eq('id', id);
    _allUsers = _allUsers.filter(u => u.id !== id);
    emit('user_deleted', { id });
  }

  /* ═══════════════════════════════════════════════════════════
     ACCOUNT STATUS  (admin)
  ═══════════════════════════════════════════════════════════ */
  async function lockAccount(userId) {
    const res = await sb.rpc('admin_set_status', {
      p_user_id: userId, p_status: 'locked', p_admin_id: _user.id,
    });
    await _refreshUser(userId);
    emit('account_updated', { userId });
    return res.data;
  }

  async function unlockAccount(userId) {
    const res = await sb.rpc('admin_set_status', {
      p_user_id: userId, p_status: 'active', p_admin_id: _user.id,
    });
    await _refreshUser(userId);
    emit('account_updated', { userId });
    return res.data;
  }

  async function suspendAccount(userId) {
    const res = await sb.rpc('admin_set_status', {
      p_user_id: userId, p_status: 'suspended', p_admin_id: _user.id,
    });
    await _refreshUser(userId);
    emit('account_updated', { userId });
    return res.data;
  }

  async function activateAccount(userId) {
    const res = await sb.rpc('admin_set_status', {
      p_user_id: userId, p_status: 'active', p_admin_id: _user.id,
    });
    await _refreshUser(userId);
    emit('account_updated', { userId });
    return res.data;
  }

  async function _refreshUser(userId) {
    const { data } = await sb.from('profiles')
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
    const { data } = await sb.rpc('admin_adjust_balance', {
      p_user_id:   userId,
      p_delta:     delta,
      p_admin_id:  _user.id,
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
    const { data } = await sb.from('transfers')
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
    const { data: row, error } = await sb.from('transactions').insert(payload).select().single();
    if (error) { console.error('[addTransaction]', error); return null; }
    const flat = _flattenTx(row);
    if (!_txCache[data.userId]) _txCache[data.userId] = [];
    _txCache[data.userId].unshift(flat);
    emit('transaction_added', flat);
    return flat;
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
      sb.from('transactions').select('*').order('date', { ascending: false }).limit(200)
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
    // Account status (admin)
    lockAccount, unlockAccount, suspendAccount, activateAccount,
    // Balance (admin)
    updateBalance, adjustBalance,
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
