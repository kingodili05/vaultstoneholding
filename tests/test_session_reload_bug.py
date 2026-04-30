"""
Tests for the mobile reload session bug fix.

Scenario: getSession() returns null (expired token, refresh failed) but
onAuthStateChange INITIAL_SESSION fires with a valid session from localStorage.
After the fix, dashboard must stay loaded instead of redirecting to login.
"""
from playwright.sync_api import sync_playwright
from conftest import BASE_URL, MOCK_SDK_BUNDLE, MOCK_USER_OBJ, MOCK_PROFILE

MOBILE = {"width": 390, "height": 844}

# ── SDK variants ──────────────────────────────────────────────────────────────

# Normal: both getSession and onAuthStateChange have a session
SDK_WITH_SESSION = MOCK_SDK_BUNDLE

# Broken getSession (simulates mobile token refresh failure) but
# onAuthStateChange still fires with the session from localStorage
SDK_GET_SESSION_NULL_AUTH_STATE_HAS_SESSION = MOCK_SDK_BUNDLE.replace(
    "getSession: function () {\n          return Promise.resolve({ data: { session: MOCK_SESSION }, error: null });\n        },",
    "getSession: function () {\n          return Promise.resolve({ data: { session: null }, error: null });\n        },"
)
# Note: onAuthStateChange still fires setTimeout with SIGNED_IN + MOCK_SESSION (unchanged)

# Both getSession AND onAuthStateChange return no session (truly logged out)
SDK_NO_SESSION_AT_ALL = MOCK_SDK_BUNDLE.replace(
    "getSession: function () {\n          return Promise.resolve({ data: { session: MOCK_SESSION }, error: null });\n        },",
    "getSession: function () {\n          return Promise.resolve({ data: { session: null }, error: null });\n        },"
).replace(
    "setTimeout(function () { cb('SIGNED_IN', MOCK_SESSION); }, 0);",
    "setTimeout(function () { cb('SIGNED_OUT', null); }, 0);"
)


def _setup(page, sdk_body):
    page.route("**/supabase-js*", lambda r: r.fulfill(
        status=200, content_type="application/javascript; charset=utf-8",
        body=sdk_body,
    ))
    for pat in ["**/tawk.to/**", "**/fonts.googleapis.com/**",
                "**/fonts.gstatic.com/**", "**/cdnjs.cloudflare.com/**"]:
        page.route(pat, lambda r: r.abort())


# ── Test 1: getSession=null but onAuthStateChange has session → stay on dashboard
def test_session_from_auth_state_keeps_dashboard():
    """
    The key regression test: getSession() fails (null) but onAuthStateChange
    fires with a session. Dashboard must NOT redirect to login.
    """
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport=MOBILE)
        _setup(page, SDK_GET_SESSION_NULL_AUTH_STATE_HAS_SESSION)

        page.goto(f"{BASE_URL}/dashboard.html", wait_until="networkidle", timeout=20_000)

        # Wait for VaultStore to have a user (from onAuthStateChange)
        page.wait_for_function(
            "typeof VaultStore !== 'undefined' && VaultStore.getCurrentUser() !== null",
            timeout=10_000,
        )
        page.wait_for_timeout(800)

        assert 'dashboard' in page.url, \
            f"REGRESSION: dashboard redirected to {page.url} even though onAuthStateChange had a session"

        print("Session from onAuthStateChange keeps user on dashboard : PASS")
        browser.close()


# ── Test 2: both sources null → correctly redirect to login
def test_no_session_redirects_to_login():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport=MOBILE)
        _setup(page, SDK_NO_SESSION_AT_ALL)

        page.goto(f"{BASE_URL}/dashboard.html", wait_until="networkidle", timeout=20_000)
        page.wait_for_timeout(2000)

        assert 'login' in page.url, \
            f"Expected redirect to login when truly no session, got: {page.url}"

        print("Truly logged-out user correctly redirected to login : PASS")
        browser.close()


# ── Test 3: normal session (both sources) → dashboard renders
def test_normal_session_stays_on_dashboard():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport=MOBILE)
        _setup(page, SDK_WITH_SESSION)

        page.goto(f"{BASE_URL}/dashboard.html", wait_until="networkidle", timeout=20_000)
        page.wait_for_function(
            "typeof VaultStore !== 'undefined' && VaultStore.getCurrentUser() !== null",
            timeout=10_000,
        )
        page.wait_for_timeout(500)

        assert 'dashboard' in page.url, f"Expected dashboard, got: {page.url}"
        print("Normal session stays on dashboard : PASS")
        browser.close()


if __name__ == '__main__':
    test_session_from_auth_state_keeps_dashboard()
    test_no_session_redirects_to_login()
    test_normal_session_stays_on_dashboard()
