import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ClipboardEdit, CheckCircle2, Plus } from "lucide-react";
import AdjustmentItemCard from "./AdjustmentItemCard";
import AdjustmentReviewDialog from "./AdjustmentReviewDialog";

export default function PortalAdjustmentTab({ session, activeStore }) {
  const [products, setProducts] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adjustmentItems, setAdjustmentItems] = useState([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [prods, rs] = await Promise.all([
          base44.entities.PortalProduct.filter({ portal_hidden: false }, "display_order", 500),
          base44.entities.InventoryAdjustmentReason.filter({ is_active: true }, "display_order", 100)
        ]);
        setProducts(prods || []);
        setReasons(rs || []);
      } catch {
        setProducts([]);
        setReasons([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 50);
    return products.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q)
    );
  }, [products, search]);

  const handleAddProduct = (product) => {
    if (adjustmentItems.some((it) => it.product_id === product.id)) return;
    setAdjustmentItems((prev) => [
      ...prev,
      {
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        quantity: "",
        adjustment_reason_id: "",
        adjustment_reason_label: "",
        notes: ""
      }
    ]);
    setSearch("");
  };

  const handleItemChange = (productId, field, value) => {
    setAdjustmentItems((prev) =>
      prev.map((it) => {
        if (it.product_id !== productId) return it;
        const next = { ...it, [field]: value };
        if (field === "adjustment_reason_id") {
          const reason = reasons.find((r) => r.id === value);
          next.adjustment_reason_label = reason?.label || "";
        }
        return next;
      })
    );
  };

  const handleRemoveItem = (productId) => {
    setAdjustmentItems((prev) => prev.filter((it) => it.product_id !== productId));
  };

  const readyItems = useMemo(
    () =>
      adjustmentItems.filter(
        (it) =>
          it.adjustment_reason_id &&
          it.quantity !== "" &&
          !isNaN(Number(it.quantity)) &&
          Number(it.quantity) !== 0
      ),
    [adjustmentItems]
  );

  const handleSubmit = async ({ requested_date, additional_notes }) => {
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
        store_name: activeStore || session.store_name,
        portal_account_id: session.id,
        contact_name: session.contact_name || session.store_name,
        submitted_by: session.contact_name || session.store_name,
        items: payloadItems,
        additional_notes,
        requested_date
      });
      if (res?.data?.success) {
        setConfirmation({
          adjustments: res.data.adjustments,
          items: payloadItems
        });
        setAdjustmentItems([]);
        setReviewOpen(false);
      } else {
        alert(res?.data?.error || "Failed to submit adjustment");
      }
    } catch {
      alert("Failed to submit adjustment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmation) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-400" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Adjustment Request Submitted</h1>
        <p className="text-zinc-400 mb-6">
          {confirmation.adjustments.length} adjustment{confirmation.adjustments.length === 1 ? "" : "s"} created
        </p>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-left mb-8">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
            Adjustment Numbers
          </h2>
          <div className="space-y-2">
            {confirmation.adjustments.map((adj) => (
              <div key={adj.id} className="flex justify-between text-sm border-b border-zinc-800 pb-2">
                <div>
                  <div className="text-white">{adj.product_name}</div>
                  <div className="text-zinc-500 text-xs">{adj.sku}</div>
                </div>
                <div className="text-orange-400 font-semibold">{adj.adjustment_number}</div>
              </div>
            ))}
          </div>
        </div>

        <Button
          onClick={() => setConfirmation(null)}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          Submit Another Adjustment
        </Button>
      </div>
    );
  }

  const displayStore = activeStore || session.store_name;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Inventory Adjustment</h1>
          <p className="text-zinc-400 text-sm">
            Report inventory adjustments such as testers, damaged, or missing units
          </p>
        </div>
        <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-2 rounded-lg">
          <span className="text-xs text-zinc-500">Adjustments for:</span>
          <span className="text-sm font-semibold text-orange-400">{displayStore}</span>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          placeholder="Search products to add..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-zinc-900 border-zinc-800 text-white h-11 focus-visible:ring-orange-500"
        />
      </div>

      {search.trim() && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden mb-6 max-h-72 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-zinc-500 text-sm">Loading...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-4 text-center text-zinc-500 text-sm">No products match your search.</div>
          ) : (
            filteredProducts.map((p) => {
              const isAdded = adjustmentItems.some((it) => it.product_id === p.id);
              return (
                <button
                  key={p.id}
                  disabled={isAdded}
                  onClick={() => handleAddProduct(p)}
                  className={`w-full text-left px-4 py-3 border-b border-zinc-800 last:border-b-0 flex items-center justify-between gap-3 transition-colors ${
                    isAdded ? "opacity-50 cursor-not-allowed" : "hover:bg-zinc-800/60"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-white font-medium truncate">{p.name}</div>
                    <div className="text-xs text-zinc-500">SKU: {p.sku}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.category && (
                      <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                        {p.category}
                      </Badge>
                    )}
                    {isAdded ? (
                      <span className="text-xs text-zinc-500">Added</span>
                    ) : (
                      <Plus className="w-4 h-4 text-orange-400" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {adjustmentItems.length === 0 ? (
        <div className="text-center py-16 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
          <ClipboardEdit className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
          <p>Search above and select a product to start your adjustment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {adjustmentItems.map((item) => (
            <AdjustmentItemCard
              key={item.product_id}
              item={item}
              reasons={reasons}
              onChange={handleItemChange}
              onRemove={handleRemoveItem}
            />
          ))}
        </div>
      )}

      {adjustmentItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 z-40">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="text-sm">
              <div className="text-white font-semibold">
                {adjustmentItems.length} item{adjustmentItems.length === 1 ? "" : "s"} in adjustment
              </div>
              <div className="text-zinc-400 text-xs">
                {readyItems.length} ready to submit (qty & reason required)
              </div>
            </div>
            <Button
              onClick={() => setReviewOpen(true)}
              disabled={readyItems.length === 0}
              className="bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
            >
              <ClipboardEdit className="w-4 h-4 mr-2" />
              Review & Submit
            </Button>
          </div>
        </div>
      )}

      <AdjustmentReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        items={readyItems}
        onSubmit={handleSubmit}
        submitting={submitting}
      />
    </div>
  );
}