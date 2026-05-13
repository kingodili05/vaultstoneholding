"""
Tests for login flow fixes F2, F3, F4, F5, F6, F10.
Each test uses the offline Supabase mock so no real network calls are made.
"""
import pytest
from playwright.sync_api import sync_playwright
from conftest import BASE_URL, MOCK_SDK_BUNDLE, MOCK_USER_OBJ, MOCK_PROFILE

# ── shared mock that starts with NO session (unauthenticated) ─────────────────
NO_SESSION_SDK = MOCK_SDK_BUNDLE.replace(
    "getSession: function () {\n          return Promise.resolve({ data: { session: MOCK_SESSION }, error: null });\n        },",
    "getSession: function () {\n          return Promise.resolve({ data: { session: null }, error: null });\n        },"
).replace(
    "setTimeout(function () { cb('SIGNED_IN', MOCK_SESSION); }, 0);",
    "/* no auto sign-in */"
)

def load_login_no_session(page):
    page.route("**/supabase-js*", lambda r: r.fulfill(
        status=200,
        content_type="application/javascript; charset=utf-8",
        body=NO_SESSION_SDK,
    ))
    for pat in ["**/tawk.to/**", "**/fonts.googleapis.com/**",
                "**/fonts.gstatic.com/**", "**/cdnjs.cloudflare.com/**"]:
        page.route(pat, lambda r: r.abort())
    page.goto(f"{BASE_URL}/login.html", wait_until="networkidle", timeout=20_000)
    page.wait_for_function("typeof VaultStore !== 'undefined'", timeout=10_000)
    page.wait_for_timeout(600)


# ── F2 — OAuth buttons trigger Supabase signInWithOAuth ─────────────────────
def test_F2_oauth_invokes_signInWithOAuth():
    """OAuth buttons should call sb.auth.signInWithOAuth (no longer 'coming soon')."""
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        load_login_no_session(page)

        # Install spy for sb.auth.signInWithOAuth (mock SDK lacks this method)
        page.evaluate("""() => {
          window.__oauthCalls = [];
          window._sb.auth.signInWithOAuth = (args) => {
            window.__oauthCalls.push(args);
            return Promise.resolve({ data: { provider: args.provider, url: '/mock' }, error: null });
          };
        }""")

        oauth_btns = page.locator('.btn--oauth')
        assert oauth_btns.count() > 0, "No .btn--oauth buttons found"
        oauth_btns.first.click()
        page.wait_for_timeout(400)

        calls = page.evaluate("() => window.__oauthCalls")
        assert len(calls) == 1, f"Expected 1 signInWithOAuth call, got {len(calls)}"
        assert calls[0]["provider"] in ("google", "apple"), f"Unexpected provider: {calls[0]}"

        print(f"F2: OAuth wired to signInWithOAuth (provider={calls[0]['provider']}) : PASS")
        browser.close()


# ── F3 — Removing stopImmediatePropagation: field validation fires on submit ──
def test_F3_field_validation_on_submit():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        load_login_no_session(page)

        # Clear both fields and submit
        page.fill('#login-email', '')
        page.fill('#login-password', '')
        page.click('#login-btn')
        page.wait_for_timeout(400)

        # auth.js validateField should have added the error class to the email input
        email_has_error = page.evaluate(
            "document.getElementById('login-email')?.classList.contains('error')"
        )
        # At minimum the login-error banner should be visible
        err_el = page.locator('#login-error')
        banner_visible = err_el.is_visible() if err_el.count() > 0 else False

        assert email_has_error or banner_visible, \
            "Expected either email .error class or login-error banner on empty submit"

        print(f"F3: Field validation fires on submit (email error={email_has_error}, banner={banner_visible}) : PASS")
        browser.close()


# ── F4 — Brute-force lockout after 5 failures ─────────────────────────────────
def test_F4_brute_force_lockout():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        load_login_no_session(page)

        # Submit 5 wrong credentials
        for i in range(5):
            page.fill('#login-email', 'alex@test.com')
            page.fill('#login-password', 'WrongPass!')
            page.click('#login-btn')
            page.wait_for_timeout(600)

        # 6th attempt — should be blocked by lockout without calling VaultStore
        page.fill('#login-email', 'alex@test.com')
        page.fill('#login-password', 'WrongPass!')

        # Track whether btn is disabled after lockout
        btn_disabled = page.evaluate("document.getElementById('login-btn')?.disabled")
        err_el = page.locator('#login-error')
        err_text = err_el.inner_text() if err_el.count() > 0 else ''

        locked = btn_disabled or 'locked' in err_text.lower() or 'wait' in err_text.lower() or 'attempt' in err_text.lower()
        assert locked, f"Expected lockout after 5 failures. btn_disabled={btn_disabled}, err={err_text!r}"

        print(f"F4: Brute-force lockout triggered after 5 failures : PASS")
        browser.close()


# ── F5 — Friendly error messages ──────────────────────────────────────────────
def test_F5_friendly_error_messages():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        load_login_no_session(page)

        # Wrong password → mock returns 'Invalid login credentials'
        page.fill('#login-email', 'alex@test.com')
        page.fill('#login-password', 'WrongPassword!')
        page.click('#login-btn')
        page.wait_for_timeout(800)

        err_el = page.locator('#login-error')
        err_text = err_el.inner_text() if err_el.count() > 0 else ''

        assert 'invalid login credentials' not in err_text.lower(), \
            f"Raw Supabase error shown to user: {err_text!r}"
        assert 'incorrect' in err_text.lower() or 'password' in err_text.lower(), \
            f"Expected friendly error, got: {err_text!r}"

        print(f"F5: Friendly error shown: {err_text!r} : PASS")
        browser.close()


# ── F6 — Suspended user blocked on cached session ────────────────────────────
def test_F6_suspended_user_blocked():
    import json

    SUSPENDED_PROFILE = dict(MOCK_PROFILE, status='suspended')

    suspended_sdk = MOCK_SDK_BUNDLE.replace(
        json.dumps(MOCK_PROFILE),
        json.dumps(SUSPENDED_PROFILE)
    )

    redirected_to = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()

        page.route("**/supabase-js*", lambda r: r.fulfill(
            status=200,
            content_type="application/javascript; charset=utf-8",
            body=suspended_sdk,
        ))
        for pat in ["**/tawk.to/**", "**/fonts.googleapis.com/**",
                    "**/fonts.gstatic.com/**", "**/cdnjs.cloudflare.com/**"]:
            page.route(pat, lambda r: r.abort())

        page.on('request', lambda req: redirected_to.append(req.url)
                if 'dashboard' in req.url else None)

        page.goto(f"{BASE_URL}/login.html", wait_until="networkidle", timeout=20_000)
        page.wait_for_function("typeof VaultStore !== 'undefined'", timeout=10_000)
        page.wait_for_timeout(1500)

        # Should NOT have redirected to dashboard
        went_to_dashboard = any('dashboard' in u for u in redirected_to)
        assert not went_to_dashboard, f"Suspended user was redirected to dashboard!"

        err_el = page.locator('#login-error')
        err_text = err_el.inner_text() if err_el.count() > 0 else ''
        assert 'suspended' in err_text.lower() or 'contact support' in err_text.lower(), \
            f"Expected suspension error, got: {err_text!r}"

        print(f"F6: Suspended user blocked — error shown: {err_text!r} : PASS")
        browser.close()


# ── F10 — Blur re-validates invalid email instead of clearing error ───────────
def test_F10_blur_revalidates():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        load_login_no_session(page)

        # Submit with bad email to trigger validation error
        page.fill('#login-email', 'notanemail')
        page.fill('#login-password', 'somepassword')
        page.click('#login-btn')
        page.wait_for_timeout(400)

        # Now blur the email field while it still has the invalid value
        page.focus('#login-email')
        page.fill('#login-email', 'stillnotvalid')
        page.evaluate("document.getElementById('login-email').dispatchEvent(new Event('blur'))")
        page.wait_for_timeout(300)

        # The error class should still be present (re-validation keeps error visible)
        still_has_error = page.evaluate(
            "document.getElementById('login-email')?.classList.contains('error')"
        )

        # Now fix the email — blur should clear the error
        page.fill('#login-email', 'valid@example.com')
        page.evaluate("document.getElementById('login-email').dispatchEvent(new Event('blur'))")
        page.wait_for_timeout(300)

        error_cleared = not page.evaluate(
            "document.getElementById('login-email')?.classList.contains('error')"
        )

        assert still_has_error, "Expected error class to persist on invalid value after blur"
        assert error_cleared, "Expected error class to clear on valid value after blur"

        print("F10: Blur re-validates correctly (invalid->error kept, valid->error cleared) : PASS")
        browser.close()


if __name__ == '__main__':
    test_F2_oauth_coming_soon()
    test_F3_field_validation_on_submit()
    test_F4_brute_force_lockout()
    test_F5_friendly_error_messages()
    test_F6_suspended_user_blocked()
    test_F10_blur_revalidates()
