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

async function sendOtp() {
  const { email, firstName, lastName, phone, country, dob, accountType } = getFormData();
  if (!email) return false;

  const hint = document.getElementById('otp-hint');
  if (hint) hint.textContent = `Sending a 6-digit code to ${email}…`;

  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const result = await VaultStore.sendOtp(email, {
    full_name:    `${firstName} ${lastName}`.trim(),
    phone,
    country,
    dob,
    account_type: accountType,
  }, redirectTo);

  if (hint) {
    hint.textContent = result.ok
      ? `We've sent a 6-digit code to ${email}. Enter it below to complete your registration.`
      : `Couldn't send a code to ${email}. Please click Resend code to try again.`;
  }
  return result.ok;
}

function watchForStep4() {
  const step4 = document.getElementById('step-4');
  if (!step4) return;

  const observer = new MutationObserver(async (mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'class' && step4.classList.contains('active')) {
        await sendOtp();
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

    await sendOtp();

    resendBtn.textContent = 'Sent!';
    setTimeout(() => {
      resendBtn.disabled    = false;
      resendBtn.textContent = 'Resend code';
    }, 30000);
  });
}

function showMagicLinkPasswordSetup() {
  const overlay = document.createElement('div');
  overlay.id = 'ml-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;';
  overlay.innerHTML = `
    <div style="background:var(--surface,#1a1a2e);border:1px solid var(--border,#333);border-radius:16px;padding:2rem;max-width:400px;width:90%;color:var(--text,#fff);">
      <h2 style="margin:0 0 0.5rem;font-size:1.4rem;">Email confirmed!</h2>
      <p style="color:var(--text2,#aaa);margin:0 0 1.5rem;font-size:0.9rem;">Set a password to complete your Vaultstone account.</p>
      <input type="password" id="ml-pw" placeholder="Password (min 8 characters)"
        style="width:100%;padding:0.75rem;border-radius:8px;border:1px solid var(--border,#444);background:var(--bg,#111);color:var(--text,#fff);font-size:0.95rem;box-sizing:border-box;margin-bottom:0.75rem;" />
      <input type="password" id="ml-pw2" placeholder="Confirm password"
        style="width:100%;padding:0.75rem;border-radius:8px;border:1px solid var(--border,#444);background:var(--bg,#111);color:var(--text,#fff);font-size:0.95rem;box-sizing:border-box;" />
      <p id="ml-err" style="color:#EF4444;font-size:0.85rem;min-height:1.4em;margin:0.5rem 0 1rem;"></p>
      <button id="ml-btn" style="width:100%;padding:0.8rem;background:var(--accent,#4F46E5);color:#fff;border:none;border-radius:8px;font-size:1rem;cursor:pointer;font-weight:600;">
        Set Password &amp; Continue
      </button>
    </div>`;
  document.body.appendChild(overlay);

  const pwEl  = overlay.querySelector('#ml-pw');
  const pw2El = overlay.querySelector('#ml-pw2');
  const errEl = overlay.querySelector('#ml-err');
  const btn   = overlay.querySelector('#ml-btn');

  btn.addEventListener('click', async () => {
    errEl.textContent = '';
    const pw = pwEl.value;
    if (pw.length < 8)    { errEl.textContent = 'Password must be at least 8 characters.'; return; }
    if (pw !== pw2El.value) { errEl.textContent = 'Passwords do not match.'; return; }

    btn.textContent = 'Saving…';
    btn.disabled = true;

    const result = await VaultStore.setPassword(pw);
    if (!result.ok) {
      errEl.textContent = result.error || 'Could not set password. Please try again.';
      btn.textContent = 'Set Password & Continue';
      btn.disabled = false;
      return;
    }

    window.location.href = 'kyc.html';
  });
}

/* ── Main ─────────────────────────────────────────────────── */
(async function () {
  if (typeof VaultStore === 'undefined') return;

  await VaultStore.ready;

  // Handle magic link redirect (user clicked link in email instead of entering code)
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const isMagicLink = hashParams.get('type') === 'magiclink' || hashParams.get('type') === 'signup';
  if (isMagicLink && VaultStore.getCurrentUser()) {
    document.addEventListener('DOMContentLoaded', showMagicLinkPasswordSetup);
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

    const oldBtn = document.getElementById('signup-submit');
    if (!oldBtn) return;

    // Clone to strip any existing listener from auth.js
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
        showError(btn, verifyResult.error || 'Incorrect or expired code. Please try again.');
        otpInputs.forEach(i => i.classList.add('error'));
        return;
      }

      const pwResult = await VaultStore.setPassword(password);

      if (!pwResult.ok) {
        btn.classList.remove('loading');
        btn.disabled = false;
        showError(btn, pwResult.error || 'Could not set password. Please try again.');
        return;
      }

      // Welcome email (fire-and-forget)
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
