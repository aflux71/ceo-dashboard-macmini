import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const {
      store_name,
      portal_account_id,
      contact_name,
      submitted_by,
      items,
      additional_notes,
      requested_date
    } = body;

    if (!store_name || !portal_account_id || !contact_name || !Array.isArray(items) || items.length === 0) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Generate adjustment numbers ADJ-YYYY-NNNN
    const year = new Date().getFullYear();
    const prefix = `ADJ-${year}-`;
    const existing = await base44.asServiceRole.entities.InventoryAdjustment.filter(
      { adjustment_number: { $regex: `^${prefix}` } },
      '-adjustment_number',
      1
    );
    let nextNum = 1;
    if (existing && existing.length > 0) {
      const last = existing[0].adjustment_number;
      const lastNum = parseInt(last.split('-')[2], 10);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }

    // Shared batch reference for grouping
    const batchRef = `BATCH-${Date.now()}`;
    const trailingNote = [
      additional_notes ? `Submission notes: ${additional_notes}` : null,
      requested_date ? `Requested by: ${requested_date}` : null,
      `Batch ref: ${batchRef}`
    ].filter(Boolean).join(' | ');

    const created = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const adjustment_number = `${prefix}${String(nextNum + i).padStart(4, '0')}`;
      const itemNote = [item.notes, trailingNote].filter(Boolean).join(' | ');
      const rec = await base44.asServiceRole.entities.InventoryAdjustment.create({
        adjustment_number,
        store_name,
        portal_account_id,
        contact_name,
        product_id: item.product_id,
        product_name: item.product_name,
        sku: item.sku,
        quantity: Number(item.quantity) || 0,
        adjustment_reason_id: item.adjustment_reason_id,
        adjustment_reason_label: item.adjustment_reason_label || '',
        notes: itemNote,
        status: 'submitted',
        submitted_by: submitted_by || contact_name || store_name
      });
      created.push(rec);
    }

    return Response.json({ success: true, adjustments: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});