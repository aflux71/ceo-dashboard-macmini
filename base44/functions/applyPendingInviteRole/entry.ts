import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Reconciliation:
// For each PendingInvite, ensure the corresponding User's role matches the invite's intended role.
// - pending invites: if user now exists, apply role and mark invite as "registered"
// - registered invites: if user's current role differs from the invite role, re-apply it
//   (this handles the case where a role was reassigned via the dashboard and the user
//    needs to be re-synced to match)
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const invites = await base44.asServiceRole.entities.PendingInvite.list();
    if (!invites || invites.length === 0) {
      return Response.json({ ok: true, processed: 0, message: 'No invites' });
    }

    const allUsers = await base44.asServiceRole.entities.User.list();
    const userByEmail = new Map(
      allUsers.map(u => [(u.email || '').toLowerCase().trim(), u])
    );

    let applied = 0;
    let alreadyCorrect = 0;
    let stillPending = 0;

    for (const invite of invites) {
      const email = (invite.email || '').toLowerCase().trim();
      if (!email) continue;
      const user = userByEmail.get(email);
      if (!user) { stillPending++; continue; }

      const intendedRole = invite.role;
      if (!intendedRole) {
        if (invite.status !== 'registered') {
          await base44.asServiceRole.entities.PendingInvite.update(invite.id, { status: 'registered' });
        }
        continue;
      }

      if (user.role !== intendedRole) {
        await base44.asServiceRole.entities.User.update(user.id, { role: intendedRole });
        applied++;
        console.log(`Applied role "${intendedRole}" to ${email}`);
      } else {
        alreadyCorrect++;
      }
      if (invite.status !== 'registered') {
        await base44.asServiceRole.entities.PendingInvite.update(invite.id, { status: 'registered' });
      }
    }

    return Response.json({
      ok: true,
      processed: invites.length,
      applied,
      alreadyCorrect,
      stillPending
    });
  } catch (error) {
    console.error('applyPendingInviteRole error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});