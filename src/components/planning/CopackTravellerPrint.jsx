import React from "react";

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-CA", {
    month: "short", day: "numeric", year: "numeric",
  });
}

/**
 * Generates a printable Co-pack Traveller / Receipt and triggers print.
 * Standalone helper so the tab stays focused on data + UI.
 */
export function printCopackTraveller(order) {
  if (!order) return;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Co-pack Traveller — ${order.batch_id || order.product_name}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px; color: #111; background: #fff; }
  .doc { max-width: 720px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 20px; }
  .header h1 { margin: 0; font-size: 22px; letter-spacing: 0.5px; }
  .header .meta { text-align: right; font-size: 12px; color: #555; }
  .batch-id { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 16px; font-weight: 700; padding: 6px 10px; background: #111; color: #fff; border-radius: 6px; display: inline-block; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin-bottom: 20px; }
  .field { font-size: 13px; }
  .field .label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: #777; margin-bottom: 2px; }
  .field .value { font-weight: 600; color: #111; }
  .section { margin-top: 20px; }
  .section h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 10px; }
  .notes { font-size: 13px; line-height: 1.5; min-height: 60px; padding: 8px; border: 1px dashed #bbb; border-radius: 4px; white-space: pre-wrap; }
  .signoff { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .signoff .row { font-size: 12px; }
  .signoff .line { border-bottom: 1px solid #111; height: 28px; margin-bottom: 4px; }
  .checklist { list-style: none; padding: 0; margin: 0; font-size: 13px; }
  .checklist li { padding: 6px 0; border-bottom: 1px dotted #ddd; display: flex; gap: 8px; align-items: center; }
  .checkbox { width: 14px; height: 14px; border: 1.5px solid #111; border-radius: 2px; display: inline-block; flex-shrink: 0; }
  .footer { margin-top: 28px; font-size: 10px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 8px; }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div class="doc">
    <div class="header">
      <div>
        <h1>Co-pack Traveller</h1>
        <div style="margin-top: 8px;"><span class="batch-id">${order.batch_id || "— NO BATCH ID —"}</span></div>
      </div>
      <div class="meta">
        <div>Printed: ${new Date().toLocaleString("en-CA")}</div>
        <div>Status: ${(order.status || "").replace(/_/g, " ").toUpperCase()}</div>
      </div>
    </div>

    <div class="grid">
      <div class="field"><span class="label">Product</span><span class="value">${order.product_name || "—"}</span></div>
      <div class="field"><span class="label">SKU</span><span class="value" style="font-family: ui-monospace, monospace;">${order.sku || "—"}</span></div>
      <div class="field"><span class="label">Quantity</span><span class="value">${(order.quantity || 0).toLocaleString()} units</span></div>
      <div class="field"><span class="label">Co-packer</span><span class="value">${order.co_packer_name || "—"}</span></div>
      <div class="field"><span class="label">Ship By</span><span class="value">${formatDate(order.ship_by)}</span></div>
      <div class="field"><span class="label">Sent Date</span><span class="value">${formatDate(order.sent_date)}</span></div>
    </div>

    <div class="section">
      <h2>Co-packer Fill Checklist</h2>
      <ul class="checklist">
        <li><span class="checkbox"></span> Materials received and inspected</li>
        <li><span class="checkbox"></span> Bulk product matches batch ID and lot info</li>
        <li><span class="checkbox"></span> Containers, caps, and labels verified</li>
        <li><span class="checkbox"></span> Fill volume / weight check passed</li>
        <li><span class="checkbox"></span> Label placement and date code correct</li>
        <li><span class="checkbox"></span> Final unit count matches PO quantity</li>
        <li><span class="checkbox"></span> Samples retained for QC</li>
      </ul>
    </div>

    <div class="section">
      <h2>Notes / Deviations</h2>
      <div class="notes">${(order.notes || "").replace(/</g, "&lt;") || ""}</div>
    </div>

    <div class="signoff">
      <div class="row"><div class="line"></div><div>Co-packer Signature / Date</div></div>
      <div class="row"><div class="line"></div><div>Received By / Date</div></div>
    </div>

    <div class="footer">Co-pack Traveller · ${order.batch_id || order.sku || ""} · neōb Operations</div>
  </div>
  <script>window.onload = function () { window.print(); setTimeout(function(){ window.close(); }, 300); };</script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("Please allow pop-ups to print the traveller.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}