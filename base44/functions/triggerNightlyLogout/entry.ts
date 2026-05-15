import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Scheduled at 2 AM Toronto daily. Bumps the "logout_epoch" AppSettings value to NOW.
// Clients compare their cached login timestamp to this epoch and self-logout if older.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const nowIso = new Date().toISOString();

    const existing = await base44.asServiceRole.entities.AppSettings.filter({ key: "logout_epoch" });
    if (existing && existing.length > 0) {
      await base44.asServiceRole.entities.AppSettings.update(existing[0].id, { value: nowIso });
    } else {
      await base44.asServiceRole.entities.AppSettings.create({
        key: "logout_epoch",
        value: nowIso,
        description: "Nightly logout epoch — sessions older than this are forced to re-login + PIN"
      });
    }

    console.log(`Logout epoch bumped to ${nowIso}`);
    return Response.json({ ok: true, logout_epoch: nowIso });
  } catch (error) {
    console.error('triggerNightlyLogout error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});