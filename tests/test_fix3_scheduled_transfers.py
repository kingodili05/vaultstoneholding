"""
Fix 3: No hardcoded scheduled transfer items; empty state shown instead.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from conftest import inject_auth_and_load_dashboard
from playwright.sync_api import sync_playwright

def test_no_hardcoded_scheduled_items():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        inject_auth_and_load_dashboard(page)

        # Switch to Transfers panel, then Scheduled sub-tab
        page.evaluate("() => { document.querySelector('[data-panel=\"transfers\"]')?.click(); }")
        page.wait_for_timeout(300)
        page.evaluate("() => { document.querySelector('[data-tab=\"scheduled\"]')?.click(); }")
        page.wait_for_timeout(300)

        items = page.evaluate("() => document.querySelectorAll('#sched-list .sched-item').length")
        empty_msg = page.evaluate("() => document.querySelector('#sched-list p') !== null")

        print(f"[Fix 3] sched-item count = {items} (want 0) : {'PASS' if items == 0 else 'FAIL'}")
        print(f"[Fix 3] empty state shown = {empty_msg} : {'PASS' if empty_msg else 'FAIL'}")
        assert items == 0, f"Expected 0 hardcoded items, got {items}"
        assert empty_msg, "Empty state message not rendered"

        browser.close()

if __name__ == '__main__':
    test_no_hardcoded_scheduled_items()
