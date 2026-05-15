import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { store_name, contact_name, contact_email, contact_phone, requested_delivery_date, notes, items, submitted_by } = body;

    if (!store_name || !contact_name || !Array.isArray(items) || items.length === 0) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Generate order number SO-YYYY-NNNN
    const year = new Date().getFullYear();
    const prefix = `SO-${year}-`;
    const existing = await base44.asServiceRole.entities.PortalOrder.filter({ order_number: { $regex: `^${prefix}` } }, '-order_number', 1);
    let nextNum = 1;
    if (existing && existing.length > 0) {
      const last = existing[0].order_number;
      const lastNum = parseInt(last.split('-')[2], 10);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }
    const order_number = `${prefix}${String(nextNum).padStart(4, '0')}`;

    const order = await base44.asServiceRole.entities.PortalOrder.create({
      order_number,
      store_name,
      contact_name,
      contact_email: contact_email || '',
      contact_phone: contact_phone || '',
      order_date: new Date().toISOString().split('T')[0],
      requested_delivery_date: requested_delivery_date || null,
      status: 'submitted',
      notes: notes || '',
      items: items.map(i => ({
        portal_product_id: i.portal_product_id,
        product_name: i.product_name,
        sku: i.sku,
        qty_ordered: Number(i.qty_ordered) || 0,
        qty_fulfilled: 0,
        notes: i.notes || ''
      })),
      submitted_by: submitted_by || store_name
    });

    return Response.json({ success: true, order });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});