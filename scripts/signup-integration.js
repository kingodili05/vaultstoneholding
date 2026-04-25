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

// Save draft on every [data-next] click so we know which step they reached
function wireNextSave() {
  document.querySelectorAll('[data-next]').forEach(btn => {
    btn.addEventListener('click', () => {
      // current active panel tells us the step they just completed
      const active = document.querySelector('.step-panel.active');
      if (!active) return;
      const completedStep = parseInt(active.id.replace('step-', ''), 10);
      if (!isNaN(completedStep)) saveDraft(completedStep + 1);
    }, true); // capture phase — runs before auth.js validation
  });
}

/* ── Email confirmation ────────────────────────────────────── */
function getRedirectUrl() {
  return window.location.origin + '/kyc.html';
}

let _skipNextStep4Send = false;

async function registerAndSendConfirmation() {
  const { firstName, lastName, email, password, phone, country, dob, accountType } = getFormData();
  if (!email) return;

  // Always persist step 4 with current email so reload restores here
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
      await VaultStore.resendConfirmation(email);
      if (hint) hint.innerHTML =
        `Confirmation resent to<br><strong class="email-confirm-addr">${email}</strong>`;
    } else {
      if (hint) hint.innerHTML = `<span style="color:#EF4444">${result.error}</span>`;
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
    if (step4.classList.contains('active')) await registerAndSendConfirmation();
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
    setTimeout(() => { resendBtn.disabled = false; resendBtn.textContent = 'Resend email'; }, 30000);
  });
}

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

  // Use runWhenReady instead of DOMContentLoaded — handles the case where
  // VaultStore.ready resolves after DOMContentLoaded has already fired.
  runWhenReady(() => {
    watchForStep4();
    wireResendButton();
    watchForConfirmation();
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

      // auth.js exposes _signupGoToStep inside its own DOMContentLoaded.
      // If readyState is already 'complete', auth.js has run so _signupGoToStep
      // exists. If not, wait a tick for auth.js's listener to also fire first.
      const jump = () => {
        if (typeof window._signupGoToStep === 'function') {
          window._signupGoToStep(draft.step);
        }
      };
      if (document.readyState === 'loading') {
        // Both DOMContentLoaded handlers fire; auth.js registered first so it
        // runs first. A 0-tick timeout ensures we run after auth.js finishes.
        setTimeout(jump, 0);
      } else {
        jump();
      }
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
