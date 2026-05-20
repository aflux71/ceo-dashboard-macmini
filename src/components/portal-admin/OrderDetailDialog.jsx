import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer } from "lucide-react";

const STATUSES = ["submitted", "acknowledged", "in_progress", "fulfilled", "cancelled"];

export default function OrderDetailDialog({ open, onOpenChange, order, onSave }) {
  const [status, setStatus] = useState("submitted");
  const [internalNotes, setInternalNotes] = useState("");
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [stockBySku, setStockBySku] = useState({});

  useEffect(() => {
    if (order) {
      setStatus(order.status || "submitted");
      setInternalNotes(order.internal_notes || "");
      setItems((order.items || []).map((i) => ({ ...i })));
    }
  }, [order]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const inv = await base44.entities.Inventory.filter({ type: "finished_product" }, "name", 5000);
        const map = {};
        (inv || []).forEach((i) => {
          if (i.sku) map[String(i.sku).toLowerCase()] = Math.max(0, Number(i.quantity) || 0);
        });
        setStockBySku(map);
      } catch {
        setStockBySku({});
      }
    })();
  }, [open]);

  if (!order) return null;

  const updateItem = (idx, field, value) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      status,
      internal_notes: internalNotes,
      items: items.map((it) => ({
        ...it,
        qty_fulfilled: Number(it.qty_fulfilled) || 0,
        qty_ordered: Number(it.qty_ordered) || 0
      }))
    });
    setSaving(false);
  };

  const handlePrint = () => {
    const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rowsHtml = items.map((it) => `
      <tr>
        <td>${esc(it.product_name)}</td>
        <td>${esc(it.sku)}</td>
        <td class="num">${esc(it.qty_ordered)}</td>
        <td class="num">${esc(it.qty_fulfilled ?? 0)}</td>
        <td>${esc(it.notes || "")}</td>
      </tr>
    `).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8" />
      <title>Order ${esc(order.order_number || "")}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; padding: 24px; }
        h1 { margin: 0 0 4px; font-size: 22px; }
        .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; font-size: 13px; }
        .meta .label { color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
        .notes { border: 1px solid #ddd; padding: 10px 12px; border-radius: 6px; margin: 12px 0; font-size: 13px; white-space: pre-wrap; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
        th { background: #f5f5f5; }
        td.num, th.num { text-align: right; }
        .status { display: inline-block; padding: 2px 8px; border: 1px solid #999; border-radius: 999px; font-size: 11px; text-transform: uppercase; }
        @media print { body { padding: 0; } }
      </style></head><body>
        <h1>Order ${esc(order.order_number || "")}</h1>
        <div><span class="status">${esc(status)}</span></div>
        <div class="meta">
          <div><div class="label">Store</div><div>${esc(order.store_name || "—")}</div></div>
          <div><div class="label">Contact</div><div>${esc(order.contact_name || "—")}</div></div>
          <div><div class="label">Order Date</div><div>${esc(order.order_date || "—")}</div></div>
          <div><div class="label">Requested Delivery</div><div>${esc(order.requested_delivery_date || "—")}</div></div>
        </div>
        ${order.notes ? `<div><div class="label" style="color:#666;font-size:11px;text-transform:uppercase;">Store Notes</div><div class="notes">${esc(order.notes)}</div></div>` : ""}
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th class="num">Ordered</th>
              <th class="num">Fulfilled</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        ${internalNotes ? `<div style="margin-top:16px"><div class="label" style="color:#666;font-size:11px;text-transform:uppercase;">Internal Notes</div><div class="notes">${esc(internalNotes)}</div></div>` : ""}
        <script>window.onload = () => { window.print(); };</script>
      </body></html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const handleExportShopify = () => {
    // CSV matches Shopify add-products template: SKU, Barcode, Quantity
    // Use fulfilled qty (what is actually shipping). Skip rows with qty <= 0.
    const escape = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [["SKU", "Barcode", "Quantity"]];
    items.forEach((it) => {
      const qty = Number(it.qty_fulfilled) || 0;
      if (qty <= 0) return;
      const skuRaw = String(it.sku || "").trim();
      // If the SKU is purely numeric (likely a barcode/UPC), put it in the Barcode column instead
      const isBarcode = /^\d{8,}$/.test(skuRaw);
      const sku = isBarcode ? "" : skuRaw;
      const barcode = isBarcode ? skuRaw : "";
      rows.push([sku, barcode, qty]);
    });
    const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${order.order_number || "order"}_shopify.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>Order {order.order_number}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 h-7"
              title="Print order"
            >
              <Printer className="w-4 h-4 mr-1" />
              Print
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-zinc-500 text-xs">Store</div>
              <div className="text-white">{order.store_name}</div>
            </div>
            <div>
              <div className="text-zinc-500 text-xs">Contact</div>
              <div className="text-white">{order.contact_name}</div>
            </div>
            <div>
              <div className="text-zinc-500 text-xs">Order Date</div>
              <div className="text-white">{order.order_date || "—"}</div>
            </div>
            <div>
              <div className="text-zinc-500 text-xs">Requested Delivery</div>
              <div className="text-white">{order.requested_delivery_date || "—"}</div>
            </div>
          </div>

          {order.notes && (
            <div className="bg-zinc-800/40 border border-zinc-800 rounded-lg p-3">
              <div className="text-zinc-500 text-xs mb-1">Store Notes</div>
              <div className="text-white text-sm">{order.notes}</div>
            </div>
          )}

          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-800/60 text-zinc-400">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-right">Ordered</th>
                  <th className="px-3 py-2 text-right">Fulfilled</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const stock = stockBySku[String(it.sku || "").toLowerCase()];
                  const ordered = Number(it.qty_ordered) || 0;
                  const backorder = typeof stock === "number" && ordered > stock ? ordered - stock : 0;
                  return (
                  <tr key={idx} className="border-t border-zinc-800">
                    <td className="px-3 py-2 text-white">{it.product_name}</td>
                    <td className="px-3 py-2 text-zinc-400">{it.sku}</td>
                    <td className="px-3 py-2 text-right text-white">
                      <div className="flex items-center justify-end gap-2">
                        <span>{it.qty_ordered}</span>
                        {backorder > 0 && (
                          <Badge variant="destructive" className="text-[10px] whitespace-nowrap">
                            Back-ordered: {backorder}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min="0"
                        value={it.qty_fulfilled ?? 0}
                        onChange={(e) => updateItem(idx, "qty_fulfilled", e.target.value)}
                        className="bg-zinc-800 border-zinc-700 text-white h-8 text-right w-20 ml-auto"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={it.notes || ""}
                        onChange={(e) => updateItem(idx, "notes", e.target.value)}
                        className="bg-zinc-800 border-zinc-700 text-white h-8"
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-zinc-300 mb-2 block">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-zinc-300 mb-2 block">Internal Notes (not shown to store)</Label>
            <Textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-white"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700">Close</Button>
          <Button
            variant="outline"
            onClick={handleExportShopify}
            className="border-emerald-700 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/50"
            title="Export fulfilled items as a CSV for Shopify upload"
          >
            Export for Shopify
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}