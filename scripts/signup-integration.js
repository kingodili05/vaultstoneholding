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
  return window.location.origin + '/kyc.html';
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
    if (result.error && result.error.toLowerCase().includes('already registered')) {
      // Account already created — resend the OTP
      await VaultStore.resendConfirmation(email);
      if (hint) hint.innerHTML =
        `Code resent to <strong>${email}</strong>. Check your inbox.`;
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
      btn.classList.remove('loading');
      btn.disabled = false;
      otpInputs.forEach(i => i.classList.add('error'));
      showError(btn, verifyResult.error || 'Incorrect or expired code. Please try again.');
      return;
    }

    // Code verified — set password (the signUp may not have set it yet in some flows)
    const pwResult = await VaultStore.setPassword(password);
    if (!pwResult.ok) {
      btn.classList.remove('loading');
      btn.disabled = false;
      showError(btn, pwResult.error || 'Could not set password. Please try again.');
      return;
    }

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
