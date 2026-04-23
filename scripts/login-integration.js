'use strict';

/* Integrates VaultStore with the existing login form in login.html.
   Runs after auth.js so the Three.js vault scene is already initialized. */

(function () {
  if (typeof VaultStore === 'undefined') return;

  // If already logged in, skip to dashboard
  const existing = VaultStore.getCurrentUser();
  if (existing) {
    window.location.href = existing.status === 'pending_kyc' ? 'kyc.html' : 'dashboard.html';
    return;
  }

  const form     = document.getElementById('login-form');
  const emailEl  = document.getElementById('login-email');
  const passEl   = document.getElementById('login-password');
  const btn      = document.getElementById('login-btn');

  // Inject error message container beneath password field
  let errEl = document.getElementById('login-error');
  if (!errEl) {
    errEl = document.createElement('p');
    errEl.id = 'login-error';
    errEl.setAttribute('role', 'alert');
    errEl.style.cssText = 'color:#EF4444;font-size:0.8125rem;margin:-0.5rem 0 0.75rem;display:none;';
    passEl.closest('.field-group').insertAdjacentElement('afterend', errEl);
  }

  function showError(msg) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
    // Shake animation on the card
    const card = form.closest('.auth-card');
    if (card && window.gsap) {
      gsap.fromTo(card, { x: -8 }, { x: 0, duration: 0.4, ease: 'elastic.out(1, 0.4)',
        keyframes: [{ x: -8 }, { x: 8 }, { x: -5 }, { x: 5 }, { x: 0 }] });
    }
  }

  function clearError() {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }

  // Demo credentials hint (remove in production)
  const hint = document.createElement('p');
  hint.style.cssText = 'font-size:0.75rem;color:var(--muted,#6B7280);margin-top:0.5rem;text-align:center;line-height:1.5';
  hint.innerHTML = 'Demo: <strong style="color:#C9A84C">alex@vaultstone.com</strong> / <strong style="color:#C9A84C">Password1!</strong>';
  form.insertAdjacentElement('afterend', hint);

  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    e.stopImmediatePropagation(); // prevent auth.js's own handler from also firing redirect

    clearError();

    const email    = emailEl.value.trim();
    const password = passEl.value;

    if (!email || !password) {
      showError('Please enter your email and password.');
      return;
    }

    // Loading state
    btn.disabled = true;
    btn.classList.add('loading');

    setTimeout(() => {
      const result = VaultStore.login(email, password);

      if (!result.ok) {
        btn.disabled = false;
        btn.classList.remove('loading');
        showError(result.error);
        return;
      }

      const user = result.user;

      // Success — let auth.js vault animation play (it uses a flag), then redirect
      setTimeout(() => {
        if (user.status === 'pending_kyc' || user.kycStatus === 'not_started') {
          window.location.href = 'kyc.html';
        } else {
          window.location.href = 'dashboard.html';
        }
      }, 1800); // matches vault door animation timing in auth.js

    }, 600); // brief spinner before hitting store
  }, true); // capture phase so we run before auth.js listener

})();
