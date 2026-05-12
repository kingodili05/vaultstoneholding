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
  } catch { return false; }
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

/* ── Draft persistence ─────────────────────────────────────── */
const DRAFT_KEY = 'vaultstone_signup_draft';

function saveDraft(step) {
  const d = getFormData();
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      step,
      firstName:   d.firstName,
      lastName:    d.lastName,
      email:       d.email,
      dob:         d.dob,
      country:     d.country,
      phone:       d.phone,
      accountType: d.accountType,
    }));
  } catch {}
}

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
}

/* ── Google OAuth signup ───────────────────────────────────── */
function wireGoogleSignup() {
  const btn = document.getElementById('google-signup-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const sb = window._sb;
    if (!sb) return;
    btn.disabled    = true;
    btn.textContent = 'Connecting to Google…';
    const redirectTo = window.location.origin + '/';
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error) {
      btn.disabled    = false;
      btn.innerHTML   = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="18" height="18" style="flex-shrink:0"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Continue with Google`;
      // Show error near button
      const errEl = document.getElementById('google-signup-error');
      if (errEl) { errEl.textContent = error.message || 'Could not sign in with Google.'; errEl.style.display = 'block'; }
    }
    // On success browser redirects automatically — no further action needed
  });
}

function restoreFields(draft) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('first-name',   draft.firstName);
  set('last-name',    draft.lastName);
  set('signup-email', draft.email);
  set('dob',          draft.dob);
  set('country',      draft.country);
  set('phone',        draft.phone);

  if (draft.accountType) {
    document.querySelectorAll('.account-type-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.type === draft.accountType);
    });
  }
}

// Save draft on every [data-next] click
function wireNextSave() {
  document.querySelectorAll('[data-next]').forEach(btn => {
    btn.addEventListener('click', () => {
      const active = document.querySelector('.step-panel.active');
      if (!active) return;
      const completedStep = parseInt(active.id.replace('step-', ''), 10);
      if (!isNaN(completedStep)) saveDraft(completedStep + 1);
    }, true);
  });
}

/* ── OTP ───────────────────────────────────────────────────── */
function getRedirectUrl() {
  const base = window.location.href.replace(/\/[^\/]*$/, '/');
  return base + 'kyc.html';
}

let _skipNextStep4Send = false;

// Called when step-4 becomes active: register the user, Supabase sends the 6-digit code
async function registerAndSendOtp() {
  const { firstName, lastName, email, password, phone, country, dob, accountType } = getFormData();
  if (!email) return;

  saveDraft(4);

  const sentEmailEl = document.getElementById('sent-email');
  if (sentEmailEl) sentEmailEl.textContent = email;

  if (_skipNextStep4Send) {
    _skipNextStep4Send = false;
    return;
  }

  const result = await VaultStore.createUser({
    email, password,
    name:            `${firstName} ${lastName}`.trim(),
    phone, country, dob, accountType,
    emailRedirectTo: getRedirectUrl(),
  });

  const hint = document.getElementById('otp-hint');
  if (!result.ok) {
    console.error('[signup] createUser failed:', result.error);
    const raw = (result.error || '').toLowerCase();
    if (raw.includes('already registered') || raw.includes('already exists')) {
      const resend = await VaultStore.resendConfirmation(email);
      if (!resend.ok) console.error('[signup] resendConfirmation failed:', resend.error);
      if (hint) hint.innerHTML =
        `Code resent to <strong>${email}</strong>. Check your inbox and spam folder.`;
    } else if (raw.includes('rate') || raw.includes('too many')) {
      if (hint) hint.innerHTML =
        `<span style="color:#EF4444">Too many signup attempts. Wait 60 seconds then retry.</span>`;
    } else {
      if (hint) hint.innerHTML = `<span style="color:#EF4444">${result.error}</span>`;
    }
    return;
  }

  if (hint) hint.innerHTML =
    `We've sent a 6-digit code to <strong>${email}</strong>. Enter it below.`;
}

function watchForStep4() {
  const step4 = document.getElementById('step-4');
  if (!step4) return;
  new MutationObserver(async () => {
    if (step4.classList.contains('active')) await registerAndSendOtp();
  }).observe(step4, { attributes: true, attributeFilter: ['class'] });
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
    setTimeout(() => { resendBtn.disabled = false; resendBtn.textContent = 'Resend code'; }, 30000);
  });
}

// Verify button — user entered the 6-digit code
function wireVerifyButton() {
  const oldBtn = document.getElementById('signup-submit');
  if (!oldBtn) return;

  // Clone to strip any listener auth.js may have attached
  const btn = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(btn, oldBtn);

  btn.addEventListener('click', async () => {
    const otpInputs = [...document.querySelectorAll('.otp-input')];
    const token     = otpInputs.map(i => i.value).join('');

    if (token.length < 6) {
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

    const { email, firstName, lastName, password } = getFormData();

    btn.classList.add('loading');
    btn.disabled = true;

    const verifyResult = await VaultStore.verifyOtpCode(email, token);

    if (!verifyResult.ok) {
      console.error('[signup] verifyOtp failed:', verifyResult.error);
      btn.classList.remove('loading');
      btn.disabled = false;
      otpInputs.forEach(i => i.classList.add('error'));
      const raw = (verifyResult.error || '').toLowerCase();
      let msg;
      if (raw.includes('expired'))       msg = 'Code expired. Tap "Resend code" to get a new one.';
      else if (raw.includes('invalid'))  msg = 'Wrong code. Check your email — Vaultstone sent a 6-digit code.';
      else if (raw.includes('not found')) msg = 'No pending signup for this email. Restart registration.';
      else                                msg = verifyResult.error || 'Verification failed. Try again or use the link in your email.';
      showError(btn, msg);
      return;
    }

    // Password was already set by createUser() on step-4 entry — no need to set it again.
    clearDraft();
    callSendEmail({ type: 'welcome', email, name: `${firstName} ${lastName}`.trim() });
    if (typeof triggerConfetti === 'function') triggerConfetti();

    const overlay = document.getElementById('success-overlay');
    if (overlay) {
      const sub = overlay.querySelector('p');
      if (sub) sub.textContent = 'Welcome to Vaultstone. Redirecting to identity verification…';
      overlay.classList.add('visible');
    }

    setTimeout(() => { window.location.href = 'kyc.html'; }, 2200);
  });
}

// Works whether DOMContentLoaded has already fired or not
function runWhenReady(fn) {
  if (document.readyState !== 'loading') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
}

/* ── Main ─────────────────────────────────────────────────── */
(async function () {
  if (typeof VaultStore === 'undefined') return;

  await VaultStore.ready;

  // Handle confirmation redirect (user clicked link in email)
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const isConfirmRedirect = hashParams.get('type') === 'magiclink' || hashParams.get('type') === 'signup';
  if (isConfirmRedirect && VaultStore.getCurrentUser()) {
    clearDraft();
    window.location.href = 'kyc.html';
    return;
  }

  const existing = VaultStore.getCurrentUser();
  if (existing) {
    clearDraft();
    window.location.href = (existing.kycStatus === 'approved' || existing.status === 'active')
      ? 'dashboard.html' : 'kyc.html';
    return;
  }

  runWhenReady(() => {
    wireGoogleSignup();
    watchForStep4();
    wireResendButton();
    wireVerifyButton();
    wireNextSave();

    // Restore draft on reload
    const draft = loadDraft();
    if (draft && draft.step > 1) {
      restoreFields(draft);

      if (draft.step === 4) {
        _skipNextStep4Send = true;
        const sentEmailEl = document.getElementById('sent-email');
        if (sentEmailEl) sentEmailEl.textContent = draft.email || '';
      }

      const jump = () => {
        if (typeof window._signupGoToStep === 'function') {
          window._signupGoToStep(draft.step);
        }
      };
      document.readyState === 'loading' ? setTimeout(jump, 0) : jump();
    }
  });
})();

function showError(btn, message) {
  let errEl = document.querySelector('.signup-server-error');
  if (!errEl) {
    errEl = document.createElement('p');
    errEl.className = 'signup-server-error';
    errEl.style.cssText = 'color:#EF4444;font-size:0.8125rem;text-align:center;margin-bottom:0.5rem;';
    btn.closest('.step-nav')?.before(errEl);
  }
  errEl.textContent = message;
  setTimeout(() => errEl.remove(), 6000);
}
