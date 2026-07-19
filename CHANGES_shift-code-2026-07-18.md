# Shift-Code Rotation — Change Log & Reference (2026-07-18)

Store portal 2-code login: added the admin-side ability to rotate the new
per-store **shift code** (`shift_code`), alongside the existing `store_code`.
Commit: `d7f7675` — "Store access: per-store shift code rotation (portal 2-code login)"

---

## What changed (code)

### 1. `server/routes/api.js` — new endpoint
Added immediately after the existing `POST /store-access/:id/rotate` block:

```js
// POST /api/store-access/:id/rotate-shift — rotate the per-store SHIFT code
router.post('/store-access/:id/rotate-shift', async (req, res) => {
  if (!checkAdminPin(req, res)) return;
  try {
    const code = 'S' + randomInt(10000, 100000);            // e.g. S48213
    const expiresAt = new Date(Date.now() + 30 * 86400000)  // +30 days
      .toISOString().split('T')[0];
    await d1Query(
      'UPDATE store_access SET shift_code = ?, shift_code_expires_at = ? WHERE id = ?',
      [code, expiresAt, req.params.id]
    );
    res.json({ ok: true, shift_code: code, shift_code_expires_at: expiresAt });
  } catch (err) { sendError(res, err); }
});
```
- Reuses existing helpers (`randomInt`, `d1Query`, `checkAdminPin`, `sendError`) — no new imports.
- Shift code format `S#####` (distinct from store code `COLOR###`, e.g. `PINK723`).
- Expiry **+30 days** (store code is +90 days).
- Proxies to Cloudflare D1 `store_access` (columns `shift_code`, `shift_code_expires_at`
  were added separately via wrangler from the laptop — NOT in this repo).

### 2. `server/public/staff.html` — "Store Access Codes" table
- Added **Shift Code** and **Shift Expires** columns (mirroring `store_code` / `code_expires_at`).
- Added a **Rotate shift** button per row, calling `rotateShift(id)`.
- New `rotateShift(id)` fn mirrors `rotateCode`: confirm → `adminFetch('/api/store-access/${id}/rotate-shift', {POST})`
  (X-Admin-Pin sent automatically from sessionStorage) → toast → reload table.
- Staff table and admin PIN gate: **unchanged** (per build prompt).

---

## Deploy & verification

- **Endpoint test:** `curl -s -X POST http://localhost:3001/api/store-access/1/rotate-shift -H "X-Admin-Pin: 9271"`
  → `{"ok":true,"shift_code":"S33954","shift_code_expires_at":"2026-08-18"}` ✅
- **UI:** verified via headless Chrome (fresh session, no cache) — Store Access table renders
  `Store | Code | Expires | Shift Code | Shift Expires | Status | Actions`, 6 rows,
  both Rotate + Rotate shift buttons. ✅

### ⚠️ Deploy gotcha (important for next time)
Production is **NOT** served by pm2. The live server is a **launchd daemon**:
`/Library/LaunchDaemons/com.neob.production.plist` → `node-neob server/index.js` (KeepAlive).
pm2's `neob-production` can't bind :3001 (daemon owns it) and was left **stopped**.

**To deploy code changes, reload the daemon (not `pm2 restart`):**
```bash
sudo launchctl kickstart -k system/com.neob.production
```
`tailscale serve` proxies `https://neobs-mac-mini.tail8d5e77.ts.net → 127.0.0.1:3001`.
Access is Tailscale-only (the old `100.68.55.123` hardcoded IP was dropped in commit 732c5d7).

### Test side-effects (live prod data)
During diagnosis, Queen Street's codes were rotated by test calls:
- `store_code` → new value (old Queen St store code no longer works)
- `shift_code` → `S33954`

---

## Portal auth finding (why this matters)

Confirmed by reading the deployed **`neob-store-portal`** bundle (a Cloudflare **Pages** SPA,
https://neob-store-portal.pages.dev/):

- **Login = `storeCode` + `shiftCode` only** → `POST /api/auth`. No name, no PIN. Per-store.
- KPI submit screen's **"Your Name"** is a free-text `<input>` (`staffName`, attribution only,
  validated non-empty). Not checked against any staff record.
- Portal only calls `/api/auth`, `/api/entry`, `/api/target` — **never `/api/staff`**, zero PIN refs.

➡️ **The Staff table (name/PIN/store/role) in `staff.html` is legacy — the portal does not use it.**

---

## Planned future house cleaning (NOT done yet)

1. Hide/remove the **Staff table UI** from `staff.html` (misleading — looks like login creds).
   Keep the "Store Access Codes" table (that's the live 2-code system).
2. Decide whether to drop D1 `staff` table — **get Robert's go-ahead first.**
3. Reconcile process managers: consolidate on the launchd daemon; disable pm2 resurrect so the
   two stop fighting for :3001.

---

## Guardrails honored
- Did not touch `ceo.html` panels / period selector / store table, or `/api/portal-sync`.
- No `npm install`. Did not create/modify D1 schema (only rotates existing columns).
