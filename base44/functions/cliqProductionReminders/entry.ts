import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
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

    // Allow scheduled (no user) calls via service role; for manual calls, require admin
    let isScheduled = false;
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }
    } catch {
      isScheduled = true;
    }

    const today = todayStr();
    const sevenDaysOut = addDays(today, 7);

    const sdk = isScheduled ? base44.asServiceRole : base44;

    const [copackOrders, pendingQcBatches, repairs] = await Promise.all([
      sdk.entities.CopackOrder.filter({ status: 'draft' }),
      sdk.entities.Batch.filter({ status: 'pending_qc' }),
      sdk.entities.EquipmentRepair.filter({ status: 'new_submission' }),
    ]);

    const overdue = copackOrders.filter(o => o.ship_by && o.ship_by < today);
    const urgent = copackOrders.filter(o => o.ship_by && o.ship_by >= today && o.ship_by <= sevenDaysOut);

    const lines = [`*🏭 Production Reminders — ${today}*`, ''];

    if (overdue.length === 0 && urgent.length === 0 && pendingQcBatches.length === 0 && repairs.length === 0) {
      lines.push('✅ All clear — no overdue or urgent items today.');
    } else {
      if (overdue.length > 0) {
        lines.push(`🔴 *${overdue.length} co-pack order${overdue.length > 1 ? 's' : ''} OVERDUE for shipment:*`);
        overdue.slice(0, 10).forEach(o => {
          lines.push(`  • ${o.product_name} (${o.sku}) — ship-by ${o.ship_by} → ${o.co_packer_name}`);
        });
        lines.push('');
      }
      if (urgent.length > 0) {
        lines.push(`🟠 *${urgent.length} co-pack order${urgent.length > 1 ? 's' : ''} ship within 7 days:*`);
        urgent.slice(0, 10).forEach(o => {
          lines.push(`  • ${o.product_name} (${o.sku}) — ship-by ${o.ship_by} → ${o.co_packer_name}`);
        });
        lines.push('');
      }
      if (pendingQcBatches.length > 0) {
        lines.push(`🟣 *${pendingQcBatches.length} batch${pendingQcBatches.length > 1 ? 'es' : ''} pending QC:*`);
        pendingQcBatches.slice(0, 10).forEach(b => {
          lines.push(`  • ${b.batch_id} — ${b.product_name} (${b.quantity} units)`);
        });
        lines.push('');
      }
      if (repairs.length > 0) {
        lines.push(`🔧 *${repairs.length} new equipment repair${repairs.length > 1 ? 's' : ''} submitted:*`);
        repairs.slice(0, 10).forEach(r => {
          lines.push(`  • ${r.equipment_type} @ ${r.location} — urgency: ${r.urgency}`);
        });
      }
    }

    const message = lines.join('\n');
    await postToCliq(message);

    return Response.json({
      success: true,
      counts: {
        overdue: overdue.length,
        urgent: urgent.length,
        pending_qc: pendingQcBatches.length,
        new_repairs: repairs.length,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});