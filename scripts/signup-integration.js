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

/* ── Draft persistence ─────────────────────────────────────── */
const DRAFT_KEY = 'signup_draft';

function saveDraft(step) {
  const { firstName, lastName, email, dob, country, phone, accountType } = getFormData();
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(
      { step, firstName, lastName, email, dob, country, phone, accountType }
    ));
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
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };
  set('first-name',    draft.firstName);
  set('last-name',     draft.lastName);
  set('signup-email',  draft.email);
  set('dob',           draft.dob);
  set('country',       draft.country);
  set('phone',         draft.phone);

  if (draft.accountType) {
    document.querySelectorAll('.account-type-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.type === draft.accountType);
    });
  }
}

// Save draft whenever any step panel becomes active
function watchStepChanges() {
  for (let i = 1; i <= 4; i++) {
    const panel = document.getElementById('step-' + i);
    if (!panel) continue;
    const step = i;
    new MutationObserver(() => {
      if (panel.classList.contains('active')) saveDraft(step);
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  }
}

/* ── Email confirmation ────────────────────────────────────── */
function getRedirectUrl() {
  return window.location.origin + '/kyc.html';
}

// Set to true when restoring to step 4 so we don't resend the confirmation email
let _skipNextStep4Send = false;

async function registerAndSendConfirmation() {
  const { firstName, lastName, email, password, phone, country, dob, accountType } = getFormData();
  if (!email) return;

  const sentEmailEl = document.getElementById('sent-email');
  if (sentEmailEl) sentEmailEl.textContent = email;

  if (_skipNextStep4Send) {
    _skipNextStep4Send = false;
    return;
  }

  const result = await VaultStore.createUser({
    email,
    password,
    name:            `${firstName} ${lastName}`.trim(),
    phone,
    country,
    dob,
    accountType,
    emailRedirectTo: getRedirectUrl(),
  });

  const hint = document.getElementById('otp-hint');
  if (!result.ok) {
    if (result.error && result.error.toLowerCase().includes('already registered')) {
      await VaultStore.resendConfirmation(email);
      if (hint) hint.innerHTML =
        `Confirmation resent to<br><strong class="email-confirm-addr">${email}</strong>`;
    } else {
      if (hint) hint.innerHTML =
        `<span style="color:#EF4444">${result.error}</span>`;
    }
    return;
  }

  if (hint) hint.innerHTML =
    `We've sent a confirmation link to<br><strong class="email-confirm-addr">${email}</strong>`;
}

function watchForStep4() {
  const step4 = document.getElementById('step-4');
  if (!step4) return;

  new MutationObserver(async () => {
    if (step4.classList.contains('active')) {
      await registerAndSendConfirmation();
    }
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
    setTimeout(() => {
      resendBtn.disabled    = false;
      resendBtn.textContent = 'Resend email';
    }, 30000);
  });
}

// Listen for Supabase auth state change — fires when user clicks the confirmation link
function watchForConfirmation() {
  const sb = window._sb;
  if (!sb) return;

  sb.auth.onAuthStateChange((event, session) => {
    if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
      clearDraft();
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
      ? 'dashboard.html'
      : 'kyc.html';
    return;
  }

  document.addEventListener('DOMContentLoaded', () => {
    watchForStep4();
    wireResendButton();
    watchForConfirmation();
    watchStepChanges();

    // Restore draft if user reloaded mid-signup
    const draft = loadDraft();
    if (draft && draft.step > 1) {
      restoreFields(draft);

      // If we're restoring to step 4, suppress the confirmation resend
      if (draft.step === 4) {
        _skipNextStep4Send = true;
        // Show email address immediately
        const sentEmailEl = document.getElementById('sent-email');
        if (sentEmailEl) sentEmailEl.textContent = draft.email || '';
      }

      // Jump to the saved step (auth.js exposes _signupGoToStep after its own DOMContentLoaded)
      setTimeout(() => {
        if (typeof window._signupGoToStep === 'function') {
          window._signupGoToStep(draft.step);
        }
      }, 0);
    }
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
