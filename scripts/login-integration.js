'use strict';

/* Integrates VaultStore (Supabase) with the login form in login.html.
   Runs after auth.js so the Three.js vault scene is already initialized. */

(function () {
  if (typeof VaultStore === 'undefined') return;

  const form    = document.getElementById('login-form');
  const emailEl = document.getElementById('login-email');
  const passEl  = document.getElementById('login-password');
  const btn     = document.getElementById('login-btn');

  if (!form) return;

  // Error message element
  let errEl = document.getElementById('login-error');
  if (!errEl) {
    errEl = document.createElement('p');
    errEl.id = 'login-error';
    errEl.setAttribute('role', 'alert');
    errEl.style.cssText = 'color:#EF4444;font-size:0.8125rem;margin:-0.5rem 0 0.75rem;display:none;';
    passEl.closest('.field-group').insertAdjacentElement('afterend', errEl);
  }

  function showError(msg) {
    errEl.textContent    = msg;
    errEl.style.display  = 'block';
    const card = form.closest('.auth-card');
    if (card && window.gsap) {
      gsap.fromTo(card, { x: -8 }, {
        x: 0, duration: 0.4, ease: 'elastic.out(1, 0.4)',
        keyframes: [{ x: -8 }, { x: 8 }, { x: -5 }, { x: 5 }, { x: 0 }],
      });
    }
  }

  function clearError() {
    errEl.style.display = 'none';
    errEl.textContent   = '';
  }

  function redirectByRole(user) {
    if (user.role === 'admin') {
      window.location.href = 'admin.html';
    } else if (user.status === 'pending_kyc' || user.kycStatus === 'not_started') {
      window.location.href = 'kyc.html';
    } else {
      window.location.href = 'dashboard.html';
    }
  }

  // Attach the submit listener IMMEDIATELY — before any async work — so
  // e.preventDefault() is always in place even if VaultStore.ready is slow.
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    clearError();

    const email    = emailEl.value.trim();
    const password = passEl.value;

    if (!email || !password) {
      showError('Please enter your email and password.');
      return;
    }

    btn.disabled = true;
    btn.classList.add('loading');

    // Ensure auth state is resolved before attempting login
    await VaultStore.ready;

    const result = await VaultStore.login(email, password);

    if (!result.ok) {
      btn.disabled = false;
      btn.classList.remove('loading');
      showError(result.error);
      return;
    }

    const user = result.user;

    // Trigger vault door animation on successful login
    if (typeof window.openVaultDoor === 'function') window.openVaultDoor();
    if (typeof gsap !== 'undefined') {
      gsap.to('.auth-card', { scale: 0.96, opacity: 0.8, duration: 0.5, ease: 'power2.in', delay: 1.1 });
    }

    // Redirect based on role and KYC status
    setTimeout(() => redirectByRole(user), 1800);

  }, true);

  // Check for an existing session after ready resolves — do this AFTER
  // attaching the submit listener so the form is always guarded first.
  VaultStore.ready.then(() => {
    const existing = VaultStore.getCurrentUser();
    if (existing) redirectByRole(existing);
  });

})();
