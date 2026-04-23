'use strict';

/**
 * dashboard-supabase.js
 * Loads AFTER dashboard.js. Waits for VaultStore.ready, then re-runs
 * loadUserData() so the dashboard renders with live Supabase data instead
 * of the localStorage fallback.
 */
(async function () {
  if (typeof VaultStore === 'undefined' || !VaultStore.ready) return;

  // Wait for Supabase session + profile to be in cache
  await VaultStore.ready;

  const user = VaultStore.requireAuth('login.html');
  if (!user) return;

  // Load all dashboard data in parallel (fills in-memory caches)
  await VaultStore.loadDashboardData(user.id);

  // Re-populate the UI with live data
  if (typeof loadUserData === 'function') {
    loadUserData();
  }

  // Patch transfer form to use async VaultStore.createTransfer
  const form = document.getElementById('transfer-form');
  if (form) {
    // Remove existing listener (wireTransferForm attached one in dashboard.js)
    const fresh = form.cloneNode(true);
    form.parentNode.replaceChild(fresh, form);

    fresh.addEventListener('submit', async (e) => {
      e.preventDefault();

      const recipientInput = document.getElementById('recipient-input');
      const amountInput    = document.getElementById('transfer-amount');
      const noteInput      = document.getElementById('transfer-note');
      const currencyEl     = document.getElementById('transfer-currency');

      const recipient = recipientInput?.value?.trim();
      const amount    = parseFloat(amountInput?.value || '0');
      if (!recipient || !amount || amount <= 0) {
        if (typeof showToast === 'function') showToast('Please fill in all required fields.', 'warning');
        return;
      }
      if (amount > user.balance) {
        if (typeof showToast === 'function') showToast('Insufficient funds for this transfer.', 'error');
        return;
      }

      // Find internal recipient by name
      const allUsers  = VaultStore.getUsers();
      const recipUser = allUsers.find(u => u.name.toLowerCase() === recipient.toLowerCase() && u.id !== user.id);

      const btn = fresh.querySelector('[type=submit]');
      if (btn) { btn.disabled = true; btn.classList.add('loading'); }

      await VaultStore.createTransfer({
        fromUserId:      user.id,
        fromName:        user.name,
        toUserId:        recipUser?.id || null,
        toName:          recipient,
        toAccountNumber: recipUser?.accountNumber || document.getElementById('ext-account-number')?.value || '',
        toBank:          recipUser ? 'Vaultstone Bank' : (document.getElementById('ext-bank-name')?.value || 'External Bank'),
        amount,
        currency:        currencyEl?.value || 'USD',
        note:            noteInput?.value?.trim() || '',
        type:            recipUser ? 'internal' : 'external',
      });

      if (btn) { btn.disabled = false; btn.classList.remove('loading'); }

      const orb  = document.getElementById('transfer-orb');
      const path = document.querySelector('.transfer-path');
      const destName = document.getElementById('dest-node-name');
      if (destName) destName.textContent = recipient;

      if (orb && window.gsap) {
        orb.style.display = 'block';
        const pathW = document.querySelector('.transfer-scene')?.offsetWidth || 200;
        if (path) path.classList.add('animating');
        gsap.fromTo(orb, { x: 0, opacity: 1, scale: 1 }, {
          x: pathW, opacity: 0, scale: 0.3, duration: 0.9, ease: 'power2.in',
          onComplete: () => {
            orb.style.display = 'none';
            if (path) path.classList.remove('animating');
            if (typeof showToast === 'function')
              showToast(`Transfer of $${amount.toLocaleString()} to ${recipient} submitted for approval.`, 'success');
            fresh.reset();
            if (destName) destName.textContent = 'Recipient';
          },
        });
      } else {
        if (typeof showToast === 'function')
          showToast(`Transfer of $${amount.toLocaleString()} to ${recipient} submitted.`, 'success');
        fresh.reset();
      }
    }, true);
  }

  // Patch mark-all-read button
  document.getElementById('mark-all-read-btn')?.addEventListener('click', async () => {
    await VaultStore.markAllRead(user.id);
    await VaultStore._loadNotifications?.(user.id);
    if (typeof loadNotifications === 'function') loadNotifications(user.id);
    if (typeof showToast === 'function') showToast('All notifications marked as read.', 'info');
  });

  // Patch notification click mark-as-read (override the sync version)
  VaultStore.on('notification', () => {
    const badge = document.getElementById('notif-badge');
    const count = VaultStore.getUnreadCount(user.id);
    if (badge) {
      badge.textContent    = count > 9 ? '9+' : count;
      badge.style.display  = count > 0 ? 'flex' : 'none';
    }
  });

  // Subscribe to real-time notifications
  VaultStore.subscribeToNotifications(user.id, () => {
    const count = VaultStore.getUnreadCount(user.id);
    const badge = document.getElementById('notif-badge');
    if (badge) {
      badge.textContent   = count > 9 ? '9+' : count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
    if (typeof showToast === 'function') showToast('New notification received.', 'info');
  });

  // Patch profile update form
  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name  = document.getElementById('profile-name')?.value.trim();
      const phone = document.getElementById('profile-phone')?.value.trim();
      if (!name) return;
      await VaultStore.updateUser(user.id, { name, phone });
      if (typeof showToast === 'function') showToast('Profile updated successfully.', 'success');
    });
  }

  // Patch password change form
  const pwForm = document.getElementById('password-form');
  if (pwForm) {
    pwForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const np = pwForm.querySelector('[name=new-password]')?.value;
      const cp = pwForm.querySelector('[name=confirm-password]')?.value;
      if (!np || np.length < 8) { if (typeof showToast === 'function') showToast('Password must be at least 8 characters.', 'error'); return; }
      if (np !== cp)            { if (typeof showToast === 'function') showToast('Passwords do not match.', 'error'); return; }
      const { error } = await window._sb.auth.updateUser({ password: np });
      if (error) {
        if (typeof showToast === 'function') showToast(error.message, 'error');
      } else {
        if (typeof showToast === 'function') showToast('Password changed successfully.', 'success');
        pwForm.reset();
      }
    });
  }

  // Patch logout button
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    if (typeof showToast === 'function') showToast('Logging out…', 'info');
    await VaultStore.logout();
    setTimeout(() => { window.location.href = 'login.html'; }, 800);
  });

})();
