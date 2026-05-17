// Diagnostic Playwright test for admin login flow.
// Captures: localStorage between pages, console messages, network failures.

import { chromium } from 'playwright';

const EMAIL    = process.env.ADMIN_EMAIL    || 'support@vaultstoneholding.com';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const BASE     = process.env.BASE_URL       || 'http://localhost:3000';
const HEADLESS = process.env.HEADLESS !== 'false';

if (!PASSWORD) { console.error('FATAL: set ADMIN_PASSWORD env var'); process.exit(1); }

const browser = await chromium.launch({ headless: HEADLESS, slowMo: HEADLESS ? 0 : 200 });
const ctx     = await browser.newContext({ ignoreHTTPSErrors: true });
const page    = await ctx.newPage();

const logs    = [];
const errors  = [];
const netFail = [];
const apiCalls = [];

page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}\n  ${err.stack?.split('\n').slice(0, 3).join('\n  ')}`));
page.on('requestfailed', req => netFail.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`));
page.on('framenavigated', f => { if (f === page.mainFrame()) logs.push(`[nav] → ${f.url()}`); });
page.on('response', async res => {
  const url = res.url();
  if (url.includes('/functions/v1/admin') || url.includes('/rest/v1/') || url.includes('/auth/v1/')) {
    let body = '';
    try { body = (await res.text()).slice(0, 300); } catch {}
    apiCalls.push(`${res.status()} ${res.request().method()} ${url.replace(/^https?:\/\/[^/]+/, '')} → ${body}`);
  }
});

async function dumpLocalStorage(label) {
  try {
    const ls = await page.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k);
        out[k] = v.length > 100 ? v.slice(0, 80) + `…(+${v.length - 80}b)` : v;
      }
      return out;
    });
    console.log(`\n--- localStorage @ ${label} ---`);
    for (const [k, v] of Object.entries(ls)) console.log(`  ${k} = ${v}`);
    if (!Object.keys(ls).length) console.log('  (empty)');
  } catch (e) { console.log(`localStorage dump failed: ${e.message}`); }
}

try {
  // ── 1. Login page ──────────────────────────────────────────────
  console.log('→ navigating to login.html');
  await page.goto(`${BASE}/login.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => typeof window.VaultStore !== 'undefined', { timeout: 10000 }).catch(() => {});
  await page.waitForFunction(() => window.VaultStore?.ready, { timeout: 10000 }).catch(() => {});

  console.log('→ filling credentials');
  await page.fill('#login-email',    EMAIL);
  await page.fill('#login-password', PASSWORD);

  console.log('→ submitting login');
  await page.click('#login-btn');

  // Wait up to 8s for VaultStore to populate _user (indicates login succeeded).
  const loginResult = await page.evaluate(async () => {
    const start = Date.now();
    while (Date.now() - start < 8000) {
      const u = window.VaultStore?.getCurrentUser?.();
      if (u) return { ok: true, user: u, ms: Date.now() - start };
      await new Promise(r => setTimeout(r, 100));
    }
    const err = document.getElementById('login-error');
    return { ok: false, err: err?.textContent || '(no error shown)', ms: 8000 };
  });
  console.log('→ login result:', JSON.stringify(loginResult).slice(0, 300));

  await dumpLocalStorage('after login, still on /login');

  // Wait for the setTimeout(redirectByRole, 1800) to fire
  await page.waitForTimeout(2500);

  console.log('→ URL after login wait:', page.url());

  await dumpLocalStorage('after redirect fires');

  // ── 2. Force-navigate to admin if not auto-redirected ───────────
  if (!page.url().includes('admin')) {
    console.log('→ no auto-redirect to admin; navigating manually');
    await page.goto(`${BASE}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }

  await dumpLocalStorage('immediately after /admin load');

  // Watch for redirects every 1s
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    console.log(`→ t=${i+1}s url=${page.url()}`);
    if (!page.url().includes('admin')) {
      console.log(`  ✗ bounced off /admin at t=${i+1}s`);
      break;
    }
  }

  // Final state inspection (no need to retry — should be stable now)
  const stats = await page.evaluate(async () => {
    let sess = null;
    try { sess = (await window._sb?.auth?.getSession())?.data?.session; } catch {}
    return {
      url:        location.href,
      title:      document.title,
      vaultStore: typeof window.VaultStore,
      hasSb:      typeof window._sb,
      hasSession: !!sess,
      sessUserId: sess?.user?.id || null,
      sessEmail:  sess?.user?.email || null,
      vaultUser:  window.VaultStore?.getCurrentUser?.() || null,
      readyState: document.readyState,
      bodyText:   document.body?.innerText?.slice(0, 200) || '(no body)',
    };
  }).catch(e => ({ error: 'evaluate failed: ' + e.message, url: page.url() }));

  await page.screenshot({ path: 'test_admin.png', fullPage: true }).catch(() => {});

  console.log('\n═══ FINAL STATS ═══');
  console.log(JSON.stringify(stats, null, 2));

} finally {
  console.log('\n═══ CONSOLE (all) ═══');
  logs.forEach(l => console.log(l));

  console.log('\n═══ PAGE ERRORS ═══');
  if (!errors.length) console.log('(none)'); else errors.forEach(e => console.log(e));

  console.log('\n═══ NETWORK FAILURES ═══');
  if (!netFail.length) console.log('(none)'); else netFail.forEach(n => console.log(n));

  console.log('\n═══ SUPABASE API CALLS ═══');
  apiCalls.forEach(r => console.log(r));

  await browser.close();
  console.log('\n✓ done. screenshot saved to test_admin.png');
}
