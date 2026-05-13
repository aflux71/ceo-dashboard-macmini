import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function formatCurrency(n, currency) {
  const num = Number(n || 0);
  return `${currency || 'CAD'} ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildEmailBody(po, companyName) {
  const itemsRows = (po.items || []).map(item => `
    <tr>
      <td style="padding:8px;border:1px solid #ddd;font-family:monospace;">${item.sku || '-'}</td>
      <td style="padding:8px;border:1px solid #ddd;">${item.name || '-'}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:right;">${item.quantity || 0} ${item.unit || ''}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:right;">$${Number(item.unit_cost || 0).toFixed(2)}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:right;">$${Number(item.total_cost || 0).toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#333;">
      <div style="border-bottom:2px solid #333;padding-bottom:16px;margin-bottom:20px;display:flex;justify-content:space-between;">
        <div>
          <h2 style="margin:0;">${companyName}</h2>
          <p style="margin:4px 0 0 0;color:#666;">Purchase Order</p>
        </div>
        <div style="text-align:right;">
          <p style="margin:0;font-size:20px;font-weight:bold;color:#f97316;">${po.po_number}</p>
          <p style="margin:4px 0 0 0;color:#666;">Status: ${(po.status || '').toUpperCase()}</p>
        </div>
      </div>

      <p>Hello ${po.supplier || 'Supplier'},</p>
      <p>Please find our purchase order details below. Confirm receipt and expected delivery at your earliest convenience.</p>

      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <tr>
          <td style="padding:8px;border:1px solid #ddd;background:#f5f5f5;font-weight:bold;width:30%;">PO Number</td>
          <td style="padding:8px;border:1px solid #ddd;">${po.po_number}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #ddd;background:#f5f5f5;font-weight:bold;">Order Date</td>
          <td style="padding:8px;border:1px solid #ddd;">${po.order_date ? new Date(po.order_date).toLocaleDateString() : '-'}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #ddd;background:#f5f5f5;font-weight:bold;">Expected Delivery</td>
          <td style="padding:8px;border:1px solid #ddd;">${po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '-'}</td>
        </tr>
      </table>

      <h3 style="border-bottom:1px solid #ddd;padding-bottom:8px;">Order Items</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:8px;border:1px solid #ddd;text-align:left;">SKU</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left;">Description</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:right;">Qty</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:right;">Unit Cost</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="padding:8px;border:1px solid #ddd;text-align:right;font-weight:bold;">Subtotal:</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:right;">$${Number(po.subtotal || 0).toFixed(2)}</td>
          </tr>
          ${po.tax > 0 ? `<tr><td colspan="4" style="padding:8px;border:1px solid #ddd;text-align:right;">Tax:</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">$${Number(po.tax).toFixed(2)}</td></tr>` : ''}
          ${po.shipping > 0 ? `<tr><td colspan="4" style="padding:8px;border:1px solid #ddd;text-align:right;">Shipping:</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">$${Number(po.shipping).toFixed(2)}</td></tr>` : ''}
          <tr style="background:#fff7ed;">
            <td colspan="4" style="padding:12px 8px;border:1px solid #ddd;text-align:right;font-weight:bold;font-size:15px;">TOTAL:</td>
            <td style="padding:12px 8px;border:1px solid #ddd;text-align:right;font-weight:bold;font-size:15px;color:#f97316;">${formatCurrency(po.total, po.currency)}</td>
          </tr>
        </tfoot>
      </table>

      ${po.notes ? `<div style="margin-top:20px;padding:12px;background:#f9f9f9;border-radius:6px;"><strong>Notes:</strong><br/>${po.notes.replace(/\n/g, '<br/>')}</div>` : ''}

      <p style="margin-top:24px;">Thank you,<br/><strong>${companyName}</strong>${po.created_by_name ? `<br/>${po.created_by_name}` : ''}</p>
    </div>
  `;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { po_id } = await req.json();
    if (!po_id) {
      return Response.json({ error: 'po_id is required' }, { status: 400 });
    }

    const po = await base44.entities.PurchaseOrder.get(po_id);
    if (!po) {
      return Response.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    if (!po.supplier_contact) {
      return Response.json({ error: 'No supplier contact email set on this PO' }, { status: 400 });
    }

    const settings = await base44.entities.AppSettings.filter({ key: 'company_name' });
    const companyName = settings?.[0]?.value || 'neōb';

    const subject = `Purchase Order ${po.po_number} from ${companyName}`;
    const body = buildEmailBody(po, companyName);

    await base44.integrations.Core.SendEmail({
      from_name: companyName,
      to: po.supplier_contact,
      subject,
      body,
    });

    return Response.json({ success: true, sent_to: po.supplier_contact });
  } catch (error) {
    console.error('sendPurchaseOrderEmail error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});