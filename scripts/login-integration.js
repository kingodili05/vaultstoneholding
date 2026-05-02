'use strict';

/* Integrates VaultStore (Supabase) with the login form in login.html.
   Runs after auth.js so the Three.js vault scene is already initialized. */

(function () {
  if (typeof VaultStore === 'undefined') return;

  const form    = document.getElementById('login-form');
  const emailEl = document.getElementById('login-email');
  const passEl  = document.getElementById('login-password');
  const btn     = document.getElementById('login-btn');

  if (!form) return;

  // ── Brute-force protection (F4) ────────────────────────────────────────────
  let _failCount   = 0;
  let _lockedUntil = 0;

  // ── Error display ──────────────────────────────────────────────────────────
  function getErrEl() {
    let el = document.getElementById('login-error');
    if (!el) {
      el = document.createElement('p');
      el.id = 'login-error';
      el.setAttribute('role', 'alert');
      el.style.cssText = 'color:#EF4444;font-size:0.8125rem;margin:-0.5rem 0 0.75rem;display:none;';
      const anchor = passEl.closest('.field-group') || passEl.parentElement;
      anchor.insertAdjacentElement('afterend', el);
    }
    return el;
  }

  function showError(msg) {
    const errEl = getErrEl();
    errEl.textContent   = msg;
    errEl.style.display = 'block';
    const card = form.closest('.auth-card');
    if (card && window.gsap) {
      gsap.fromTo(card, { x: -8 }, {
        x: 0, duration: 0.4, ease: 'elastic.out(1, 0.4)',
        keyframes: [{ x: -8 }, { x: 8 }, { x: -5 }, { x: 5 }, { x: 0 }],
      });
    }
  }

  function clearError() {
    const errEl = document.getElementById('login-error');
    if (!errEl) return;
    errEl.style.display = 'none';
    errEl.textContent   = '';
  }

  // ── Friendly error messages (F5) ──────────────────────────────────────────
  function _friendlyError(msg) {
    const m = (msg || '').toLowerCase();
    if (m.includes('invalid login') || m.includes('invalid credentials'))
      return 'Incorrect email or password. Please try again.';
    if (m.includes('email not confirmed') || m.includes('confirm your email'))
      return 'Please verify your email address before signing in.';
    if (m.includes('rate limit') || m.includes('too many'))
      return 'Too many attempts. Please wait a moment and try again.';
    if (m.includes('network') || m.includes('fetch'))
      return 'Connection error. Please check your internet and try again.';
    return msg;
  }

  // ── Redirect with status gate (F6) ────────────────────────────────────────
  function redirectByRole(user) {
    if (user.status === 'suspended') {
      showError('Your account has been suspended. Please contact support.');
      btn.disabled    = false;
      btn.textContent = 'Sign In';
      if (typeof VaultStore.logout === 'function') VaultStore.logout();
      return;
    }
    // Locked accounts may reach the dashboard — transfers are restricted there.
    if (user.role === 'admin') {
      window.location.href = 'admin.html';
    } else if (user.status === 'pending_kyc' || user.kycStatus === 'not_started') {
      window.location.href = 'kyc.html';
    } else {
      window.location.href = 'dashboard.html';
    }
  }

  // ── OAuth — Google and Apple via Supabase signInWithOAuth ────────────────
  document.querySelectorAll('.btn--oauth').forEach(oauthBtn => {
    oauthBtn.addEventListener('click', async () => {
      const label    = oauthBtn.getAttribute('aria-label') || '';
      const provider = label.toLowerCase().includes('apple') ? 'apple' : 'google';

      oauthBtn.disabled    = true;
      oauthBtn.textContent = provider === 'apple' ? 'Connecting to Apple…' : 'Connecting to Google…';

      const redirectTo = window.location.origin + '/';

      const sb = window._sb;
      if (!sb) {
        showError('Authentication service unavailable. Please refresh and try again.');
        oauthBtn.disabled    = false;
        oauthBtn.textContent = provider === 'apple' ? 'Apple' : 'Google';
        return;
      }

      const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          queryParams: provider === 'google'
            ? { access_type: 'offline', prompt: 'consent' }
            : {},
        },
      });

      if (error) {
        showError(error.message || `Could not sign in with ${provider}. Please try again.`);
        oauthBtn.disabled    = false;
        oauthBtn.textContent = provider === 'apple' ? 'Apple' : 'Google';
      }
      // On success Supabase redirects the browser — no further action needed.
    });
  });

  // ── Submit handler ─────────────────────────────────────────────────────────
  // Uses bubble phase (removed `true` capture arg — F3) so auth.js field
  // validation also fires on submit.
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    // F3: removed e.stopImmediatePropagation() so auth.js validateField() runs
    clearError();

    // F4: lockout check
    if (Date.now() < _lockedUntil) {
      const secsLeft = Math.ceil((_lockedUntil - Date.now()) / 1000);
      showError(`Too many failed attempts. Please wait ${secsLeft} seconds.`);
      return;
    }

    const email    = emailEl.value.trim();
    const password = passEl.value;

    if (!email || !password) {
      showError('Please enter your email and password.');
      return;
    }

    btn.disabled = true;
    btn.classList.add('loading');

    let result;
    try {
      result = await VaultStore.login(email, password);
    } catch (err) {
      btn.disabled = false;
      btn.classList.remove('loading');
      showError('Something went wrong. Please try again.');
      console.error('[login]', err);
      return;
    }

    if (!result.ok) {
      btn.disabled = false;
      btn.classList.remove('loading');

      // F4: track failures
      _failCount++;
      if (_failCount >= 5) {
        _lockedUntil = Date.now() + 30_000;
        btn.disabled = true;
        let secsLeft = 30;
        const tick = () => {
          btn.textContent = `Locked out — wait ${secsLeft}s`;
          if (secsLeft <= 0) {
            btn.disabled    = false;
            btn.textContent = 'Sign In';
            _failCount      = 0;
            return;
          }
          secsLeft--;
          setTimeout(tick, 1000);
        };
        tick();
      } else {
        // Progressive delay before re-enable
        setTimeout(() => {}, 500 * _failCount);
      }

      showError(_friendlyError(result.error));   // F5
      return;
    }

    // Successful login — reset fail counter (F4)
    _failCount = 0;

    const user = result.user;

    // Trigger vault door animation on successful login
    if (typeof window.openVaultDoor === 'function') window.openVaultDoor();
    if (typeof gsap !== 'undefined') {
      gsap.to('.auth-card', { scale: 0.96, opacity: 0.8, duration: 0.5, ease: 'power2.in', delay: 1.1 });
    }

    // Redirect based on role and KYC status (F6 status checks inside)
    setTimeout(() => redirectByRole(user), 1800);

  }); // bubble phase (no `true`) — F3

  // Check for an existing session after ready resolves — do this AFTER
  // attaching the submit listener so the form is always guarded first.
  VaultStore.ready.then(() => {
    const existing = VaultStore.getCurrentUser();
    if (!existing) return;

    // F6: gate suspended/locked users even on cached session
    if (existing.status === 'suspended') {
      VaultStore.logout();
      showError('Your account has been suspended. Please contact support.');
      return;
    }
    // Locked — let them through to dashboard where transfers will be restricted.

    btn.disabled    = true;
    btn.textContent = 'Redirecting…';
    redirectByRole(existing);
  }).catch(() => {});

})();
