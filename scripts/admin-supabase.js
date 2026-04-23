'use strict';

/**
 * admin-supabase.js
 * Loads AFTER admin.js. Fetches real data from Supabase and replaces
 * the hardcoded usersData / txData arrays so all admin actions hit the DB.
 */
(async function () {
  if (typeof VaultStore === 'undefined' || !VaultStore.ready) return;

  await VaultStore.ready;

  // Require admin role
  if (!VaultStore.requireAdmin('login.html')) return;

  // Load all admin data
  const { users, transfers, transactions } = await VaultStore.loadAdminData();

  /* ─── Override global usersData used by renderUsersTable ─── */
  const toAdminRow = u => ({
    id:       u.id,        // UUID now, not integer
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

  // Override the sort/filter state and re-render
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
  // View user — opens detail modal
  window.openViewUser = function (id) {
    const u = window.usersData.find(x => x.id === id);
    if (!u) return;
    if (typeof showToast === 'function')
      showToast(`Viewing ${u.name} — Status: ${u.status}`, 'info');
  };

  // Edit user (stub — extend as needed)
  window.openEditUser = function (id) {
    if (typeof showToast === 'function')
      showToast('Edit functionality: update via Supabase Dashboard or extend this panel.', 'info');
  };

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

})();
