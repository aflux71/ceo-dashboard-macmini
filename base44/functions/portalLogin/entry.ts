import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { store_name, access_code } = await req.json();

    if (!store_name || !access_code) {
      return Response.json({ error: 'Missing credentials' }, { status: 400 });
    }

    const accounts = await base44.asServiceRole.entities.PortalAccount.filter({
      store_name: store_name.trim(),
      access_code: access_code.trim(),
      is_active: true
    });

    if (!accounts || accounts.length === 0) {
      return Response.json({ error: 'Invalid store name or access code' }, { status: 401 });
    }

    const account = accounts[0];
    return Response.json({
      success: true,
      account: {
        id: account.id,
        store_name: account.store_name,
        contact_name: account.contact_name || '',
        contact_email: account.contact_email || '',
        account_type: account.account_type || 'store'
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});