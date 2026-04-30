"""
Test F1 — forgot-password.html wired to real Supabase auth.
Verifies:
  - Step 1 submit calls resetPasswordForEmail (spy)
  - Step 2 submit calls verifyOtp (spy); wrong code shows error, correct code advances
  - Step 3 submit calls updateUser (spy); success shows step-success panel
"""
from playwright.sync_api import sync_playwright
from conftest import BASE_URL

# Extended mock SDK: adds resetPasswordForEmail spy
F1_SDK = """
(function () {
  'use strict';

  var _calls = {};
  function record(name, args) {
    _calls[name] = (_calls[name] || 0) + 1;
    _calls[name + '_last'] = args;
  }
  window.__fpCalls = _calls;

  var _otpShouldFail = false;
  window.__setOtpFail = function(v) { _otpShouldFail = v; };

  function createClient() {
    return {
      auth: {
        resetPasswordForEmail: function (email, opts) {
          record('resetPasswordForEmail', { email: email, opts: opts });
          return Promise.resolve({ error: null });
        },
        verifyOtp: function (payload) {
          record('verifyOtp', payload);
          if (_otpShouldFail) {
            return Promise.resolve({ data: null, error: { message: 'Invalid token' } });
          }
          return Promise.resolve({ data: { user: { id: 'mock' } }, error: null });
        },
        updateUser: function (payload) {
          record('updateUser', payload);
          return Promise.resolve({ data: { user: { id: 'mock' } }, error: null });
        },
        onAuthStateChange: function (cb) {
          return { data: { subscription: { unsubscribe: function(){} } } };
        },
        getSession: function () {
          return Promise.resolve({ data: { session: null }, error: null });
        },
        signOut: function () { return Promise.resolve({ error: null }); },
      },
      from: function () {
        var qb = {};
        qb.select = function() { return qb; };
        qb.eq     = function() { return qb; };
        qb.single = function() { return Promise.resolve({ data: null, error: null }); };
        qb.then   = function(ok) { return Promise.resolve({ data: null, error: null }).then(ok); };
        return qb;
      },
      rpc: function() { return Promise.resolve({ data: null, error: null }); },
      channel: function() { return { on: function(){ return this; }, subscribe: function(){ return this; } }; },
      removeChannel: function() {},
    };
  }

  window.supabase = { createClient: createClient };
})();
"""


def load_forgot_password(page):
    page.route("**/supabase-js*", lambda r: r.fulfill(
        status=200, content_type="application/javascript; charset=utf-8", body=F1_SDK,
    ))
    for pat in ["**/tawk.to/**", "**/fonts.googleapis.com/**",
                "**/fonts.gstatic.com/**", "**/cdnjs.cloudflare.com/**"]:
        page.route(pat, lambda r: r.abort())
    page.goto(f"{BASE_URL}/forgot-password.html", wait_until="networkidle", timeout=20_000)
    page.wait_for_function("typeof window.supabase !== 'undefined'", timeout=10_000)
    page.wait_for_timeout(500)


def fill_otp(page, code):
    inputs = page.locator('.otp-input')
    for i, ch in enumerate(code[:6]):
        inputs.nth(i).fill(ch)
    page.wait_for_timeout(200)


# ── Test 1: Step 1 calls resetPasswordForEmail ────────────────────────────────
def test_F1_step1_calls_reset():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        load_forgot_password(page)

        # Fill email and submit step 1
        page.fill('#email', 'user@example.com')
        page.locator('#form-step-1 button[type="submit"]').click()
        page.wait_for_timeout(800)

        calls = page.evaluate("window.__fpCalls")
        assert calls.get('resetPasswordForEmail', 0) >= 1, \
            f"resetPasswordForEmail not called. calls={calls}"

        # Should have advanced to step 2
        step2_active = page.evaluate("document.getElementById('step-2').classList.contains('active')")
        assert step2_active, "Did not advance to step-2 after successful resetPasswordForEmail"

        print("F1 step1: resetPasswordForEmail called, advanced to step-2 : PASS")
        browser.close()


# ── Test 2: Step 2 wrong OTP shows error ─────────────────────────────────────
def test_F1_step2_wrong_otp_shows_error():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        load_forgot_password(page)

        # Advance to step 2
        page.fill('#email', 'user@example.com')
        page.locator('#form-step-1 button[type="submit"]').click()
        page.wait_for_timeout(800)

        # Make OTP verify fail
        page.evaluate("window.__setOtpFail(true)")

        fill_otp(page, '123456')
        page.locator('#form-step-2 button[type="submit"]').click()
        page.wait_for_timeout(800)

        calls = page.evaluate("window.__fpCalls")
        assert calls.get('verifyOtp', 0) >= 1, f"verifyOtp not called. calls={calls}"

        # Step 3 must NOT be active — should still be on step 2
        step3_active = page.evaluate("document.getElementById('step-3').classList.contains('active')")
        assert not step3_active, "Should remain on step-2 after wrong OTP"

        otp_err_visible = page.evaluate(
            "document.getElementById('otp-error').classList.contains('show')"
        )
        assert otp_err_visible, "otp-error element should be visible after wrong OTP"

        print("F1 step2 wrong OTP: verifyOtp called, error shown, stayed on step-2 : PASS")
        browser.close()


# ── Test 3: Step 2 correct OTP advances to step 3 ────────────────────────────
def test_F1_step2_correct_otp_advances():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        load_forgot_password(page)

        # Advance to step 2
        page.fill('#email', 'user@example.com')
        page.locator('#form-step-1 button[type="submit"]').click()
        page.wait_for_timeout(800)

        # OTP will succeed (default)
        fill_otp(page, '654321')
        page.locator('#form-step-2 button[type="submit"]').click()
        page.wait_for_timeout(800)

        step3_active = page.evaluate("document.getElementById('step-3').classList.contains('active')")
        assert step3_active, "Should have advanced to step-3 after correct OTP"

        print("F1 step2 correct OTP: advanced to step-3 : PASS")
        browser.close()


# ── Test 4: Step 3 calls updateUser and shows success ────────────────────────
def test_F1_step3_updates_password():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        load_forgot_password(page)

        # Navigate to step 2
        page.fill('#email', 'user@example.com')
        page.locator('#form-step-1 button[type="submit"]').click()
        page.wait_for_timeout(800)

        # Advance to step 3
        fill_otp(page, '654321')
        page.locator('#form-step-2 button[type="submit"]').click()
        page.wait_for_timeout(800)

        # Fill valid password
        page.fill('#new-password', 'NewPass123!')
        page.fill('#confirm-password', 'NewPass123!')
        page.locator('#form-step-3 button[type="submit"]').click()
        page.wait_for_timeout(800)

        calls = page.evaluate("window.__fpCalls")
        assert calls.get('updateUser', 0) >= 1, f"updateUser not called. calls={calls}"

        # Should show success panel
        success_active = page.evaluate(
            "document.getElementById('step-success').classList.contains('active')"
        )
        assert success_active, "step-success panel not shown after updateUser success"

        print("F1 step3: updateUser called, step-success shown : PASS")
        browser.close()


if __name__ == '__main__':
    test_F1_step1_calls_reset()
    test_F1_step2_wrong_otp_shows_error()
    test_F1_step2_correct_otp_advances()
    test_F1_step3_updates_password()
