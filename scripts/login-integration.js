'use strict';

/* Integrates VaultStore (Supabase) with the login form in login.html.
   Runs after auth.js so the Three.js vault scene is already initialized. */

(async function () {
  if (typeof VaultStore === 'undefined') return;

  // Wait for Supabase auth state to resolve
  await VaultStore.ready;

  // Already logged in → skip login
  const existing = VaultStore.getCurrentUser();
  if (existing) {
    window.location.href = (existing.status === 'pending_kyc' || existing.kycStatus === 'not_started')
      ? 'kyc.html'
      : 'dashboard.html';
    return;
  }

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

    const result = await VaultStore.login(email, password);

    if (!result.ok) {
      btn.disabled = false;
      btn.classList.remove('loading');
      showError(result.error);
      return;
    }

    const user = result.user;

    // Let vault door animation play, then redirect
    setTimeout(() => {
      if (user.status === 'pending_kyc' || user.kycStatus === 'not_started') {
        window.location.href = 'kyc.html';
      } else {
        window.location.href = 'dashboard.html';
      }
    }, 1800);

  }, true);

})();
