"""
Playwright test helpers for Vaultstone Bank dashboard fixes.
Intercepts the Supabase CDN bundle and replaces it with a full offline mock
so tests never touch the real database and run completely offline.
"""
import json

BASE_URL     = "http://localhost:8080"
MOCK_USER_ID = "00000000-0000-0000-0000-000000000001"

MOCK_PROFILE = {
    "id":             MOCK_USER_ID,
    "full_name":      "Alex Johnson",
    "email":          "alex@test.com",
    "phone":          "+15551234567",
    "account_type":   "personal",
    "account_number": "4521 •••• •••• 9876",
    "role":           "user",
    "status":         "active",
    "kyc_status":     "approved",
    "avatar":         None,
    "country":        "US",
    "dob":            "1990-05-15",
    "created_at":     "2024-01-15T10:00:00Z",
    "updated_at":     "2024-01-15T10:00:00Z",
    "last_login":     "2025-01-20T08:00:00Z",
}

MOCK_ACCOUNTS = [
    {"id":"acct-chk-1","user_id":MOCK_USER_ID,"type":"checking",  "balance":15000.00,"currency":"USD","is_active":True, "created_at":"2024-01-15T10:00:00Z","updated_at":"2024-01-15T10:00:00Z"},
    {"id":"acct-sav-2","user_id":MOCK_USER_ID,"type":"savings",   "balance":8500.00, "currency":"USD","is_active":True, "created_at":"2024-01-15T10:00:00Z","updated_at":"2024-01-15T10:00:00Z"},
    {"id":"acct-inv-3","user_id":MOCK_USER_ID,"type":"investment","balance":45000.00,"currency":"USD","is_active":True, "created_at":"2024-01-15T10:00:00Z","updated_at":"2024-01-15T10:00:00Z"},
]

MOCK_USER_OBJ = {
    "id": MOCK_USER_ID, "email": "alex@test.com",
    "role": "authenticated", "aud": "authenticated",
    "email_confirmed_at": "2024-01-15T10:00:00Z",
    "user_metadata": {"full_name": "Alex Johnson"},
}

# ── This replaces the entire Supabase CDN bundle ──────────────────────────────
# supabase-client.js calls window.supabase.createClient(...) and stores the
# result in window._sb / window._sbAdmin.  We make createClient return a stub
# whose every auth / REST call resolves with our fixture data.
MOCK_SDK_BUNDLE = """
(function () {
  'use strict';
  var MOCK_USER_ID  = """ + json.dumps(MOCK_USER_ID) + """;
  var MOCK_PROFILE  = """ + json.dumps(MOCK_PROFILE) + """;
  var MOCK_ACCOUNTS = """ + json.dumps(MOCK_ACCOUNTS) + """;
  var MOCK_USER_OBJ = """ + json.dumps(MOCK_USER_OBJ) + """;
  var MOCK_SESSION  = {
    access_token: 'mock-token', refresh_token: 'mock-refresh',
    expires_at: 9999999999, expires_in: 3600, token_type: 'bearer',
    user: MOCK_USER_OBJ
  };

  /* ---------- tiny PostgREST query-builder stub ---------- */
  function qb(data) {
    var _d = data;
    function self() {}
    self.select  = function () { return self; };
    self.eq      = function () { return self; };
    self.or      = function () { return self; };
    self.neq     = function () { return self; };
    self.in      = function () { return self; };
    self.order   = function () { return self; };
    self.limit   = function () { return self; };
    self.single      = function () { return Promise.resolve({ data: Array.isArray(_d) ? (_d[0] || null) : _d, error: null }); };
    self.maybeSingle = function () { return Promise.resolve({ data: Array.isArray(_d) ? (_d[0] || null) : _d, error: null }); };
    self.then    = function (ok, err) { return Promise.resolve({ data: _d, error: null }).then(ok, err); };
    self.update  = function (payload) {
      _d = Array.isArray(_d) ? _d : Object.assign({}, _d, payload);
      return self;
    };
    self.delete  = function () { return self; };
    self.insert  = function (payload) {
      var row = Array.isArray(payload) ? payload[0] : payload;
      var saved = Object.assign({ id: 'row-' + Date.now(), created_at: new Date().toISOString() }, row);
      return qb(saved);
    };
    self.upsert  = function (payload) { return qb(payload); };
    return self;
  }

  /* ---------- no-op realtime channel ---------- */
  function makeChannel() {
    var ch = { on: function () { return ch; }, subscribe: function () { return ch; } };
    return ch;
  }

  /* ---------- createClient ---------- */
  function createClient(url, key, opts) {
    return {
      auth: {
        getSession: function () {
          return Promise.resolve({ data: { session: MOCK_SESSION }, error: null });
        },
        onAuthStateChange: function (cb) {
          /* fire once asynchronously so the store picks up the session */
          setTimeout(function () { cb('SIGNED_IN', MOCK_SESSION); }, 0);
          return { data: { subscription: { unsubscribe: function () {} } } };
        },
        signInWithPassword: function (creds) {
          /* correct email + correct password passes; wrong password fails */
          var ok = creds && creds.email === MOCK_USER_OBJ.email && creds.password === 'MockPassword123';
          return Promise.resolve(
            ok ? { data: { user: MOCK_USER_OBJ, session: MOCK_SESSION }, error: null }
               : { data: null, error: { message: 'Invalid login credentials' } }
          );
        },
        signOut: function () { return Promise.resolve({ error: null }); },
        updateUser: function (upd) {
          return Promise.resolve({ data: { user: MOCK_USER_OBJ }, error: null });
        },
        resend: function () { return Promise.resolve({ error: null }); },
        verifyOtp: function () { return Promise.resolve({ data: { user: MOCK_USER_OBJ }, error: null }); },
        signUp: function () { return Promise.resolve({ data: { user: MOCK_USER_OBJ }, error: null }); },
      },
      from: function (table) {
        if (table === 'profiles')      return qb(MOCK_PROFILE);
        if (table === 'accounts')      return qb(MOCK_ACCOUNTS);
        if (table === 'transactions')  return qb([]);
        if (table === 'transfers')     return qb([]);
        if (table === 'notifications') return qb([]);
        return qb(null);
      },
      rpc: function () { return Promise.resolve({ data: null, error: null }); },
      channel: makeChannel,
      removeChannel: function () {},
      storage: {
        from: function () {
          return { upload: function () { return Promise.resolve({ data: { path: 'mock/path' }, error: null }); } };
        }
      }
    };
  }

  window.supabase = { createClient: createClient };
})();
"""


def inject_auth_and_load_dashboard(page):
    """
    1. Serve the mock Supabase SDK bundle in place of the real CDN file.
    2. Block noisy external scripts (tawk, fonts).
    3. Navigate to dashboard.html and wait until VaultStore has a live user.
    """
    # Replace the real Supabase CDN bundle with our offline mock
    page.route("**/supabase-js*", lambda r: r.fulfill(
        status=200,
        content_type="application/javascript; charset=utf-8",
        body=MOCK_SDK_BUNDLE,
    ))
    # Silence irrelevant external requests
    for pat in ["**/tawk.to/**", "**/fonts.googleapis.com/**",
                "**/fonts.gstatic.com/**", "**/cdnjs.cloudflare.com/**",
                "**/chart.js*"]:
        page.route(pat, lambda r: r.abort())

    page.goto(f"{BASE_URL}/dashboard.html", wait_until="networkidle", timeout=20_000)

    # Wait until VaultStore.getCurrentUser() is non-null
    page.wait_for_function(
        "typeof VaultStore !== 'undefined' && VaultStore.getCurrentUser() !== null",
        timeout=10_000,
    )
    page.wait_for_timeout(500)   # let DOMContentLoaded handlers flush
