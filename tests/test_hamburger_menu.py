"""
Test the mobile hamburger menu on public pages and dashboard.
Uses a real mobile viewport (390x844, iPhone 14 size).
"""
from playwright.sync_api import sync_playwright
from conftest import BASE_URL, MOCK_SDK_BUNDLE

MOBILE_VIEWPORT = {"width": 390, "height": 844}


# ── Public nav (index.html) ───────────────────────────────────────────────────
def test_public_hamburger():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport=MOBILE_VIEWPORT)

        for pat in ["**/tawk.to/**", "**/fonts.googleapis.com/**",
                    "**/fonts.gstatic.com/**"]:
            page.route(pat, lambda r: r.abort())

        page.goto(f"{BASE_URL}/index.html", wait_until="domcontentloaded", timeout=20_000)
        page.wait_for_timeout(500)

        # hamburger button must be visible at mobile width
        toggle = page.locator('.navbar__toggle')
        assert toggle.is_visible(), "Hamburger button (.navbar__toggle) not visible on mobile"

        # menu must be hidden before click
        menu = page.locator('.navbar__mobile')
        menu_hidden_before = not menu.is_visible()
        assert menu_hidden_before, "Mobile menu is already visible before hamburger click"

        # click hamburger
        toggle.click()
        page.wait_for_timeout(300)

        # menu must now be visible
        menu_visible_after = menu.is_visible()
        assert menu_visible_after, "Mobile menu did NOT appear after hamburger click"

        # aria-expanded must be true
        aria_expanded = toggle.get_attribute("aria-expanded")
        assert aria_expanded == "true", f"aria-expanded should be 'true', got {aria_expanded!r}"

        # click hamburger again — menu should close
        toggle.click()
        page.wait_for_timeout(300)
        menu_closed = not menu.is_visible()
        assert menu_closed, "Mobile menu did NOT close after second hamburger click"

        print("Public nav hamburger: hidden -> click -> visible -> click -> hidden : PASS")
        browser.close()


# ── About / other public pages ────────────────────────────────────────────────
def test_public_hamburger_other_pages():
    pages_to_check = ["about.html", "services.html", "contact.html"]
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        for path in pages_to_check:
            page = browser.new_page(viewport=MOBILE_VIEWPORT)
            for pat in ["**/tawk.to/**", "**/fonts.googleapis.com/**",
                        "**/fonts.gstatic.com/**"]:
                page.route(pat, lambda r: r.abort())
            page.goto(f"{BASE_URL}/{path}", wait_until="domcontentloaded", timeout=20_000)
            page.wait_for_timeout(400)

            toggle = page.locator('.navbar__toggle')
            menu   = page.locator('.navbar__mobile')

            visible = toggle.is_visible()
            if not visible:
                print(f"  {path}: hamburger not visible (no navbar on this page?) : SKIP")
                page.close()
                continue

            toggle.click()
            page.wait_for_timeout(300)
            opens = menu.is_visible()
            assert opens, f"{path}: menu did NOT open after hamburger click"
            print(f"  {path}: hamburger opens menu : PASS")
            page.close()
        browser.close()


# ── Dashboard sidebar hamburger ───────────────────────────────────────────────
def test_dashboard_hamburger():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport=MOBILE_VIEWPORT)

        page.route("**/supabase-js*", lambda r: r.fulfill(
            status=200, content_type="application/javascript; charset=utf-8",
            body=MOCK_SDK_BUNDLE,
        ))
        for pat in ["**/tawk.to/**", "**/fonts.googleapis.com/**",
                    "**/fonts.gstatic.com/**", "**/cdnjs.cloudflare.com/**"]:
            page.route(pat, lambda r: r.abort())

        page.goto(f"{BASE_URL}/dashboard.html", wait_until="networkidle", timeout=20_000)
        page.wait_for_function(
            "typeof VaultStore !== 'undefined' && VaultStore.getCurrentUser() !== null",
            timeout=10_000,
        )
        page.wait_for_timeout(600)

        hamburger = page.locator('#hamburger')
        sidebar   = page.locator('#sidebar')
        overlay   = page.locator('#sidebar-overlay')

        assert hamburger.is_visible(), "#hamburger not visible at mobile width"

        # sidebar should be off-screen (translateX(-100%)) before click
        sidebar_open_before = page.evaluate(
            "document.getElementById('sidebar').classList.contains('open')"
        )
        assert not sidebar_open_before, "Sidebar already has .open class before hamburger click"

        hamburger.click()
        page.wait_for_timeout(400)

        sidebar_open_after = page.evaluate(
            "document.getElementById('sidebar').classList.contains('open')"
        )
        assert sidebar_open_after, "Sidebar did NOT get .open class after hamburger click"

        overlay_visible = page.evaluate(
            "document.getElementById('sidebar-overlay').classList.contains('visible')"
        )
        assert overlay_visible, "sidebar-overlay did not become visible after open"

        # close via overlay tap — click to the RIGHT of the sidebar (sidebar=220px, screen=390px)
        # The overlay has z-index 199, sidebar is 200, so the overlay is only hittable outside the sidebar
        page.mouse.click(340, 400)
        page.wait_for_timeout(400)
        sidebar_closed = not page.evaluate(
            "document.getElementById('sidebar').classList.contains('open')"
        )
        assert sidebar_closed, "Sidebar did NOT close when overlay was tapped outside sidebar"

        print("Dashboard hamburger: hidden -> click -> sidebar open -> overlay tap -> closed : PASS")
        browser.close()


if __name__ == '__main__':
    test_public_hamburger()
    test_public_hamburger_other_pages()
    test_dashboard_hamburger()
