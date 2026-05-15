import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Search, X, Plus, Trash2 } from "lucide-react";

export default function AdminCreateAdjustmentDialog({ open, onOpenChange, currentUserName, onCreated, allowedStores = null }) {
  const [accounts, setAccounts] = useState([]);
  const [products, setProducts] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(false);

  const [accountId, setAccountId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAccountId("");
    setProductSearch("");
    setItems([]);
    setNotes("");
    setLoading(true);
    (async () => {
      try {
        const [accs, prods, rs] = await Promise.all([
          base44.entities.PortalAccount.filter({ is_active: true }, "store_name", 500),
          base44.entities.PortalProduct.filter({ portal_hidden: false }, "display_order", 500),
          base44.entities.InventoryAdjustmentReason.filter({ is_active: true }, "display_order", 100)
        ]);
        let filteredAccs = accs || [];
        if (Array.isArray(allowedStores)) {
          const set = new Set(allowedStores);
          filteredAccs = filteredAccs.filter((a) => {
            const stores = a.assigned_stores && a.assigned_stores.length ? a.assigned_stores : [a.store_name];
            return stores.some((s) => set.has(s));
          });
        }
        setAccounts(filteredAccs);
        setProducts(prods || []);
        setReasons(rs || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, allowedStores]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId]
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          (p.name || "").toLowerCase().includes(q) ||
          (p.sku || "").toLowerCase().includes(q)
      )
      .slice(0, 25);
  }, [products, productSearch]);

  const addProduct = (p) => {
    if (items.some((it) => it.product_id === p.id)) return;
    setItems((prev) => [
      ...prev,
      {
        product_id: p.id,
        product_name: p.name,
        sku: p.sku,
        quantity: "",
        adjustment_reason_id: "",
        adjustment_reason_label: "",
        notes: ""
      }
    ]);
    setProductSearch("");
  };

  const updateItem = (productId, field, value) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.product_id !== productId) return it;
        const next = { ...it, [field]: value };
        if (field === "adjustment_reason_id") {
          const r = reasons.find((x) => x.id === value);
          next.adjustment_reason_label = r?.label || "";
        }
        return next;
      })
    );
  };

  const removeItem = (productId) => {
    setItems((prev) => prev.filter((it) => it.product_id !== productId));
  };

  const readyItems = useMemo(
    () =>
      items.filter(
        (it) =>
          it.adjustment_reason_id &&
          it.quantity !== "" &&
          !isNaN(Number(it.quantity)) &&
          Number(it.quantity) !== 0
      ),
    [items]
  );

  const canSubmit = !!selectedAccount && readyItems.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const payloadItems = readyItems.map((it) => ({
        product_id: it.product_id,
        product_name: it.product_name,
        sku: it.sku,
        quantity: Number(it.quantity),
        adjustment_reason_id: it.adjustment_reason_id,
        adjustment_reason_label: it.adjustment_reason_label,
        notes: it.notes
      }));
      const res = await base44.functions.invoke("createInventoryAdjustment", {
        store_name: selectedAccount.store_name,
        portal_account_id: selectedAccount.id,
        contact_name: selectedAccount.contact_name || selectedAccount.store_name,
        submitted_by: `${currentUserName || "ERP Admin"} (admin)`,
        items: payloadItems,
        additional_notes: notes
      });
      if (res?.data?.success) {
        onCreated?.(res.data.adjustments);
        onOpenChange(false);
      } else {
        alert(res?.data?.error || "Failed to create adjustment");
      }
    } catch {
      alert("Failed to create adjustment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Adjustment Request</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Store selection */}
          <div>
            <Label className="text-zinc-300">Store *</Label>
            <Select value={accountId} onValueChange={setAccountId} disabled={loading}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1 focus:ring-orange-500">
                <SelectValue placeholder={loading ? "Loading stores..." : "Select a store"} />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 text-white max-h-72">
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.store_name}
                    {a.contact_name ? ` — ${a.contact_name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Product search */}
          <div>
            <Label className="text-zinc-300">Add Product</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search by product name or SKU..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="pl-10 bg-zinc-800 border-zinc-700 text-white focus-visible:ring-orange-500"
              />
            </div>
            {productSearch.trim() && (
              <div className="mt-2 bg-zinc-950 border border-zinc-800 rounded-lg max-h-56 overflow-y-auto">
                {filteredProducts.length === 0 ? (
                  <div className="p-3 text-sm text-zinc-500 text-center">No products match.</div>
                ) : (
                  filteredProducts.map((p) => {
                    const isAdded = items.some((it) => it.product_id === p.id);
                    return (
                      <button
                        key={p.id}
                        disabled={isAdded}
                        onClick={() => addProduct(p)}
                        className={`w-full text-left px-3 py-2 border-b border-zinc-800 last:border-b-0 flex items-center justify-between gap-3 ${
                          isAdded ? "opacity-50 cursor-not-allowed" : "hover:bg-zinc-800/60"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-white text-sm font-medium truncate">{p.name}</div>
                          <div className="text-xs text-zinc-500 font-mono">{p.sku}</div>
                        </div>
                        {isAdded ? (
                          <span className="text-xs text-zinc-500">Added</span>
                        ) : (
                          <Plus className="w-4 h-4 text-orange-400" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Items list */}
          {items.length === 0 ? (
            <div className="border border-dashed border-zinc-800 rounded-lg p-6 text-center text-zinc-500 text-sm">
              Search and add at least one product.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.product_id} className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0">
                      <div className="text-white font-medium truncate">{it.product_name}</div>
                      <div className="text-xs text-zinc-500 font-mono">{it.sku}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeItem(it.product_id)}
                      className="text-zinc-400 hover:text-red-400 h-7 w-7 p-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs text-zinc-400">Qty</Label>
                      <Input
                        type="number"
                        placeholder="e.g. -2 or +1"
                        value={it.quantity}
                        onChange={(e) => updateItem(it.product_id, "quantity", e.target.value)}
                        className="bg-zinc-800 border-zinc-700 text-white mt-0.5 focus-visible:ring-orange-500"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-400">Reason</Label>
                      <Select
                        value={it.adjustment_reason_id}
                        onValueChange={(v) => updateItem(it.product_id, "adjustment_reason_id", v)}
                      >
                        <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-0.5 focus:ring-orange-500">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                          {reasons.map((r) => (
                            <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-400">Item Note</Label>
                      <Input
                        placeholder="Optional"
                        value={it.notes}
                        onChange={(e) => updateItem(it.product_id, "notes", e.target.value)}
                        className="bg-zinc-800 border-zinc-700 text-white mt-0.5 focus-visible:ring-orange-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Overall notes */}
          <div>
            <Label className="text-zinc-300">Additional Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes for the whole submission"
              className="bg-zinc-800 border-zinc-700 text-white mt-1 focus-visible:ring-orange-500"
            />
          </div>

          <div className="text-xs text-zinc-500">
            {readyItems.length} of {items.length} item{items.length === 1 ? "" : "s"} ready (qty & reason required).
            {" "}Submitted as {currentUserName || "ERP Admin"} on behalf of the store.
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {submitting ? "Creating..." : "Create Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}