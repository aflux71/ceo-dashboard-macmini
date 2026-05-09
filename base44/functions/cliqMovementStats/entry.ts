import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function startOfTodayISO() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfYesterdayISO() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function postToCliq(text) {
  const webhookUrl = Deno.env.get('ZOHO_CLIQ_WEBHOOK_URL');
  if (!webhookUrl) throw new Error('ZOHO_CLIQ_WEBHOOK_URL not configured');
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cliq webhook failed (${res.status}): ${body}`);
  }
  return res.text();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let isScheduled = false;
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }
    } catch {
      isScheduled = true;
    }

    const sdk = isScheduled ? base44.asServiceRole : base44;

    const since = startOfYesterdayISO();
    const todayStart = startOfTodayISO();

    const [allBatches, allCopackOrders, allInventory] = await Promise.all([
      sdk.entities.Batch.list('-updated_date', 500),
      sdk.entities.CopackOrder.list('-updated_date', 500),
      sdk.entities.Inventory.list('', 1000),
    ]);

    // Movement counts based on updated_date in last 24h
    const recentBatches = allBatches.filter(b => b.updated_date && b.updated_date >= since);
    const completedBatches = recentBatches.filter(b => b.status === 'added_to_inventory' || b.status === 'approved');
    const newBatches = recentBatches.filter(b => b.created_date && b.created_date >= since);
    const recentCopack = allCopackOrders.filter(o => o.updated_date && o.updated_date >= since);
    const copackComplete = recentCopack.filter(o => o.status === 'complete');
    const copackSent = recentCopack.filter(o => o.status === 'sent');
    const copackReturned = recentCopack.filter(o => o.status === 'returned');

    // Low stock snapshot
    const lowStock = allInventory.filter(i =>
      typeof i.reorder_point === 'number' && typeof i.quantity === 'number' && i.quantity <= i.reorder_point
    );

    const dateLabel = todayStart.split('T')[0];
    const lines = [`*📊 Daily Movement Stats — ${dateLabel}*`, '_(last 24 hours)_', ''];

    lines.push('*Production:*');
    lines.push(`  • Batches completed: ${completedBatches.length}`);
    lines.push(`  • New batches started: ${newBatches.length}`);
    lines.push('');
    lines.push('*Co-pack:*');
    lines.push(`  • Sent to co-packer: ${copackSent.length}`);
    lines.push(`  • Returned: ${copackReturned.length}`);
    lines.push(`  • Completed: ${copackComplete.length}`);
    lines.push('');
    lines.push('*Inventory:*');
    lines.push(`  • Items at/below reorder point: ${lowStock.length}`);

    if (lowStock.length > 0) {
      lines.push('');
      lines.push('_Top low-stock items:_');
      lowStock.slice(0, 5).forEach(i => {
        lines.push(`  • ${i.name} (${i.sku}) — ${i.quantity} ${i.unit || ''} (reorder at ${i.reorder_point})`);
      });
    }

    const message = lines.join('\n');
    await postToCliq(message);

    return Response.json({
      success: true,
      counts: {
        completed_batches: completedBatches.length,
        new_batches: newBatches.length,
        copack_sent: copackSent.length,
        copack_returned: copackReturned.length,
        copack_complete: copackComplete.length,
        low_stock: lowStock.length,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});