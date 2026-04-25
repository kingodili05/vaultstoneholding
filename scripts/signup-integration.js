'use strict';

const EDGE_FN_URL = 'https://wkkwwoalovuwhgvzprov.supabase.co/functions/v1/send-email';

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

function getFormData() {
  return {
    firstName:   (document.getElementById('first-name')?.value    || '').trim(),
    lastName:    (document.getElementById('last-name')?.value     || '').trim(),
    email:       (document.getElementById('signup-email')?.value  || '').trim().toLowerCase(),
    dob:          document.getElementById('dob')?.value           || '',
    country:      document.getElementById('country')?.value       || 'US',
    phone:       (document.getElementById('phone')?.value         || '').trim(),
    accountType:  document.querySelector('.account-type-card.selected')?.dataset.type || 'personal',
    password:     document.getElementById('signup-password')?.value || '',
  };
}

// Builds the URL Supabase will redirect to after email confirmation.
// Points to kyc.html so the session is picked up automatically there.
function getRedirectUrl() {
  return window.location.origin + '/kyc.html';
}

// Called when step-4 becomes active: register the user and send the confirmation email.
async function registerAndSendConfirmation() {
  const { firstName, lastName, email, password, phone, country, dob, accountType } = getFormData();
  if (!email || !password) return;

  // Show the user's email address in the UI
  const sentEmailEl = document.getElementById('sent-email');
  if (sentEmailEl) sentEmailEl.textContent = email;

  const result = await VaultStore.createUser({
    email,
    password,
    name:             `${firstName} ${lastName}`.trim(),
    phone,
    country,
    dob,
    accountType,
    emailRedirectTo:  getRedirectUrl(),
  });

  const hint = document.getElementById('otp-hint');
  if (!result.ok) {
    // "User already registered" just means the account exists — resend the confirmation
    if (result.error && result.error.toLowerCase().includes('already registered')) {
      await VaultStore.resendConfirmation(email);
      if (hint) hint.innerHTML = `Confirmation resent to<br><strong class="email-confirm-addr">${email}</strong>`;
    } else {
      if (hint) hint.innerHTML = `<span style="color:#EF4444">${result.error}</span>`;
    }
    return;
  }

  if (hint) hint.innerHTML = `We've sent a confirmation link to<br><strong class="email-confirm-addr">${email}</strong>`;
}

function watchForStep4() {
  const step4 = document.getElementById('step-4');
  if (!step4) return;

  const observer = new MutationObserver(async (mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'class' && step4.classList.contains('active')) {
        await registerAndSendConfirmation();
      }
    }
  });

  observer.observe(step4, { attributes: true, attributeFilter: ['class'] });
}

function wireResendButton() {
  const resendBtn = document.getElementById('resend-otp');
  if (!resendBtn) return;

  resendBtn.addEventListener('click', async () => {
    resendBtn.disabled    = true;
    resendBtn.textContent = 'Sending…';

    const { email } = getFormData();
    const result = await VaultStore.resendConfirmation(email);

    resendBtn.textContent = result.ok ? 'Sent! Check your inbox.' : 'Failed — try again';
    setTimeout(() => {
      resendBtn.disabled    = false;
      resendBtn.textContent = 'Resend email';
    }, 30000);
  });
}

// Detect when the user has confirmed their email (via the link in another tab/window)
// and auto-redirect them without needing to do anything on this page.
function watchForConfirmation() {
  const sb = window._sb;
  if (!sb) return;

  sb.auth.onAuthStateChange((event, session) => {
    if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
      // User clicked the confirmation link — redirect to KYC
      const { firstName, lastName, email } = getFormData();
      callSendEmail({ type: 'welcome', email, name: `${firstName} ${lastName}`.trim() });
      if (typeof triggerConfetti === 'function') triggerConfetti();
      setTimeout(() => { window.location.href = 'kyc.html'; }, 800);
    }
  });
}

/* ── Main ─────────────────────────────────────────────────── */
(async function () {
  if (typeof VaultStore === 'undefined') return;

  await VaultStore.ready;

  // Handle magic link / confirmation redirect (user clicked link in email)
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const isConfirmRedirect = hashParams.get('type') === 'magiclink' || hashParams.get('type') === 'signup';
  if (isConfirmRedirect && VaultStore.getCurrentUser()) {
    // Session already established by supabase-js from the URL hash — go straight to KYC
    window.location.href = 'kyc.html';
    return;
  }

  const existing = VaultStore.getCurrentUser();
  if (existing) {
    window.location.href = (existing.kycStatus === 'approved' || existing.status === 'active')
      ? 'dashboard.html'
      : 'kyc.html';
    return;
  }

  document.addEventListener('DOMContentLoaded', () => {
    watchForStep4();
    wireResendButton();
    watchForConfirmation();
  });
})();

function showError(btn, message) {
  let errEl = document.querySelector('.signup-server-error');
  if (!errEl) {
    errEl = document.createElement('p');
    errEl.className  = 'signup-server-error';
    errEl.style.cssText = 'color:#EF4444;font-size:0.8125rem;text-align:center;margin-bottom:0.5rem;';
    btn.closest('.step-nav')?.before(errEl);
  }
  errEl.textContent = message;
  setTimeout(() => errEl.remove(), 6000);
}
