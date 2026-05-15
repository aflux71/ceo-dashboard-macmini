import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Scheduled reconciliation:
// For each PendingInvite with status="pending", check if a User now exists for that email.
// If so, update the user's role to the intended invite role and mark the invite as registered.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const invites = await base44.asServiceRole.entities.PendingInvite.filter({ status: 'pending' });
    if (!invites || invites.length === 0) {
      return Response.json({ ok: true, processed: 0, message: 'No pending invites' });
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
        await base44.asServiceRole.entities.PendingInvite.update(invite.id, { status: 'registered' });
        continue;
      }

      if (user.role !== intendedRole) {
        await base44.asServiceRole.entities.User.update(user.id, { role: intendedRole });
        applied++;
        console.log(`Applied role "${intendedRole}" to ${email}`);
      } else {
        alreadyCorrect++;
      }
      await base44.asServiceRole.entities.PendingInvite.update(invite.id, { status: 'registered' });
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