'use strict';

/**
 * signup-integration.js
 * Wires the multi-step signup form to Supabase Auth via VaultStore.createUser().
 * Loads after auth.js so the 3-D scene and step navigation are already initialised.
 */
(async function () {
  if (typeof VaultStore === 'undefined') return;

  await VaultStore.ready;

  // Already logged in → redirect
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

    // Clone to strip auth.js's existing listener
    const btn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(btn, oldBtn);

    btn.addEventListener('click', async () => {
      const otpInputs = [...document.querySelectorAll('.otp-input')];
      const otp = otpInputs.map(i => i.value).join('');

      // Validate OTP length
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

      // Collect form data from all steps
      const firstName   = (document.getElementById('first-name')?.value    || '').trim();
      const lastName    = (document.getElementById('last-name')?.value     || '').trim();
      const email       = (document.getElementById('signup-email')?.value  || '').trim().toLowerCase();
      const dob         =  document.getElementById('dob')?.value           || '';
      const country     =  document.getElementById('country')?.value       || 'US';
      const password    =  document.getElementById('signup-password')?.value || '';
      const phone       = (document.getElementById('phone')?.value         || '').trim();
      const typeCard    =  document.querySelector('.account-type-card.selected');
      const accountType =  typeCard?.dataset.type || 'personal';

      btn.classList.add('loading');
      btn.disabled = true;

      // Create Supabase auth user + profile (via trigger)
      const result = await VaultStore.createUser({
        name: `${firstName} ${lastName}`.trim(),
        email,
        password,
        phone,
        accountType,
        country,
        dob,
      });

      if (!result.ok) {
        btn.classList.remove('loading');
        btn.disabled = false;

        let errEl = document.querySelector('.signup-server-error');
        if (!errEl) {
          errEl = document.createElement('p');
          errEl.className = 'signup-server-error';
          errEl.style.cssText = 'color:#EF4444;font-size:0.8125rem;text-align:center;margin-bottom:0.5rem;';
          btn.closest('.step-nav')?.before(errEl);
        }
        errEl.textContent = result.error || 'Something went wrong. Please try again.';
        setTimeout(() => errEl.remove(), 6000);
        return;
      }

      // Auto-login
      const loginResult = await VaultStore.login(email, password);
      if (!loginResult.ok) {
        // Account created but email confirmation may be required
        const overlay = document.getElementById('success-overlay');
        if (overlay) {
          const sub = overlay.querySelector('p');
          if (sub) sub.textContent = 'Account created! Please check your email to confirm, then log in.';
          overlay.classList.add('visible');
        }
        setTimeout(() => { window.location.href = 'login.html'; }, 3000);
        return;
      }

      // Success: confetti + redirect to KYC
      if (typeof triggerConfetti === 'function') triggerConfetti();

      const overlay = document.getElementById('success-overlay');
      if (overlay) {
        const sub = overlay.querySelector('p');
        if (sub) sub.textContent = 'Welcome to Vaultstone. Redirecting to identity verification…';
        overlay.classList.add('visible');
      }

      setTimeout(() => { window.location.href = 'kyc.html'; }, 2200);
    });
  });
})();
