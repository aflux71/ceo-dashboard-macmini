import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { store_name, access_code, account_id } = await req.json();

    if (!store_name || !access_code) {
      return Response.json({ error: 'Missing credentials' }, { status: 400 });
    }

    // Verify portal session by re-validating credentials against PortalAccount
    const accounts = await base44.asServiceRole.entities.PortalAccount.filter({
      access_code: access_code.trim(),
      is_active: true
    });

    if (!accounts || accounts.length === 0) {
      return Response.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Find the specific account by id (if provided) and ensure the requested store is assigned to it
    const account = account_id
      ? accounts.find(a => a.id === account_id)
      : accounts[0];

    if (!account) {
      return Response.json({ error: 'Invalid session' }, { status: 401 });
    }

    const assigned = Array.isArray(account.assigned_stores) && account.assigned_stores.length > 0
      ? account.assigned_stores
      : [account.store_name];

    if (!assigned.includes(store_name)) {
      return Response.json({ error: 'Store not assigned to this account' }, { status: 403 });
    }

    const orders = await base44.asServiceRole.entities.PortalOrder.filter(
      { store_name },
      '-created_date',
      200
    );

    return Response.json({ success: true, orders: orders || [] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});