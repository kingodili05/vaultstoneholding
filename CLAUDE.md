# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vaultstone Bank is a **static-file banking web app** with no build step. All HTML pages load JavaScript and CSS via `<script>`/`<link>` tags directly. There is no bundler, package.json, or test suite. Development is editing files and refreshing the browser.

Supabase is the only backend. The database schema lives in `supabase/schema.sql`.

## Architecture

### Script loading order (every authenticated page)

```
supabase-client.js   → creates window._sb (anon) and window._sbAdmin (service-role)
supabase-store.js    → creates window.VaultStore IIFE; exposes all data methods
[page].js            → UI logic only; calls VaultStore.*; registers DOMContentLoaded
[page]-supabase.js   → async IIFE; awaits VaultStore.ready; replaces hardcoded data with live Supabase data
```

`[page]-supabase.js` files are the "live data patches" — they run after the UI initialises with placeholder data, then overwrite it with real Supabase records and re-render.

### Two Supabase clients

- `window._sb` — uses the **anon key**, subject to RLS. Used for all user-facing queries (a user's own transactions, their own profile, etc.).
- `window._sbAdmin` — uses the **service-role key**, bypasses all RLS. Used only by `supabase-store.js` admin functions via the `_adm()` getter. Created only if `SUPABASE_SERVICE_KEY` is set in `supabase-client.js`.

### VaultStore

`supabase-store.js` is an IIFE that exposes `window.VaultStore`. It:
- Maintains in-memory caches: `_user`, `_txCache[userId]`, `_notifCache[userId]`, `_xferCache[userId]`, `_allUsers` (admin only)
- Exposes `VaultStore.ready` — a Promise that resolves once `sb.auth.getSession()` and the initial profile load complete. All page scripts must `await VaultStore.ready` before reading data.
- Uses `_adm()` (returns `_sbAdmin ?? sb`) for all admin reads/writes to bypass RLS

### Admin authentication

Admin auth is localStorage-only (no real Supabase auth user required):
- `VaultStore.adminLogin('Vaultstone@Admin2024')` writes `vs_admin_session` to localStorage
- `VaultStore.requireAdmin()` checks `_user.role === 'admin'` OR the localStorage key
- The `admin.js` `DOMContentLoaded` handler calls `adminLogin` automatically, so the password is effectively hardcoded for the demo

**Race condition to be aware of**: `admin-supabase.js` awaits `VaultStore.ready`, which resolves via microtasks (before `DOMContentLoaded`). On the very first visit with no prior localStorage session, `requireAdmin` can run before `adminLogin` has been called. This is mitigated by the fact that `adminLogin` must be called in `DOMContentLoaded` and the session persists across visits.

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
| `scripts/supabase-client.js` | Credentials + client creation. Add `SUPABASE_SERVICE_KEY` here. |
| `scripts/supabase-store.js` | Single source of truth for all data access. Edit this for schema/query changes. |
| `scripts/admin-supabase.js` | Patches admin UI with live data; overrides `window.usersData`/`window.filteredUsers` (declared as `var` in `admin.js` so they are `window` properties). |
| `scripts/dashboard-supabase.js` | Patches user dashboard with live data; sets up real-time subscriptions. |
| `supabase/schema.sql` | Full DB schema. Run in Supabase SQL Editor to bootstrap or reset the DB. |
| `styles/dashboard.css` | Shared by both `dashboard.html` and `admin.html`. |

## Coding Conventions

- **No build step** — keep all code as plain ES2020+ compatible to browsers without transpilation.
- **`var` for cross-script globals** — variables in `admin.js`/`dashboard.js` that `*-supabase.js` overwrites must be declared with `var` (not `let`/`const`) so they become `window` properties. `let`/`const` at the top level are NOT window properties.
- **`_adm()` for all admin queries** — never use `sb` directly in admin-only functions; always use `_adm()` so the service-role client is used when available.
- **GSAP + CSS class transitions** — `gsap.from('.sidebar', ...)` leaves inline `transform` styles that override CSS class-based transitions. Always clear `element.style.transform = ''` and `element.style.opacity = ''` before toggling `.open` / `.closed` CSS classes on animated elements.
- **No PostgREST joins** — use separate flat queries and merge in JS (see relationship queries note above).
