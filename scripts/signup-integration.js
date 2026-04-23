'use strict';

/**
 * signup-integration.js
 * Wires the multi-step signup form to Supabase Auth via VaultStore.createUser().
 * Handles:
 *  - Sending a Resend OTP email when Step 4 becomes active
 *  - Verifying the entered code before creating the account
 *  - Sending a welcome email after successful signup
 */

const EDGE_FN_URL = 'https://wkkwwoalovuwhgvzprov.supabase.co/functions/v1/send-email';

/* ── Helpers ─────────────────────────────────────────────── */
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function callSendEmail(payload) {
  try {
    const res = await fetch(EDGE_FN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ── OTP: send when Step 4 becomes active ─────────────────── */
function watchForStep4() {
  const step4 = document.getElementById('step-4');
  if (!step4) return;

  const observer = new MutationObserver(async (mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'class' && step4.classList.contains('active')) {
        const email     = (document.getElementById('signup-email')?.value || '').trim().toLowerCase();
        const firstName = (document.getElementById('first-name')?.value   || '').trim();
        if (!email) return;

        // Generate + store code (with 10-min expiry)
        const code    = generateOtp();
        const expires = Date.now() + 10 * 60 * 1000;
        sessionStorage.setItem('vault_otp',         code);
        sessionStorage.setItem('vault_otp_expires',  String(expires));
        sessionStorage.setItem('vault_otp_email',    email);

        // Update hint to show destination email
        const hint = document.getElementById('otp-hint');
        if (hint) {
          hint.textContent = `We've sent a 6-digit code to ${email}. Enter it below to complete your registration.`;
        }

        const sent = await callSendEmail({ type: 'otp', email, code, name: firstName });
        if (!sent && hint) {
          hint.innerHTML = `We've sent a 6-digit code to <strong>${email}</strong>. (If you don't see it, check spam.)`;
        }
      }
    }
  });

  observer.observe(step4, { attributes: true, attributeFilter: ['class'] });
}

/* ── Resend OTP button ────────────────────────────────────── */
function wireResendButton() {
  const resendBtn = document.getElementById('resend-otp');
  if (!resendBtn) return;

  resendBtn.addEventListener('click', async () => {
    const email     = sessionStorage.getItem('vault_otp_email') || (document.getElementById('signup-email')?.value || '').trim().toLowerCase();
    const firstName = (document.getElementById('first-name')?.value || '').trim();
    if (!email) return;

    const code    = generateOtp();
    const expires = Date.now() + 10 * 60 * 1000;
    sessionStorage.setItem('vault_otp',        code);
    sessionStorage.setItem('vault_otp_expires', String(expires));
    sessionStorage.setItem('vault_otp_email',   email);

    resendBtn.disabled    = true;
    resendBtn.textContent = 'Sending…';

    await callSendEmail({ type: 'otp', email, code, name: firstName });

    resendBtn.textContent = 'Sent!';
    setTimeout(() => {
      resendBtn.disabled    = false;
      resendBtn.textContent = 'Resend code';
    }, 30000);
  });
}

/* ── Main ─────────────────────────────────────────────────── */
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
    watchForStep4();
    wireResendButton();

    const oldBtn = document.getElementById('signup-submit');
    if (!oldBtn) return;

    // Clone to strip auth.js's existing listener
    const btn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(btn, oldBtn);

    btn.addEventListener('click', async () => {
      const otpInputs = [...document.querySelectorAll('.otp-input')];
      const entered   = otpInputs.map(i => i.value).join('');

      // Basic length check
      if (entered.length < 6) {
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

      // Verify code
      const storedCode    = sessionStorage.getItem('vault_otp')         || '';
      const storedExpires = Number(sessionStorage.getItem('vault_otp_expires') || 0);
      const isExpired     = Date.now() > storedExpires;

      if (!storedCode || isExpired || entered !== storedCode) {
        let errEl = document.querySelector('.signup-server-error');
        if (!errEl) {
          errEl = document.createElement('p');
          errEl.className  = 'signup-server-error';
          errEl.style.cssText = 'color:#EF4444;font-size:0.8125rem;text-align:center;margin-bottom:0.5rem;';
          btn.closest('.step-nav')?.before(errEl);
        }
        errEl.textContent = isExpired
          ? 'Code expired. Please click Resend code to get a new one.'
          : 'Incorrect code. Please check your email and try again.';
        otpInputs.forEach(i => i.classList.add('error'));
        setTimeout(() => errEl.remove(), 6000);
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
          errEl.className  = 'signup-server-error';
          errEl.style.cssText = 'color:#EF4444;font-size:0.8125rem;text-align:center;margin-bottom:0.5rem;';
          btn.closest('.step-nav')?.before(errEl);
        }
        errEl.textContent = result.error || 'Something went wrong. Please try again.';
        setTimeout(() => errEl.remove(), 6000);
        return;
      }

      // Clear OTP from session
      sessionStorage.removeItem('vault_otp');
      sessionStorage.removeItem('vault_otp_expires');
      sessionStorage.removeItem('vault_otp_email');

      // Send welcome email (fire-and-forget)
      callSendEmail({
        type:  'welcome',
        email,
        name:  `${firstName} ${lastName}`.trim(),
      });

      // Auto-login
      const loginResult = await VaultStore.login(email, password);
      if (!loginResult.ok) {
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
