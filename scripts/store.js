/**
 * VaultStore — localStorage-based state engine for Vaultstone Bank
 * Simulates a backend: users, sessions, transfers, transactions, notifications
 * Cross-tab real-time sync via the 'storage' event
 */

'use strict';

const VaultStore = (() => {

  /* ─── Storage Keys ─── */
  const KEYS = {
    users:         'vs_users',
    transfers:     'vs_transfers',
    transactions:  'vs_transactions',
    notifications: 'vs_notifications',
    session:       'vs_session',
  };

  /* ─── Helpers ─── */
  const uid  = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const now  = () => new Date().toISOString();
  const hash = s  => btoa(unescape(encodeURIComponent(s)));       // demo-only encoding
  const read = k  => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
  const readObj = k => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch { return null; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* ─── Seed default data on first load ─── */
  function seed() {
    if (localStorage.getItem('vs_seeded')) return;
    const users = [
      {
        id: 'usr_alexmorgan',
        name: 'Alex Morgan',
        email: 'alex@vaultstone.com',
        password: hash('Password1!'),
        phone: '+1 (555) 012-3456',
        accountType: 'personal',
        accountNumber: '4521 •••• •••• 7823',
        balance: 142850.47,
        savingsBalance: 48200.00,
        investmentBalance: 89340.00,
        status: 'active',
        kycStatus: 'approved',
        role: 'user',
        createdAt: '2023-06-15T10:00:00Z',
        lastLogin: now(),
        cardNumber: '7823',
        avatar: 'AM',
        country: 'US',
        dob: '1990-04-12',
      },
      {
        id: 'usr_sarahchen',
        name: 'Sarah Chen',
        email: 'sarah@example.com',
        password: hash('Password1!'),
        phone: '+1 (555) 987-6543',
        accountType: 'business',
        accountNumber: '6011 •••• •••• 3341',
        balance: 284500.00,
        savingsBalance: 120000.00,
        investmentBalance: 0,
        status: 'active',
        kycStatus: 'approved',
        role: 'user',
        createdAt: '2022-11-20T09:00:00Z',
        lastLogin: now(),
        cardNumber: '3341',
        avatar: 'SC',
        country: 'US',
        dob: '1985-09-23',
      },
      {
        id: 'usr_markjohnson',
        name: 'Mark Johnson',
        email: 'mark@example.com',
        password: hash('Password1!'),
        phone: '+1 (555) 234-5678',
        accountType: 'personal',
        accountNumber: '5412 •••• •••• 9901',
        balance: 12300.75,
        savingsBalance: 5000.00,
        investmentBalance: 0,
        status: 'pending',
        kycStatus: 'under_review',
        role: 'user',
        createdAt: '2024-02-10T14:00:00Z',
        lastLogin: now(),
        cardNumber: '9901',
        avatar: 'MJ',
        country: 'UK',
        dob: '1998-01-07',
      },
      {
        id: 'usr_oliviawilson',
        name: 'Olivia Wilson',
        email: 'olivia@example.com',
        password: hash('Password1!'),
        phone: '+44 7700 900123',
        accountType: 'wealth',
        accountNumber: '3782 •••• •••• 4456',
        balance: 1240000.00,
        savingsBalance: 500000.00,
        investmentBalance: 780000.00,
        status: 'active',
        kycStatus: 'approved',
        role: 'user',
        createdAt: '2021-03-01T08:00:00Z',
        lastLogin: now(),
        cardNumber: '4456',
        avatar: 'OW',
        country: 'UK',
        dob: '1978-12-15',
      },
      {
        id: 'usr_davidkwame',
        name: 'David Kwame',
        email: 'david@example.com',
        password: hash('Password1!'),
        phone: '+233 20 000 1234',
        accountType: 'personal',
        accountNumber: '4111 •••• •••• 1111',
        balance: 8420.00,
        savingsBalance: 2000.00,
        investmentBalance: 0,
        status: 'suspended',
        kycStatus: 'approved',
        role: 'user',
        createdAt: '2023-09-05T11:00:00Z',
        lastLogin: '2024-01-02T10:00:00Z',
        cardNumber: '1111',
        avatar: 'DK',
        country: 'GH',
        dob: '1995-06-30',
      },
    ];

    const transactions = [];
    const merchants = ['Amazon', 'Netflix', 'Uber', 'Whole Foods', 'Shell', 'Starbucks', 'Apple', 'Spotify', 'Delta Airlines', 'Target', 'Walmart', 'Zara', 'IKEA', 'Lyft', 'DoorDash'];
    const categories = ['Shopping', 'Entertainment', 'Transport', 'Groceries', 'Fuel', 'Food & Drink', 'Tech', 'Music', 'Travel', 'Retail'];
    users.forEach(u => {
      let runningBalance = u.balance;
      for (let i = 30; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const count = Math.floor(Math.random() * 3);
        for (let j = 0; j < count; j++) {
          const isCredit = Math.random() > 0.75;
          const amount = isCredit
            ? parseFloat((Math.random() * 3000 + 500).toFixed(2))
            : parseFloat((Math.random() * 400 + 10).toFixed(2));
          const merchant = merchants[Math.floor(Math.random() * merchants.length)];
          const category = categories[Math.floor(Math.random() * categories.length)];
          if (!isCredit) runningBalance -= amount; else runningBalance += amount;
          transactions.push({
            id: uid(),
            userId: u.id,
            type: isCredit ? 'credit' : 'debit',
            amount,
            balance: parseFloat(runningBalance.toFixed(2)),
            description: isCredit ? `Incoming Transfer` : `${merchant}`,
            category,
            merchant: isCredit ? 'Bank Transfer' : merchant,
            date: d.toISOString(),
            status: 'completed',
            transferId: null,
          });
        }
      }
    });

    save(KEYS.users, users);
    save(KEYS.transfers, []);
    save(KEYS.transactions, transactions);
    save(KEYS.notifications, []);
    localStorage.setItem('vs_seeded', '1');
  }

  /* ─────────────────────────────────────────────
     USERS
  ───────────────────────────────────────────── */
  function getUsers()            { return read(KEYS.users); }
  function getUser(id)           { return getUsers().find(u => u.id === id) || null; }
  function getUserByEmail(email) { return getUsers().find(u => u.email.toLowerCase() === email.toLowerCase()) || null; }

  function createUser(data) {
    const users = getUsers();
    const user = {
      id: 'usr_' + uid(),
      name: data.name,
      email: data.email,
      password: hash(data.password),
      phone: data.phone || '',
      accountType: data.accountType || 'personal',
      accountNumber: generateAccountNumber(),
      balance: 0,
      savingsBalance: 0,
      investmentBalance: 0,
      status: 'pending_kyc',
      kycStatus: 'not_started',
      role: 'user',
      createdAt: now(),
      lastLogin: now(),
      cardNumber: Math.floor(1000 + Math.random() * 9000).toString(),
      avatar: data.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2),
      country: data.country || 'US',
      dob: data.dob || '',
    };
    users.push(user);
    save(KEYS.users, users);
    emit('user_created', user);
    return user;
  }

  function updateUser(id, data) {
    const users = getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...data };
    save(KEYS.users, users);
    emit('user_updated', users[idx]);
    return users[idx];
  }

  function deleteUser(id) {
    const users = getUsers().filter(u => u.id !== id);
    save(KEYS.users, users);
    emit('user_deleted', { id });
  }

  function generateAccountNumber() {
    const bins = ['4521', '6011', '5412', '3782', '4111'];
    const bin = bins[Math.floor(Math.random() * bins.length)];
    const rand = () => String(Math.floor(1000 + Math.random() * 9000));
    return `${bin} •••• •••• ${rand()}`;
  }

  /* ─────────────────────────────────────────────
     SESSION
  ───────────────────────────────────────────── */
  function login(email, password) {
    const user = getUserByEmail(email);
    if (!user) return { ok: false, error: 'No account found with that email.' };
    if (user.password !== hash(password)) return { ok: false, error: 'Incorrect password.' };
    if (user.status === 'suspended') return { ok: false, error: 'This account has been suspended. Contact support.' };
    if (user.status === 'locked')    return { ok: false, error: 'This account is locked. Please verify your identity.' };
    const session = { userId: user.id, role: user.role, loginAt: now() };
    save(KEYS.session, session);
    updateUser(user.id, { lastLogin: now() });
    return { ok: true, user };
  }

  function logout() {
    localStorage.removeItem(KEYS.session);
    emit('logout', {});
  }

  function getSession() { return readObj(KEYS.session); }

  function getCurrentUser() {
    const s = getSession();
    if (!s) return null;
    return getUser(s.userId);
  }

  function requireAuth(redirectTo = 'login.html') {
    const u = getCurrentUser();
    if (!u) { window.location.href = redirectTo; return null; }
    return u;
  }

  function requireKYC(redirectTo = 'kyc.html') {
    const u = getCurrentUser();
    if (!u) { window.location.href = 'login.html'; return null; }
    if (u.status === 'pending_kyc' || u.kycStatus === 'not_started') {
      window.location.href = redirectTo; return null;
    }
    return u;
  }

  function adminLogin(password) {
    if (password === 'Vaultstone@Admin2024') {
      save('vs_admin_session', { adminId: 'admin_root', loginAt: now() });
      return true;
    }
    return false;
  }

  function getAdminSession() { return readObj('vs_admin_session'); }

  function requireAdmin(redirectTo = 'login.html') {
    const s = getAdminSession();
    if (!s) { window.location.href = redirectTo; return false; }
    return true;
  }

  /* ─────────────────────────────────────────────
     ACCOUNT STATUS
  ───────────────────────────────────────────── */
  function lockAccount(userId) {
    const u = updateUser(userId, { status: 'locked' });
    addNotification(userId, { type: 'warning', title: 'Account Locked', message: 'Your account has been locked. Please contact support.' });
    emit('account_updated', u);
    return u;
  }

  function unlockAccount(userId) {
    const u = updateUser(userId, { status: 'active' });
    addNotification(userId, { type: 'success', title: 'Account Unlocked', message: 'Your account has been reactivated.' });
    emit('account_updated', u);
    return u;
  }

  function suspendAccount(userId) {
    const u = updateUser(userId, { status: 'suspended' });
    addNotification(userId, { type: 'error', title: 'Account Suspended', message: 'Your account has been suspended. Please contact support.' });
    emit('account_updated', u);
    return u;
  }

  function activateAccount(userId) {
    const u = updateUser(userId, { status: 'active' });
    addNotification(userId, { type: 'success', title: 'Account Activated', message: 'Your account is now fully active.' });
    emit('account_updated', u);
    return u;
  }

  /* ─────────────────────────────────────────────
     BALANCE
  ───────────────────────────────────────────── */
  function updateBalance(userId, newBalance) {
    const u = updateUser(userId, { balance: parseFloat(newBalance.toFixed(2)) });
    emit('balance_updated', { userId, balance: u.balance });
    return u;
  }

  function adjustBalance(userId, delta) {
    const user = getUser(userId);
    if (!user) return null;
    return updateBalance(userId, Math.max(0, user.balance + delta));
  }

  /* ─────────────────────────────────────────────
     TRANSFERS
  ───────────────────────────────────────────── */
  function getTransfers()          { return read(KEYS.transfers); }
  function getUserTransfers(uid)   { return getTransfers().filter(t => t.fromUserId === uid || t.toUserId === uid); }
  function getPendingTransfers()   { return getTransfers().filter(t => t.status === 'pending'); }

  function createTransfer(data) {
    const transfers = getTransfers();
    const transfer = {
      id: 'txf_' + uid(),
      fromUserId: data.fromUserId,
      fromName: data.fromName,
      toUserId: data.toUserId || null,
      toName: data.toName,
      toAccountNumber: data.toAccountNumber || '',
      toBank: data.toBank || 'Vaultstone Bank',
      amount: parseFloat(data.amount),
      currency: data.currency || 'USD',
      note: data.note || '',
      type: data.type || 'internal',
      status: 'pending',
      createdAt: now(),
      processedAt: null,
      approvedBy: null,
      rejectionReason: null,
    };
    transfers.push(transfer);
    save(KEYS.transfers, transfers);
    addNotification(data.fromUserId, {
      type: 'info',
      title: 'Transfer Submitted',
      message: `Your transfer of $${transfer.amount.toLocaleString()} to ${transfer.toName} is pending approval.`,
    });
    emit('transfer_created', transfer);
    return transfer;
  }

  function updateTransfer(id, data) {
    const transfers = getTransfers();
    const idx = transfers.findIndex(t => t.id === id);
    if (idx === -1) return null;
    transfers[idx] = { ...transfers[idx], ...data };
    save(KEYS.transfers, transfers);
    emit('transfer_updated', transfers[idx]);
    return transfers[idx];
  }

  function approveTransfer(transferId) {
    const transfer = getTransfers().find(t => t.id === transferId);
    if (!transfer || transfer.status !== 'pending') return null;

    const fromUser = getUser(transfer.fromUserId);
    if (!fromUser || fromUser.balance < transfer.amount) {
      return updateTransfer(transferId, {
        status: 'rejected',
        processedAt: now(),
        rejectionReason: 'Insufficient funds at time of processing.',
      });
    }

    adjustBalance(transfer.fromUserId, -transfer.amount);
    if (transfer.toUserId) adjustBalance(transfer.toUserId, transfer.amount);

    const updated = updateTransfer(transferId, { status: 'approved', processedAt: now(), approvedBy: 'admin_root' });

    addTransaction({
      userId: transfer.fromUserId,
      type: 'debit',
      amount: transfer.amount,
      description: `Transfer to ${transfer.toName}`,
      category: 'Transfer',
      merchant: transfer.toName,
      date: now(),
      status: 'completed',
      transferId,
    });

    if (transfer.toUserId) {
      addTransaction({
        userId: transfer.toUserId,
        type: 'credit',
        amount: transfer.amount,
        description: `Transfer from ${transfer.fromName}`,
        category: 'Transfer',
        merchant: transfer.fromName,
        date: now(),
        status: 'completed',
        transferId,
      });
    }

    addNotification(transfer.fromUserId, {
      type: 'success',
      title: 'Transfer Approved',
      message: `Your transfer of $${transfer.amount.toLocaleString()} to ${transfer.toName} has been approved.`,
    });

    if (transfer.toUserId) {
      addNotification(transfer.toUserId, {
        type: 'success',
        title: 'Funds Received',
        message: `You received $${transfer.amount.toLocaleString()} from ${transfer.fromName}.`,
      });
    }

    return updated;
  }

  function rejectTransfer(transferId, reason = 'Transfer rejected by compliance.') {
    const transfer = getTransfers().find(t => t.id === transferId);
    if (!transfer) return null;
    const updated = updateTransfer(transferId, { status: 'rejected', processedAt: now(), rejectionReason: reason });
    addNotification(transfer.fromUserId, {
      type: 'error',
      title: 'Transfer Rejected',
      message: `Your transfer of $${transfer.amount.toLocaleString()} to ${transfer.toName} was rejected. Reason: ${reason}`,
    });
    return updated;
  }

  /* ─────────────────────────────────────────────
     TRANSACTIONS
  ───────────────────────────────────────────── */
  function getTransactions()           { return read(KEYS.transactions); }
  function getUserTransactions(userId) { return getTransactions().filter(t => t.userId === userId).sort((a, b) => new Date(b.date) - new Date(a.date)); }

  function addTransaction(data) {
    const transactions = getTransactions();
    const user = getUser(data.userId);
    const tx = {
      id: 'tx_' + uid(),
      userId: data.userId,
      type: data.type,
      amount: parseFloat(data.amount),
      balance: user ? user.balance : 0,
      description: data.description,
      category: data.category || 'Other',
      merchant: data.merchant || '',
      date: data.date || now(),
      status: data.status || 'completed',
      transferId: data.transferId || null,
    };
    transactions.push(tx);
    save(KEYS.transactions, transactions);
    emit('transaction_added', tx);
    return tx;
  }

  function generateTransactions(userId, count = 5) {
    const merchants  = ['Amazon', 'Netflix', 'Uber', 'Whole Foods', 'Shell', 'Starbucks', 'Apple', 'Spotify', 'Delta', 'Target', 'Walmart', 'Zara', 'IKEA', 'DoorDash', 'PayPal'];
    const categories = ['Shopping', 'Entertainment', 'Transport', 'Groceries', 'Fuel', 'Food & Drink', 'Tech', 'Music', 'Travel', 'Retail'];
    const generated = [];
    for (let i = 0; i < count; i++) {
      const isCredit = Math.random() > 0.65;
      const amount   = isCredit
        ? parseFloat((Math.random() * 5000 + 100).toFixed(2))
        : parseFloat((Math.random() * 500 + 5).toFixed(2));
      const merchant  = merchants[Math.floor(Math.random() * merchants.length)];
      const category  = categories[Math.floor(Math.random() * categories.length)];
      const daysAgo   = Math.floor(Math.random() * 7);
      const d = new Date(); d.setDate(d.getDate() - daysAgo);
      const tx = addTransaction({
        userId,
        type: isCredit ? 'credit' : 'debit',
        amount,
        description: isCredit ? 'Incoming Transfer' : merchant,
        category,
        merchant: isCredit ? 'Bank Transfer' : merchant,
        date: d.toISOString(),
        status: 'completed',
      });
      adjustBalance(userId, isCredit ? amount : -amount);
      generated.push(tx);
    }
    return generated;
  }

  /* ─────────────────────────────────────────────
     NOTIFICATIONS
  ───────────────────────────────────────────── */
  function getNotifications(userId)   { return read(KEYS.notifications).filter(n => n.userId === userId).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)); }
  function getUnreadCount(userId)     { return getNotifications(userId).filter(n => !n.read).length; }

  function addNotification(userId, data) {
    const notifications = read(KEYS.notifications);
    const notif = {
      id: 'ntf_' + uid(),
      userId,
      type: data.type || 'info',
      title: data.title,
      message: data.message,
      read: false,
      createdAt: now(),
    };
    notifications.push(notif);
    save(KEYS.notifications, notifications);
    emit('notification', notif);
    return notif;
  }

  function markNotificationRead(id) {
    const notifications = read(KEYS.notifications);
    const idx = notifications.findIndex(n => n.id === id);
    if (idx !== -1) { notifications[idx].read = true; save(KEYS.notifications, notifications); }
  }

  function markAllRead(userId) {
    const notifications = read(KEYS.notifications).map(n => n.userId === userId ? { ...n, read: true } : n);
    save(KEYS.notifications, notifications);
  }

  /* ─────────────────────────────────────────────
     KYC
  ───────────────────────────────────────────── */
  function submitKYC(userId, kycData) {
    const u = updateUser(userId, { kycStatus: 'under_review', kycData, status: 'pending' });
    addNotification(userId, {
      type: 'info',
      title: 'KYC Submitted',
      message: 'Your identity documents are under review. This typically takes 1–2 business days.',
    });
    emit('kyc_submitted', { userId });
    return u;
  }

  function approveKYC(userId) {
    const u = updateUser(userId, { kycStatus: 'approved', status: 'active' });
    addNotification(userId, {
      type: 'success',
      title: 'Identity Verified',
      message: 'Your KYC verification was approved. Your account is now fully active.',
    });
    emit('kyc_approved', { userId });
    return u;
  }

  function rejectKYC(userId, reason = 'Documents could not be verified.') {
    const u = updateUser(userId, { kycStatus: 'rejected', status: 'pending_kyc' });
    addNotification(userId, {
      type: 'error',
      title: 'Verification Failed',
      message: `KYC rejected: ${reason}. Please re-submit your documents.`,
    });
    emit('kyc_rejected', { userId, reason });
    return u;
  }

  /* ─────────────────────────────────────────────
     REAL-TIME EVENTS (cross-tab via storage event)
  ───────────────────────────────────────────── */
  const listeners = {};

  function on(event, cb) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
  }

  function off(event, cb) {
    if (listeners[event]) listeners[event] = listeners[event].filter(f => f !== cb);
  }

  function emit(event, data) {
    // Local listeners
    (listeners[event] || []).forEach(cb => cb(data));
    (listeners['*'] || []).forEach(cb => cb(event, data));
    // Cross-tab via storage event
    const payload = JSON.stringify({ event, data, ts: Date.now() });
    localStorage.setItem('vs_event', payload);
    // Remove immediately so next identical event fires too
    setTimeout(() => localStorage.removeItem('vs_event'), 50);
  }

  // Listen to cross-tab events
  window.addEventListener('storage', e => {
    if (e.key !== 'vs_event' || !e.newValue) return;
    try {
      const { event, data } = JSON.parse(e.newValue);
      (listeners[event] || []).forEach(cb => cb(data));
      (listeners['*'] || []).forEach(cb => cb(event, data));
    } catch { /* ignore */ }
  });

  /* ─── Init ─── */
  seed();

  /* ─── Public API ─── */
  return {
    // Users
    getUsers, getUser, getUserByEmail, createUser, updateUser, deleteUser,
    // Session
    login, logout, getSession, getCurrentUser, requireAuth, requireKYC,
    adminLogin, getAdminSession, requireAdmin,
    // Account status
    lockAccount, unlockAccount, suspendAccount, activateAccount,
    // Balance
    updateBalance, adjustBalance,
    // Transfers
    getTransfers, getUserTransfers, getPendingTransfers, createTransfer,
    updateTransfer, approveTransfer, rejectTransfer,
    // Transactions
    getTransactions, getUserTransactions, addTransaction, generateTransactions,
    // Notifications
    getNotifications, getUnreadCount, addNotification, markNotificationRead, markAllRead,
    // KYC
    submitKYC, approveKYC, rejectKYC,
    // Events
    on, off, emit,
  };

})();

window.VaultStore = VaultStore;
