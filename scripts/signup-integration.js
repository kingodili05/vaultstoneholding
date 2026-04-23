'use strict';

/**
 * signup-integration.js
 * Wires the multi-step signup form to VaultStore.createUser().
 * Loads after auth.js so the 3-D scene and step navigation are
 * already initialised; replaces the submit-button listener that
 * auth.js attached so we can call VaultStore before redirecting.
 */
(function () {
  if (typeof VaultStore === 'undefined') return;

  /* ── Already logged in? Skip signup ── */
  const existing = VaultStore.getCurrentUser();
  if (existing) {
    window.location.href =
      (existing.kycStatus === 'approved' || existing.status === 'active')
        ? 'dashboard.html'
        : 'kyc.html';
    return;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const oldBtn = document.getElementById('signup-submit');
    if (!oldBtn) return;

    /* Clone to strip auth.js's existing listener */
    const btn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(btn, oldBtn);

    btn.addEventListener('click', () => {
      const otpInputs = [...document.querySelectorAll('.otp-input')];
      const otp = otpInputs.map(i => i.value).join('');

      /* Validate OTP */
      if (otp.length < 6) {
        const panel = btn.closest('.step-panel');
        if (panel) {
          panel.classList.remove('shake');
          void panel.offsetWidth;
          panel.classList.add('shake');
          panel.addEventListener('animationend', () => panel.classList.remove('shake'), { once: true });
        }
        otpInputs.forEach(i => i.classList.add('error'));
        return;
      }

      /* Collect form data from steps 1-3 */
      const firstName   = (document.getElementById('first-name')?.value    || '').trim();
      const lastName    = (document.getElementById('last-name')?.value     || '').trim();
      const email       = (document.getElementById('signup-email')?.value  || '').trim().toLowerCase();
      const dob         =  document.getElementById('dob')?.value           || '';
      const country     =  document.getElementById('country')?.value       || 'US';
      const password    =  document.getElementById('signup-password')?.value || '';
      const phone       = (document.getElementById('phone')?.value         || '').trim();
      const typeCard    =  document.querySelector('.account-type-card.selected');
      const accountType =  typeCard?.dataset.type || 'personal';

      /* Duplicate email guard */
      if (VaultStore.getUserByEmail(email)) {
        const errEl = document.createElement('p');
        errEl.style.cssText =
          'color:#EF4444;font-size:0.8125rem;text-align:center;margin-bottom:0.5rem;';
        errEl.textContent =
          'This email is already registered. Try signing in instead.';
        const nav = btn.closest('.step-nav');
        if (nav) nav.before(errEl);
        setTimeout(() => errEl.remove(), 5000);
        return;
      }

      btn.classList.add('loading');
      btn.disabled = true;

      /* Small delay so loading spinner renders */
      setTimeout(() => {
        /* Create account */
        VaultStore.createUser({
          name: `${firstName} ${lastName}`.trim(),
          email,
          password,
          phone,
          accountType,
          country,
          dob,
        });

        /* Auto-login so the KYC page has a session */
        VaultStore.login(email, password);

        /* Gold confetti + success overlay */
        if (typeof triggerConfetti === 'function') triggerConfetti();

        const overlay = document.getElementById('success-overlay');
        if (overlay) {
          const sub = overlay.querySelector('p');
          if (sub) sub.textContent = 'Welcome to Vaultstone. Redirecting to identity verification…';
          overlay.classList.add('visible');
        }

        setTimeout(() => { window.location.href = 'kyc.html'; }, 2200);
      }, 1200);
    });
  });
})();
