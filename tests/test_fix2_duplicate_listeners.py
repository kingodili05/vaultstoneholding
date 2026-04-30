"""
Fix 2: Verify logout and mark-all-read each fire exactly once.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from conftest import inject_auth_and_load_dashboard
from playwright.sync_api import sync_playwright

def test_logout_fires_once():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()

        # Block the eventual redirect so the page stays alive long enough to read results
        page.route("**/login.html", lambda r: r.abort())

        inject_auth_and_load_dashboard(page)

        page.evaluate("""() => {
            window._logoutCalls = 0;
            VaultStore.logout = function() {
                window._logoutCalls++;
                return Promise.resolve({ error: null });
            };
        }""")

        page.evaluate("() => document.getElementById('logout-btn').click()")
        # Check before the 800ms redirect timer fires
        page.wait_for_timeout(400)

        calls = page.evaluate("() => window._logoutCalls")
        print(f"[Fix 2] logout call count = {calls} : {'PASS' if calls == 1 else 'FAIL'}")
        assert calls == 1, f"Expected 1 logout call, got {calls}"

        browser.close()

def test_mark_all_read_fires_once():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        inject_auth_and_load_dashboard(page)

        page.evaluate("""() => {
            window._markCalls = 0;
            VaultStore.markAllRead = function() {
                window._markCalls++;
                return Promise.resolve();
            };
        }""")

        page.evaluate("() => document.getElementById('mark-all-read-btn')?.click()")
        page.wait_for_timeout(300)

        calls = page.evaluate("() => window._markCalls")
        print(f"[Fix 2] markAllRead call count = {calls} : {'PASS' if calls == 1 else 'FAIL'}")
        assert calls == 1, f"Expected 1 markAllRead call, got {calls}"

        browser.close()

if __name__ == '__main__':
    test_logout_fires_once()
    test_mark_all_read_fires_once()
