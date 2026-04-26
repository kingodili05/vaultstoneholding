'use strict';

/**
 * admin-supabase.js
 * Loads AFTER admin.js. Fetches real data from Supabase and replaces
 * the hardcoded usersData / txData arrays so all admin actions hit the DB.
 */
(async function () {
  try {
  if (typeof VaultStore === 'undefined' || !VaultStore.ready) {
    console.error('[AdminSupabase] VaultStore not available');
    return;
  }

  await VaultStore.ready;

  // Ensure admin session — set it here too in case the top-level call in admin.js
  // ran before VaultStore was ready
  await VaultStore.adminLogin('Vaultstone@Admin2024');

  if (!VaultStore.requireAdmin('login.html')) return;

  console.log('[AdminSupabase] session OK, loading data…');

  // Load all admin data via VaultStore
  let { users, transfers, transactions } = await VaultStore.loadAdminData();

  console.log('[AdminSupabase] VaultStore returned', users.length, 'users');

  // ── Fallback: query _sbAdmin directly if VaultStore returned nothing ──
  if (users.length === 0 && window._sbAdmin) {
    console.warn('[AdminSupabase] VaultStore returned 0 users — trying direct _sbAdmin query');
    const [profilesRes, accountsRes] = await Promise.all([
      window._sbAdmin.from('profiles').select('*').order('created_at', { ascending: false }),
      window._sbAdmin.from('accounts').select('*'),
    ]);
    if (profilesRes.error) {
      console.error('[AdminSupabase] direct profiles query error:', profilesRes.error.message);
      if (typeof showToast === 'function') showToast('DB error: ' + profilesRes.error.message, 'error');
    } else {
      console.log('[AdminSupabase] direct query returned', (profilesRes.data || []).length, 'profiles');
      const accounts = accountsRes.data || [];
      users = (profilesRes.data || []).map(p => ({
        id:          p.id,
        name:        p.full_name || (p.email ? p.email.split('@')[0] : 'User'),
        email:       p.email || '',
        accountType: p.account_type || 'personal',
        balance:     parseFloat((accounts.find(a => a.user_id === p.id && a.type === 'checking') || {}).balance || 0),
        status:      p.status || 'pending_kyc',
        kycStatus:   p.kyc_status || 'not_started',
        avatar:      p.avatar || (p.full_name || 'U').slice(0, 2).toUpperCase(),
        createdAt:   p.created_at,
      }));
    }
  }

  if (users.length === 0) {
    if (typeof showToast === 'function') showToast('No users found in database', 'warning');
    console.warn('[AdminSupabase] 0 users after all attempts. Check Supabase profiles table.');
  }

  /* ─── Override global usersData used by renderUsersTable ─── */
  const toAdminRow = u => ({
    id:       u.id,
    name:     u.name,
    email:    u.email,
    type:     u.accountType,
    balance:  u.balance,
    status:   u.status,
    kycStatus: u.kycStatus,
    joined:   u.createdAt ? u.createdAt.slice(0, 10) : '—',
    initials: u.avatar || u.name.slice(0, 2).toUpperCase(),
  });

  // Replace the hardcoded array
  window.usersData    = users.map(toAdminRow);
  window.filteredUsers = [...window.usersData];

  // Re-render table with live data
  if (typeof renderUsersTable === 'function') renderUsersTable();

  /* ─── Override txData with real transactions ─── */
  const toTxRow = tx => ({
    id:       tx.id,
    user:     (users.find(u => u.id === tx.userId)?.name) || tx.userId,
    type:     tx.type === 'credit' ? 'Credit' : 'Debit',
    amount:   tx.amount,
    merchant: tx.merchant || tx.description,
    date:     tx.date ? new Date(tx.date).toLocaleDateString('en-US') : '—',
    status:   tx.status,
    risk:     Math.floor(Math.random() * 40),   // placeholder; add real risk scoring later
  });

  window.txData = transactions.map(toTxRow);
  if (typeof renderTxTable === 'function') renderTxTable(window.txData);

  /* ─── Pending KYC section ─── */
  renderPendingKYCSection(users);

  /* ─── Pending Transfers section ─── */
  renderPendingTransfersSection(transfers);

  /* ─── Override user action handlers ─────────────────────── */
  window.openViewUser = function (id) {
    const u = window.usersData.find(x => String(x.id) === String(id));
    if (!u) return;
    if (typeof showToast === 'function')
      showToast(`${u.name} — Balance: $${u.balance.toLocaleString()} · Status: ${u.status}`, 'info');
  };

  // Open the edit drawer and populate it with live Supabase data
  window.openEditUser = function (id) {
    const u = window.usersData.find(x => String(x.id) === String(id));
    if (!u) return;
    const drawer   = document.getElementById('edit-drawer');
    const backdrop = document.getElementById('edit-drawer-backdrop');
    if (!drawer) return;
    document.getElementById('edit-name').value    = u.name    || '';
    document.getElementById('edit-email').value   = u.email   || '';
    document.getElementById('edit-type').value    = u.type    || 'personal';
    document.getElementById('edit-status').value  = u.status  || 'active';
    document.getElementById('edit-balance').value = u.balance || 0;
    drawer.dataset.editId = id;
    drawer.classList.add('open');
    backdrop?.classList.add('open');
    document.getElementById('edit-name').focus();
  };

  // Replace edit-save handler so it persists to Supabase
  const _editSave = document.getElementById('edit-save');
  if (_editSave) {
    const freshSave = _editSave.cloneNode(true);
    _editSave.parentNode.replaceChild(freshSave, _editSave);
    freshSave.addEventListener('click', async () => {
      const id = document.getElementById('edit-drawer')?.dataset.editId;
      if (!id) return;
      const u          = window.usersData.find(x => String(x.id) === String(id));
      const name       = document.getElementById('edit-name')?.value.trim();
      const status     = document.getElementById('edit-status')?.value;
      const acctType   = document.getElementById('edit-type')?.value;
      const newBalance = parseFloat(document.getElementById('edit-balance')?.value || 0);

      freshSave.disabled    = true;
      freshSave.textContent = 'Saving…';

      await VaultStore.updateUser(id, { name, status, accountType: acctType });
      if (u && newBalance !== u.balance) {
        await VaultStore.adjustBalance(id, newBalance - u.balance);
      }

      freshSave.disabled    = false;
      freshSave.textContent = 'Save Changes';

      if (u) { u.name = name; u.status = status; u.type = acctType; u.balance = newBalance; }
      if (typeof closeDrawer      === 'function') closeDrawer();
      if (typeof renderUsersTable === 'function') renderUsersTable();
      if (typeof showToast        === 'function') showToast('User updated.', 'success');
    });
  }

  /* ─── Fund Account modal ─────────────────────────────────── */
  window.openFundModal = function (id) {
    const u = window.usersData.find(x => String(x.id) === String(id));
    if (!u) return;
    document.getElementById('fund-user-name').textContent    = u.name;
    document.getElementById('fund-user-balance').textContent = `Current balance: $${u.balance.toLocaleString()}`;
    document.getElementById('fund-amount').value             = '';
    document.getElementById('fund-acct-type').value          = 'checking';
    document.getElementById('fund-gen-history').checked      = false;
    document.getElementById('fund-history-opts').style.display = 'none';
    const overlay = document.getElementById('fund-modal-overlay');
    overlay.dataset.userId = id;
    overlay.style.display  = 'flex';
    overlay.removeAttribute('aria-hidden');
    document.getElementById('fund-amount').focus();
  };

  function _closeFundModal() {
    const o = document.getElementById('fund-modal-overlay');
    if (o) { o.style.display = 'none'; o.setAttribute('aria-hidden', 'true'); }
  }

  document.getElementById('fund-gen-history')?.addEventListener('change', function () {
    document.getElementById('fund-history-opts').style.display = this.checked ? 'flex' : 'none';
  });
  document.getElementById('fund-modal-close')?.addEventListener('click', _closeFundModal);
  document.getElementById('fund-cancel')?.addEventListener('click', _closeFundModal);
  document.getElementById('fund-modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) _closeFundModal();
  });

  document.getElementById('fund-submit')?.addEventListener('click', async function () {
    const overlay  = document.getElementById('fund-modal-overlay');
    const userId   = overlay?.dataset.userId;
    const amount   = parseFloat(document.getElementById('fund-amount')?.value || 0);
    const acctType = document.getElementById('fund-acct-type')?.value || 'checking';
    const genHist  = document.getElementById('fund-gen-history')?.checked || false;
    const txCount  = parseInt(document.getElementById('fund-tx-count')?.value  || 25, 10);
    const daysBack = parseInt(document.getElementById('fund-days-back')?.value || 90, 10);

    if (!userId || !(amount > 0)) {
      if (typeof showToast === 'function') showToast('Enter a valid amount.', 'warning');
      return;
    }

    this.disabled    = true;
    this.textContent = genHist ? 'Generating…' : 'Funding…';

    const result = await VaultStore.fundAccount(userId, amount, acctType, {
      generateHistory: genHist, txCount, daysBack,
    });

    this.disabled    = false;
    this.textContent = 'Fund Account';

    if (!result.ok) {
      if (typeof showToast === 'function') showToast(result.error || 'Funding failed.', 'error');
      return;
    }

    _closeFundModal();
    const u = window.usersData.find(x => String(x.id) === String(userId));
    if (u) {
      if (acctType === 'checking')   u.balance = (u.balance || 0) + amount;
      if (acctType === 'savings')    u.savingsBalance    = (u.savingsBalance    || 0) + amount;
      if (acctType === 'investment') u.investmentBalance = (u.investmentBalance || 0) + amount;
      if (typeof renderUsersTable === 'function') renderUsersTable();
    }
    const msg = genHist
      ? `$${amount.toLocaleString()} funded & ${result.count} transactions generated for ${u?.name}.`
      : `$${amount.toLocaleString()} deposited to ${u?.name}'s ${acctType} account.`;
    if (typeof showToast === 'function') showToast(msg, 'success');
  });

  /* ─── Generate Transaction History modal ─────────────────── */
  window.openGenHistoryModal = function (id) {
    const u = window.usersData.find(x => String(x.id) === String(id));
    if (!u) return;
    document.getElementById('gen-history-user-name').textContent    = u.name;
    document.getElementById('gen-history-user-balance').textContent =
      `Current balance: $${u.balance.toLocaleString()} — history will culminate at this amount`;
    document.getElementById('gen-tx-count').value  = 25;
    document.getElementById('gen-days-back').value = '90';
    const overlay = document.getElementById('gen-history-modal-overlay');
    overlay.dataset.userId      = id;
    overlay.dataset.userBalance = u.balance;
    overlay.style.display       = 'flex';
    overlay.removeAttribute('aria-hidden');
  };

  function _closeGenModal() {
    const o = document.getElementById('gen-history-modal-overlay');
    if (o) { o.style.display = 'none'; o.setAttribute('aria-hidden', 'true'); }
  }

  document.getElementById('gen-history-close')?.addEventListener('click', _closeGenModal);
  document.getElementById('gen-history-cancel')?.addEventListener('click', _closeGenModal);
  document.getElementById('gen-history-modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) _closeGenModal();
  });

  document.getElementById('gen-history-submit')?.addEventListener('click', async function () {
    const overlay       = document.getElementById('gen-history-modal-overlay');
    const userId        = overlay?.dataset.userId;
    const targetBalance = parseFloat(overlay?.dataset.userBalance || 0);
    const txCount       = parseInt(document.getElementById('gen-tx-count')?.value  || 25, 10);
    const daysBack      = parseInt(document.getElementById('gen-days-back')?.value || 90, 10);

    if (!userId || !(targetBalance > 0)) {
      if (typeof showToast === 'function') showToast('This account has no balance to generate history for.', 'warning');
      return;
    }

    this.disabled    = true;
    this.textContent = 'Generating…';

    const result = await VaultStore.generateTransactions(userId, { targetBalance, count: txCount, daysBack });

    this.disabled    = false;
    this.textContent = 'Generate History';

    if (!result.ok) {
      if (typeof showToast === 'function') showToast(result.error || 'Generation failed.', 'error');
      return;
    }

    _closeGenModal();
    const u = window.usersData.find(x => String(x.id) === String(userId));
    if (typeof showToast === 'function')
      showToast(`${result.count} transactions generated for ${u?.name}.`, 'success');
  });

  // Toggle suspend / activate
  window.toggleSuspend = async function (id) {
    const u = window.usersData.find(x => x.id === id);
    if (!u) return;
    const newStatus = u.status === 'suspended' ? 'active' : 'suspended';
    if (newStatus === 'suspended') {
      await VaultStore.suspendAccount(id);
    } else {
      await VaultStore.activateAccount(id);
    }
    u.status = newStatus;
    window.filteredUsers = [...window.usersData];
    if (typeof renderUsersTable === 'function') renderUsersTable();
    if (typeof showToast === 'function')
      showToast(`${u.name} ${newStatus === 'suspended' ? 'suspended' : 'activated'}.`,
        newStatus === 'suspended' ? 'warning' : 'success');
  };

  // Delete user
  window.confirmDeleteUser = async function (id) {
    const u = window.usersData.find(x => x.id === id);
    if (!u) return;
    if (!confirm(`Delete ${u.name}? This cannot be undone.`)) return;
    await VaultStore.deleteUser(id);
    window.usersData    = window.usersData.filter(x => x.id !== id);
    window.filteredUsers = [...window.usersData];
    if (typeof renderUsersTable === 'function') renderUsersTable();
    if (typeof showToast === 'function') showToast(`${u.name} deleted.`, 'info');
  };

  /* ─── KYC review ─────────────────────────────────────────── */
  function renderPendingKYCSection(allUsers) {
    const pending = allUsers.filter(u => u.kycStatus === 'under_review');
    let container = document.getElementById('pending-kyc-section');
    if (!container) {
      container = document.createElement('div');
      container.id = 'pending-kyc-section';
      container.style.cssText = 'margin-bottom:1.5rem';
      const panel = document.getElementById('panel-overview');
      if (panel) panel.prepend(container);
    }
    if (!pending.length) { container.innerHTML = ''; return; }

    container.innerHTML = `
      <div class="card" style="margin-bottom:1rem">
        <div class="card-header">
          <div>
            <div class="card-title">Pending KYC Reviews</div>
            <div class="card-subtitle">${pending.length} awaiting approval</div>
          </div>
          <span class="badge badge-yellow">${pending.length} pending</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Email</th><th>Account Type</th><th>Actions</th></tr></thead>
            <tbody id="kyc-pending-tbody">
              ${pending.map(u => `
                <tr>
                  <td><div style="display:flex;align-items:center;gap:0.75rem">
                    <div class="avatar" style="width:34px;height:34px;font-size:0.8rem">${u.avatar}</div>
                    <div style="font-weight:500">${u.name}</div>
                  </div></td>
                  <td style="color:var(--muted2)">${u.email}</td>
                  <td><span class="badge badge-muted">${u.accountType}</span></td>
                  <td>
                    <div class="action-btns">
                      <button class="btn btn-primary btn-sm approve-kyc" data-id="${u.id}">Approve</button>
                      <button class="btn btn-danger  btn-sm reject-kyc"  data-id="${u.id}">Reject</button>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    container.querySelectorAll('.approve-kyc').forEach(btn => {
      btn.addEventListener('click', async () => {
        await VaultStore.approveKYC(btn.dataset.id);
        const u = window.usersData.find(x => x.id === btn.dataset.id);
        if (u) { u.status = 'active'; u.kycStatus = 'approved'; }
        renderPendingKYCSection(VaultStore.getUsers());
        if (typeof renderUsersTable === 'function') renderUsersTable();
        if (typeof showToast === 'function') showToast('KYC approved.', 'success');
      });
    });

    container.querySelectorAll('.reject-kyc').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reason = prompt('Rejection reason:', 'Documents could not be verified.');
        if (reason === null) return;
        await VaultStore.rejectKYC(btn.dataset.id, reason);
        const u = window.usersData.find(x => x.id === btn.dataset.id);
        if (u) { u.kycStatus = 'rejected'; }
        renderPendingKYCSection(VaultStore.getUsers());
        if (typeof showToast === 'function') showToast('KYC rejected.', 'warning');
      });
    });
  }

  /* ─── Pending Transfers review ───────────────────────────── */
  function renderPendingTransfersSection(allTransfers) {
    const pending = allTransfers.filter(t => t.status === 'pending');
    let container = document.getElementById('pending-transfers-section');
    if (!container) {
      container = document.createElement('div');
      container.id = 'pending-transfers-section';
      container.style.cssText = 'margin-bottom:1.5rem';
      const kycSection = document.getElementById('pending-kyc-section');
      if (kycSection) kycSection.insertAdjacentElement('afterend', container);
      else {
        const panel = document.getElementById('panel-overview');
        if (panel) panel.prepend(container);
      }
    }
    if (!pending.length) { container.innerHTML = ''; return; }

    const fmt = v => '$' + parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 2 });

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Pending Transfers</div>
            <div class="card-subtitle">${pending.length} awaiting approval</div>
          </div>
          <span class="badge badge-yellow">${pending.length} pending</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>From</th><th>To</th><th>Amount</th><th>Note</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              ${pending.map(t => `
                <tr>
                  <td style="font-weight:500">${t.fromName}</td>
                  <td>${t.toName}</td>
                  <td style="font-weight:600">${fmt(t.amount)} ${t.currency}</td>
                  <td style="color:var(--muted2);font-size:0.8rem">${t.note || '—'}</td>
                  <td style="color:var(--muted2);font-size:0.8rem">${new Date(t.createdAt).toLocaleDateString('en-US')}</td>
                  <td>
                    <div class="action-btns">
                      <button class="btn btn-primary btn-sm approve-xfer" data-id="${t.id}">Approve</button>
                      <button class="btn btn-danger  btn-sm reject-xfer"  data-id="${t.id}">Reject</button>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    container.querySelectorAll('.approve-xfer').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const result = await VaultStore.approveTransfer(btn.dataset.id);
        if (typeof showToast === 'function')
          showToast(result?.ok === false ? (result.error || 'Approval failed.') : 'Transfer approved.', result?.ok === false ? 'error' : 'success');
        const fresh = await VaultStore.getAllTransfers();
        renderPendingTransfersSection(fresh);
      });
    });

    container.querySelectorAll('.reject-xfer').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reason = prompt('Rejection reason:', 'Transfer rejected by compliance.');
        if (reason === null) return;
        btn.disabled = true;
        await VaultStore.rejectTransfer(btn.dataset.id, reason);
        if (typeof showToast === 'function') showToast('Transfer rejected.', 'warning');
        const fresh = await VaultStore.getAllTransfers();
        renderPendingTransfersSection(fresh);
      });
    });
  }

  /* ─── Override KPI counters with real numbers ─────────────── */
  const kpiUsers  = document.getElementById('kpi-users');
  const kpiFlagged = document.getElementById('kpi-flagged');
  if (kpiUsers && typeof animateCounter === 'function') {
    animateCounter(kpiUsers, users.length, 1400);
  }
  if (kpiFlagged && typeof animateCounter === 'function') {
    const suspended = users.filter(u => u.status === 'suspended' || u.status === 'locked').length;
    animateCounter(kpiFlagged, suspended, 1400);
  }

  /* ─── Real-time: refresh pending transfers when a transfer changes ─ */
  window._sb?.channel('admin_transfers')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers' }, async () => {
      const fresh = await VaultStore.getAllTransfers();
      renderPendingTransfersSection(fresh);
    })
    .subscribe();

  /* ─── Logout ─────────────────────────────────────────────── */
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    if (typeof showToast === 'function') showToast('Logging out…', 'info');
    await VaultStore.logout();
    setTimeout(() => { window.location.href = 'login.html'; }, 800);
  });

  } catch (err) {
    console.error('[AdminSupabase] unhandled error:', err);
    if (typeof showToast === 'function') showToast('Admin load error: ' + err.message, 'error');
  }
})();
