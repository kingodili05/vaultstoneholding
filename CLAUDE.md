# CLAUDE.md
 
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vaultstone Bank is a **static-file banking web app** with no build step. All HTML pages load JavaScript and CSS via `<script>`/`<link>` tags directly. There is no bundler, package.json, or test suite. Development is editing files and refreshing the browser.

Supabase is the only backend. The database schema lives in `supabase/schema.sql`.

## Architecture

### Script loading order (every authenticated page)

```
supabase-client.js   → creates window._sb (anon)
supabase-store.js    → creates window.VaultStore IIFE; exposes all data methods
[page].js            → UI logic only; calls VaultStore.*; registers DOMContentLoaded
[page]-supabase.js   → async IIFE; awaits VaultStore.ready; replaces hardcoded data with live Supabase data
```

`[page]-supabase.js` files are the "live data patches" — they run after the UI initialises with placeholder data, then overwrite it with real Supabase records and re-render.

### One Supabase client + admin Edge Function

- `window._sb` — uses the **anon key**, subject to RLS. Used for all user-facing queries and for sending the user JWT to the admin Edge Function.
- **There is no client-side service-role key.** Any RLS-bypassing op (list_users, set_status, adjust_balance, review_kyc, insert_transactions, etc.) must call `_adminFn(action, payload)` in `supabase-store.js`, which `fetch()`s `${supabaseUrl}/functions/v1/admin` with the user's JWT in `Authorization`. The Edge Function lives in `supabase/functions/admin/index.ts` and verifies `profiles.role === 'admin'` before doing anything privileged.

### VaultStore

`supabase-store.js` is an IIFE that exposes `window.VaultStore`. It:
- Maintains in-memory caches: `_user`, `_txCache[userId]`, `_notifCache[userId]`, `_xferCache[userId]`, `_allUsers` (admin only)
- Exposes `VaultStore.ready` — a Promise that resolves once `sb.auth.getSession()` and the initial profile load complete. All page scripts must `await VaultStore.ready` before reading data.
- Routes all admin operations through `_adminFn(action, payload)` → admin Edge Function

### Admin authentication

Admin = a real Supabase auth user whose `profiles.role === 'admin'`. To promote a user:

```sql
UPDATE profiles SET role='admin' WHERE id='<auth.users.id>';
```

`VaultStore.adminLogin()` is now a no-op kept only for call-site compatibility with `admin.js`. `requireAdmin()` redirects to `login.html` unless `_user.role === 'admin'`. The Edge Function performs the real authorization check — the client-side gate is purely UX.

## Database Schema (Supabase)

Six tables: `profiles`, `accounts`, `kyc_submissions`, `transfers`, `transactions`, `notifications`.

Key invariants:
- Every `auth.users` row has exactly one `profiles` row and three `accounts` rows (checking/savings/investment), created by the `handle_new_auth_user()` trigger.
- `profiles.status` values: `active | pending_kyc | pending | suspended | locked`
- `profiles.kyc_status` values: `not_started | under_review | approved | rejected`
- Admin-only balance/status mutations go through SECURITY DEFINER functions (`admin_adjust_balance`, `admin_set_status`, `admin_review_kyc`) so they bypass RLS safely.

### Relationship queries

Do **not** use `select('*, accounts(*)')` PostgREST joins — the foreign-key relationship is not always present in Supabase's schema cache and fails silently. Fetch `profiles` and `accounts` as two separate flat queries then merge in JavaScript. `_loadAllUsers()` and `_refreshUser()` in `supabase-store.js` use this pattern.

## Key Files

| File | Role |
|------|------|
| `scripts/supabase-client.js` | Anon-key client only. **Never** put service-role keys here. |
| `scripts/supabase-store.js` | Single source of truth for all data access. Edit this for schema/query changes. |
| `scripts/admin-supabase.js` | Patches admin UI with live data; overrides `window.usersData`/`window.filteredUsers` (declared as `var` in `admin.js` so they are `window` properties). |
| `scripts/dashboard-supabase.js` | Patches user dashboard with live data; sets up real-time subscriptions. |
| `supabase/schema.sql` | Full DB schema. Run in Supabase SQL Editor to bootstrap or reset the DB. |
| `supabase/functions/admin/index.ts` | Edge Function that owns the service-role key server-side. All privileged ops dispatch through `action` field. Deploy with `supabase functions deploy admin`. |
| `styles/dashboard.css` | Shared by both `dashboard.html` and `admin.html`. |

## Coding Conventions

- **No build step** — keep all code as plain ES2020+ compatible to browsers without transpilation.
- **`var` for cross-script globals** — variables in `admin.js`/`dashboard.js` that `*-supabase.js` overwrites must be declared with `var` (not `let`/`const`) so they become `window` properties. `let`/`const` at the top level are NOT window properties.
- **Service-role key is server-only** — never reintroduce `window._sbAdmin` / `SUPABASE_SERVICE_KEY` in client code. Add new admin ops as a new `case` in `supabase/functions/admin/index.ts` and call them via `_adminFn(action, payload)` in `supabase-store.js`.
- **GSAP + CSS class transitions** — `gsap.from('.sidebar', ...)` leaves inline `transform` styles that override CSS class-based transitions. Always clear `element.style.transform = ''` and `element.style.opacity = ''` before toggling `.open` / `.closed` CSS classes on animated elements.
- **No PostgREST joins** — use separate flat queries and merge in JS (see relationship queries note above).

## Runbooks

### Rotate the service-role key

Trigger when: key was committed to git, leaked in a screenshot, shipped to a browser, shared in a ticket, or quarterly hygiene.

1. Open https://supabase.com/dashboard/project/wkkwwoalovuwhgvzprov/settings/api
2. **Project API keys** → `service_role` row → `…` menu → **Reset service_role secret** → confirm.
3. Copy the new key into `.env` (project root):
   ```
   SUPABASE_SERVICE_KEY=<new key>
   ```
4. Edge Function `admin`: **no redeploy needed**. Supabase auto-injects the fresh `SUPABASE_SERVICE_ROLE_KEY` env var into the function runtime.
5. Re-run any Node scripts that need the key:
   ```bash
   node --env-file=.env scripts/seed_hannah.mjs
   node --env-file=.env scripts/verify_hannah.mjs
   ```
6. If the leaked key was committed to git history, also run `git filter-repo` (or `git filter-branch`) to scrub it from history, then force-push — otherwise the old key remains discoverable forever via `git log -p`.

The CLI cannot perform step 2 (no `supabase keys rotate` command exists). The Management API endpoint requires a personal access token and is irreversible — always do this from the dashboard with eyes on it.

### Deploy / update the `admin` Edge Function

```bash
cd Bankwebsite
npx supabase link --project-ref wkkwwoalovuwhgvzprov --password ""   # one-time
npx supabase functions deploy admin
```

After deploy, smoke test:
```bash
curl -s -w "\nHTTP %{http_code}\n" \
  -X POST "https://wkkwwoalovuwhgvzprov.supabase.co/functions/v1/admin" \
  -H "Content-Type: application/json" -d '{"action":"list_users"}'
# expect: {"error":"Missing Authorization header"}  HTTP 401
```

### Promote a user to admin

After the user has signed up via `/signup.html` (so an `auth.users` + `profiles` row exists):

```sql
UPDATE profiles SET role='admin' WHERE email='you@example.com';
```

Then sign in with that account at `/login.html` and visit `/admin.html`. `requireAdmin()` will pass and the Edge Function will accept the JWT.
