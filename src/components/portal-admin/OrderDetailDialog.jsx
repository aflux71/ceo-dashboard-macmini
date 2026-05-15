import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Order {order.order_number}</DialogTitle>
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700">Close</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}