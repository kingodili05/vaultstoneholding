'use strict';

/**
 * dashboard-supabase.js
 * Loads AFTER dashboard.js. Waits for VaultStore.ready, then re-runs
 * loadUserData() so the dashboard renders with live Supabase data instead
 * of the localStorage fallback.
 */
(async function () {
  if (typeof VaultStore === 'undefined' || !VaultStore.ready) return;

  await VaultStore.ready;

  const user = VaultStore.requireAuth('login.html');
  if (!user) return;

  // Load all dashboard data in parallel (fills in-memory caches)
  await VaultStore.loadDashboardData(user.id);

  // Re-populate the UI with live data
  if (typeof loadUserData === 'function') {
    loadUserData();
  }

  // Patch mark-all-read button
  document.getElementById('mark-all-read-btn')?.addEventListener('click', async () => {
    await VaultStore.markAllRead(user.id);
    if (typeof loadNotifications === 'function') loadNotifications(user.id);
    if (typeof showToast === 'function') showToast('All notifications marked as read.', 'info');
  });

  // Update notification badge on new notification
  VaultStore.on('notification', () => {
    const badge = document.getElementById('notif-badge');
    const count = VaultStore.getUnreadCount(user.id);
    if (badge) {
      badge.textContent   = count > 9 ? '9+' : count;
      badge.style.display = count > 0 ? 'flex' : 'none';
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

  // Subscribe to real-time transfer status changes
  VaultStore.subscribeToTransfers(user.id, (eventType, transfer) => {
    if (eventType !== 'UPDATE') return;
    if (window._xferTabInit && typeof renderMyTransfers === 'function') renderMyTransfers();
    if (transfer.status === 'approved') {
      if (typeof showToast === 'function')
        showToast(`Transfer of $${transfer.amount.toLocaleString()} to ${transfer.toName} was approved!`, 'success');
      VaultStore.loadDashboardData(user.id).then(() => {
        if (typeof loadUserData === 'function') loadUserData();
      });
    } else if (transfer.status === 'rejected') {
      if (typeof showToast === 'function')
        showToast(`Transfer to ${transfer.toName} was rejected. ${transfer.rejectionReason || ''}`.trim(), 'error');
    }
  });

  // Profile update form (real save via Supabase)
  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name  = document.getElementById('profile-name')?.value.trim();
      const phone = document.getElementById('profile-phone')?.value.trim();
      if (!name) { if (typeof showToast === 'function') showToast('Name is required.', 'warning'); return; }
      const btn = profileForm.querySelector('[type=submit]');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      await VaultStore.updateUser(user.id, { name, phone });
      if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
      if (typeof showToast === 'function') showToast('Profile updated successfully.', 'success');
    });
  }

  // Password change form (real update via Supabase Auth)
  const pwForm = document.getElementById('password-form');
  if (pwForm) {
    pwForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const np = pwForm.querySelector('[name=new-password]')?.value;
      const cp = pwForm.querySelector('[name=confirm-password]')?.value;
      if (!np || np.length < 8) { if (typeof showToast === 'function') showToast('Password must be at least 8 characters.', 'error'); return; }
      if (np !== cp)            { if (typeof showToast === 'function') showToast('Passwords do not match.', 'error'); return; }
      const btn = pwForm.querySelector('[type=submit]');
      if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }
      const { error } = await window._sb.auth.updateUser({ password: np });
      if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
      if (error) {
        if (typeof showToast === 'function') showToast(error.message, 'error');
      } else {
        if (typeof showToast === 'function') showToast('Password changed successfully.', 'success');
        pwForm.reset();
      }
    });
  }

  // Logout button (real Supabase sign-out)
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    if (typeof showToast === 'function') showToast('Logging out…', 'info');
    await VaultStore.logout();
    setTimeout(() => { window.location.href = 'login.html'; }, 800);
  });

})();
