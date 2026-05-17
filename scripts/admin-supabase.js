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

  if (!VaultStore.requireAdmin('login.html')) return;

  console.log('[AdminSupabase] session OK, loading data…');

  // Load all admin data via VaultStore (uses `admin` Edge Function under the hood)
  let { users, transfers, transactions } = await VaultStore.loadAdminData();

  console.log('[AdminSupabase] VaultStore returned', users.length, 'users');

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
  if (typeof renderUsersTable    === 'function') renderUsersTable();
  if (typeof window.updateAdminKPIs === 'function') window.updateAdminKPIs();

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
      const email      = document.getElementById('edit-email')?.value.trim();
      const status     = document.getElementById('edit-status')?.value;
      const acctType   = document.getElementById('edit-type')?.value;
      const newBalance = parseFloat(document.getElementById('edit-balance')?.value || 0);

      freshSave.disabled    = true;
      freshSave.textContent = 'Saving…';

      // Email is changed via dedicated admin-only path because it must
      // update auth.users too (login email), not only the profiles row.
      const emailChanged = email && u && email !== u.email;
      if (emailChanged) {
        const res = await VaultStore.adminChangeUserEmail(id, email);
        if (!res.ok) {
          freshSave.disabled = false;
          freshSave.textContent = 'Save Changes';
          if (typeof showToast === 'function') showToast(res.error || 'Email update failed.', 'error');
          return;
        }
      }

      await VaultStore.updateUser(id, { name, status, accountType: acctType });
      if (u && newBalance !== u.balance) {
        await VaultStore.adjustBalance(id, newBalance - u.balance);
      }

      freshSave.disabled    = false;
      freshSave.textContent = 'Save Changes';

      if (u) {
        u.name = name; u.status = status; u.type = acctType; u.balance = newBalance;
        if (emailChanged) u.email = email;
      }
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
    const startDate = document.getElementById('fund-start-date')?.value || null;
    const endDate   = document.getElementById('fund-end-date')?.value   || null;

    if (!userId || !(amount > 0)) {
      if (typeof showToast === 'function') showToast('Enter a valid amount.', 'warning');
      return;
    }
    if (genHist && startDate && endDate && new Date(startDate) > new Date(endDate)) {
      if (typeof showToast === 'function') showToast('Start date must be before end date.', 'warning');
      return;
    }

    this.disabled    = true;
    this.textContent = genHist ? 'Generating…' : 'Funding…';

    const result = await VaultStore.fundAccount(userId, amount, acctType, {
      generateHistory: genHist, txCount, startDate, endDate,
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
    const sd = document.getElementById('gen-start-date');
    const ed = document.getElementById('gen-end-date');
    const cx = document.getElementById('gen-clear-existing');
    if (sd) sd.value = '';
    if (ed) ed.value = '';
    if (cx) cx.checked = false;
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
    const startDate     = document.getElementById('gen-start-date')?.value || null;
    const endDate       = document.getElementById('gen-end-date')?.value   || null;
    const clearFirst    = document.getElementById('gen-clear-existing')?.checked || false;

    if (!userId || !(targetBalance > 0)) {
      if (typeof showToast === 'function') showToast('This account has no balance to generate history for.', 'warning');
      return;
    }
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      if (typeof showToast === 'function') showToast('Start date must be before end date.', 'warning');
      return;
    }
    if (clearFirst) {
      const confirmed = confirm('This will permanently delete every existing transaction for this user, then generate a new history. Continue?');
      if (!confirmed) return;
    }

    this.disabled    = true;
    this.textContent = clearFirst ? 'Clearing & generating…' : 'Generating…';

    // If asked, wipe existing transactions first. We pass revertBalance:false
    // because the brand-new history below will rebuild the balance to
    // targetBalance — running both reversals would zero it out twice.
    if (clearFirst) {
      const existing = await VaultStore.adminListUserTransactions(userId, 1000);
      const ids = existing.map(t => t.id);
      if (ids.length) {
        const delRes = await VaultStore.deleteTransactions(ids, { revertBalance: false });
        if (!delRes.ok) {
          this.disabled = false;
          this.textContent = 'Generate History';
          if (typeof showToast === 'function') showToast(delRes.error || 'Failed to clear existing history.', 'error');
          return;
        }
      }
    }

    const result = await VaultStore.generateTransactions(userId, { targetBalance, count: txCount, startDate, endDate });

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

  // Toggle lock / unlock (overwrites admin.js fallback)
  window.toggleLock = async function (id) {
    const u = window.usersData.find(x => x.id === id);
    if (!u) return;
    const shouldLock = u.status !== 'locked';
    if (shouldLock) {
      await VaultStore.lockAccount(id);
    } else {
      await VaultStore.unlockAccount(id);
    }
    u.status = shouldLock ? 'locked' : 'active';
    window.filteredUsers = [...window.usersData];
    if (typeof renderUsersTable === 'function') renderUsersTable();
    if (typeof showToast === 'function')
      showToast(`${u.name} ${shouldLock ? 'locked' : 'unlocked'}.`, shouldLock ? 'warning' : 'success');
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

  /* ─── View / Delete Transactions Modal ───────────────────── */
  let _txModalRows = [];           // last-loaded transactions for the open user
  let _txModalSelected = new Set();// ids selected via checkbox

  function _renderTxModalRows() {
    const tbody = document.getElementById('view-history-tbody');
    if (!tbody) return;
    if (!_txModalRows.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted2);padding:1.5rem">No transactions for this user.</td></tr>';
      return;
    }
    const fmtMoney = v => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 });
    tbody.innerHTML = _txModalRows.map(t => {
      const checked = _txModalSelected.has(String(t.id)) ? 'checked' : '';
      const amtClr  = t.type === 'credit' ? 'var(--green,#22c55e)' : 'var(--red,#ef4444)';
      const sign    = t.type === 'credit' ? '+' : '−';
      const dateStr = t.date ? new Date(t.date).toLocaleDateString('en-US') : '—';
      return `
        <tr data-id="${t.id}">
          <td><input type="checkbox" class="tx-row-check" data-id="${t.id}" ${checked} /></td>
          <td style="color:var(--muted2);white-space:nowrap">${dateStr}</td>
          <td><span class="badge badge-muted">${t.type}</span></td>
          <td style="text-align:right;font-weight:600;color:${amtClr}">${sign}${fmtMoney(Math.abs(t.amount))}</td>
          <td>${t.merchant || '—'}</td>
          <td style="color:var(--muted2)">${t.category || '—'}</td>
          <td><button class="btn btn-danger btn-sm tx-delete-one" data-id="${t.id}" title="Delete this transaction" style="padding:0.25rem 0.5rem">×</button></td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.tx-row-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = String(cb.dataset.id);
        cb.checked ? _txModalSelected.add(id) : _txModalSelected.delete(id);
        _updateTxModalSelCount();
      });
    });
    tbody.querySelectorAll('.tx-delete-one').forEach(btn => {
      btn.addEventListener('click', () => _deleteTxIds([String(btn.dataset.id)]));
    });
    _updateTxModalSelCount();
  }

  function _updateTxModalSelCount() {
    const el = document.getElementById('view-history-sel-count');
    const btn = document.getElementById('view-history-bulk-delete');
    const checkAll = document.getElementById('view-history-check-all');
    if (el) el.textContent = `${_txModalSelected.size} selected`;
    if (btn) btn.disabled = _txModalSelected.size === 0;
    if (checkAll) checkAll.checked = _txModalRows.length > 0 && _txModalSelected.size === _txModalRows.length;
  }

  async function _deleteTxIds(ids) {
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} transaction${ids.length === 1 ? '' : 's'}? Account balance will be reverted. This cannot be undone.`)) return;
    const res = await VaultStore.deleteTransactions(ids);
    if (!res.ok) {
      if (typeof showToast === 'function') showToast(res.error || 'Delete failed.', 'error');
      return;
    }
    const dead = new Set(ids.map(String));
    _txModalRows = _txModalRows.filter(t => !dead.has(String(t.id)));
    ids.forEach(id => _txModalSelected.delete(String(id)));
    _renderTxModalRows();
    // Mirror the reverted balance into window.usersData so the user row
    // and the modal header line both update without a full page reload.
    if (Array.isArray(res.adjustments)) {
      const fresh = VaultStore.getUsers();
      res.adjustments.forEach(adj => {
        const cached = fresh.find(u => u.id === adj.userId);
        if (cached) {
          const row = window.usersData?.find(x => String(x.id) === String(adj.userId));
          if (row) row.balance = cached.balance;
        }
      });
      if (typeof renderUsersTable === 'function') renderUsersTable();
      const overlay  = document.getElementById('view-history-modal-overlay');
      const headerId = overlay?.dataset.userId;
      const headerU  = window.usersData?.find(x => String(x.id) === String(headerId));
      const balEl    = document.getElementById('view-history-user-balance');
      if (headerU && balEl) balEl.textContent = `Current balance: $${headerU.balance.toLocaleString()} · ${headerU.email}`;
    }
    if (typeof showToast === 'function') showToast(`Deleted ${res.deleted ?? ids.length} · balance reverted.`, 'success');
  }

  window.openTxHistoryModal = async function (id) {
    const u = window.usersData.find(x => String(x.id) === String(id));
    if (!u) return;
    const overlay = document.getElementById('view-history-modal-overlay');
    if (!overlay) return;
    overlay.dataset.userId = id;
    document.getElementById('view-history-user-name').textContent    = u.name;
    document.getElementById('view-history-user-balance').textContent = `Current balance: $${u.balance.toLocaleString()} · ${u.email}`;
    overlay.style.display  = 'flex';
    overlay.removeAttribute('aria-hidden');
    _txModalRows = [];
    _txModalSelected.clear();
    const tbody = document.getElementById('view-history-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted2);padding:1.5rem">Loading…</td></tr>';
    _txModalRows = await VaultStore.adminListUserTransactions(id, 500);
    _renderTxModalRows();
  };

  function _closeTxHistoryModal() {
    const o = document.getElementById('view-history-modal-overlay');
    if (o) { o.style.display = 'none'; o.setAttribute('aria-hidden', 'true'); }
    _txModalRows = [];
    _txModalSelected.clear();
  }

  document.getElementById('view-history-close')?.addEventListener('click', _closeTxHistoryModal);
  document.getElementById('view-history-cancel-btn')?.addEventListener('click', _closeTxHistoryModal);
  document.getElementById('view-history-modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) _closeTxHistoryModal();
  });
  document.getElementById('view-history-check-all')?.addEventListener('change', e => {
    if (e.target.checked) _txModalRows.forEach(t => _txModalSelected.add(String(t.id)));
    else                  _txModalSelected.clear();
    _renderTxModalRows();
  });
  document.getElementById('view-history-select-all')?.addEventListener('click', () => {
    _txModalRows.forEach(t => _txModalSelected.add(String(t.id)));
    _renderTxModalRows();
  });
  document.getElementById('view-history-clear-sel')?.addEventListener('click', () => {
    _txModalSelected.clear();
    _renderTxModalRows();
  });
  document.getElementById('view-history-bulk-delete')?.addEventListener('click', () => {
    _deleteTxIds(Array.from(_txModalSelected));
  });

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
