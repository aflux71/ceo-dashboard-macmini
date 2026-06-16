import React, { useState, useEffect, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ShoppingCart, CheckCircle2, Store, UserCircle2, Phone, Mail, ArrowLeftRight, Loader2, Check } from "lucide-react";
import PortalProductRow from "@/components/portal/PortalProductRow";
import OrderReviewDialog from "@/components/portal/OrderReviewDialog";
import StorePickerDialog from "@/components/portal-admin/StorePickerDialog";
import { calculateSuggestedQty, parseStockByLocation } from "@/utils/suggestedOrderEngine";

export default function SalesRepOrder() {
  const [user, setUser] = useState(null);
  const [store, setStore] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(true);

  const [products, setProducts] = useState([]);
  const [stockBySku, setStockBySku] = useState({});
  const [reorderPointBySku, setReorderPointBySku] = useState({});
  const [shelfStockBySku, setShelfStockBySku] = useState({}); // { sku: { "neob Queen Street": 12, ... } }
  const [demandBySku, setDemandBySku] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [quantities, setQuantities] = useState({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [draftOrder, setDraftOrder] = useState(null);
  const [orderNote, setOrderNote] = useState("");
  const [autoSaveState, setAutoSaveState] = useState("idle"); // idle | saving | saved
  const autoSaveTimer = useRef(null);
  const hasHydratedDraft = useRef(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [all, inv, demand] = await Promise.all([
          base44.entities.PortalProduct.filter({ portal_hidden: false }, "display_order", 500),
          base44.entities.Inventory.filter({ type: "finished_product" }, "name", 5000),
          base44.entities.DemandSummary.list("-updatedAt", 5000)
        ]);
        setProducts(all || []);
        const stockMap = {};
        const reorderMap = {};
        const shelfMap = {};
        (inv || []).forEach((i) => {
          if (!i.sku) return;
          const key = String(i.sku).toLowerCase();
          stockMap[key] = Math.max(0, Number(i.quantity) || 0);
          if (i.reorder_point != null) reorderMap[key] = Number(i.reorder_point) || 0;
          const perLocation = parseStockByLocation(i.notes);
          if (Object.keys(perLocation).length > 0) shelfMap[key] = perLocation;
        });
        setStockBySku(stockMap);
        setReorderPointBySku(reorderMap);
        setShelfStockBySku(shelfMap);
        const demandMap = {};
        (demand || []).forEach((d) => {
          if (d.sku) demandMap[String(d.sku).toLowerCase()] = d;
        });
        setDemandBySku(demandMap);
      } catch {
        setProducts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load draft from ?draftId= query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const draftId = params.get("draftId");
    if (!draftId || products.length === 0) return;
    (async () => {
      try {
        const order = await base44.entities.PortalOrder.get(draftId);
        if (!order || order.status !== 'draft') return;
        setDraftOrder(order);
        setStore({
          store_name: order.store_name,
          contact_name: order.contact_name,
          contact_email: order.contact_email
        });
        setPickerOpen(false);
        const qtyMap = {};
        (order.items || []).forEach((it) => {
          let pid = it.portal_product_id;
          // Fallback: match by SKU if product id changed
          if (!products.find((p) => p.id === pid)) {
            const bySku = products.find((p) => p.sku === it.sku);
            if (bySku) pid = bySku.id;
          }
          if (pid) qtyMap[pid] = Number(it.qty_ordered) || 0;
        });
        setQuantities(qtyMap);
        // Strip the "[Phone order placed by ...]" prefix when loading note for editing
        const rawNote = order.notes || "";
        const cleanNote = rawNote.replace(/^\[Phone order placed by [^\]]*\]\n?/, "");
        setOrderNote(cleanNote);
        hasHydratedDraft.current = true;
      } catch {
        // ignore
      }
    })();
  }, [products]);

  const categories = useMemo(() => {
    const set = new Set();
    products.forEach((p) => { if (p.category) set.add(p.category); });
    return ["All", ...Array.from(set).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (activeCategory !== "All" && p.category !== activeCategory) return false;
      if (!q) return true;
      return (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q);
    });
  }, [products, search, activeCategory]);

  // Compute suggested order qty per product for the currently selected store
  const suggestionsBySku = useMemo(() => {
    if (!store) return {};
    const map = {};
    products.forEach((p) => {
      const skuKey = String(p.sku || "").toLowerCase();
      const reorderPoint = reorderPointBySku[skuKey];
      const currentStock = stockBySku[skuKey];
      const demandSummary = demandBySku[skuKey];
      const shelf = shelfStockBySku[skuKey]?.[store.store_name];
      if (reorderPoint == null && !demandSummary) return;
      map[skuKey] = calculateSuggestedQty({
        reorderPoint,
        currentStock,
        storeShelfStock: typeof shelf === "number" ? shelf : undefined,
        demandSummary,
        storeName: store.store_name
      });
    });
    return map;
  }, [products, store, reorderPointBySku, stockBySku, shelfStockBySku, demandBySku]);

  const handleQtyChange = (id, value) => {
    const n = parseInt(value, 10);
    setQuantities((prev) => {
      const next = { ...prev };
      if (!value || isNaN(n) || n <= 0) delete next[id];
      else next[id] = n;
      return next;
    });
  };

  const cartItems = useMemo(() => {
    return Object.entries(quantities).map(([id, qty]) => {
      const p = products.find((x) => x.id === id);
      return p ? {
        portal_product_id: id,
        product_name: p.name,
        sku: p.sku,
        qty_ordered: qty
      } : null;
    }).filter(Boolean);
  }, [quantities, products]);

  const totalUnits = cartItems.reduce((sum, it) => sum + (it.qty_ordered || 0), 0);

  // Auto-save as draft whenever quantities or note change (debounced)
  const autoSaveDraft = async () => {
    if (!store) return;
    setAutoSaveState("saving");
    try {
      const repName = user?.full_name || user?.email || "Sales Rep";
      const itemsPayload = cartItems.map((i) => ({
        portal_product_id: i.portal_product_id,
        product_name: i.product_name,
        sku: i.sku,
        qty_ordered: Number(i.qty_ordered) || 0,
        qty_fulfilled: 0,
        notes: i.notes || ""
      }));
      const noteWithPrefix = orderNote
        ? `[Phone order placed by ${repName}]\n${orderNote}`
        : `[Phone order placed by ${repName}]`;

      if (draftOrder) {
        await base44.entities.PortalOrder.update(draftOrder.id, {
          notes: noteWithPrefix,
          items: itemsPayload
        });
      } else {
        // Create a new draft via backend function (handles SO numbering)
        const res = await base44.functions.invoke("createPortalOrder", {
          store_name: store.store_name,
          contact_name: store.contact_name || store.store_name,
          contact_email: store.contact_email || "",
          submitted_by: repName,
          notes: noteWithPrefix,
          items: itemsPayload,
          status: "draft"
        });
        if (res?.data?.success && res.data.order) {
          setDraftOrder(res.data.order);
          // Reflect draft id in URL so reloads keep editing the same draft
          const url = new URL(window.location.href);
          url.searchParams.set("draftId", res.data.order.id);
          window.history.replaceState({}, "", url.toString());
        }
      }
      setAutoSaveState("saved");
    } catch {
      setAutoSaveState("idle");
    }
  };

  useEffect(() => {
    if (!store) return;
    // Avoid saving immediately on initial draft hydration
    if (hasHydratedDraft.current) {
      hasHydratedDraft.current = false;
      return;
    }
    // Don't auto-save an empty new order (no draft, no items)
    if (!draftOrder && cartItems.length === 0 && !orderNote) return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      autoSaveDraft();
    }, 800);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantities, orderNote, store]);

  const handleSubmitOrder = async ({ requested_delivery_date, notes, status }) => {
    if (!store) return;
    setSubmitting(true);
    try {
      const repName = user?.full_name || user?.email || "Sales Rep";
      const finalStatus = status || 'submitted';

      // Update existing draft instead of creating a new order
      if (draftOrder) {
        const repNote = notes ? `[Phone order placed by ${repName}]\n${notes}` : (draftOrder.notes || "");
        const updated = await base44.entities.PortalOrder.update(draftOrder.id, {
          status: finalStatus,
          requested_delivery_date: requested_delivery_date || null,
          notes: repNote,
          items: cartItems.map((i) => ({
            portal_product_id: i.portal_product_id,
            product_name: i.product_name,
            sku: i.sku,
            qty_ordered: Number(i.qty_ordered) || 0,
            qty_fulfilled: 0,
            notes: i.notes || ""
          }))
        });
        setConfirmation({
          order_number: updated.order_number || draftOrder.order_number,
          items: cartItems,
          store_name: store.store_name,
          status: finalStatus
        });
        setQuantities({});
        setReviewOpen(false);
        setDraftOrder(null);
        return;
      }

      const repNote = `[Phone order placed by ${repName}]${notes ? `\n${notes}` : ""}`;
      const res = await base44.functions.invoke("createPortalOrder", {
        store_name: store.store_name,
        contact_name: store.contact_name || store.store_name,
        contact_email: store.contact_email || "",
        submitted_by: repName,
        requested_delivery_date,
        notes: repNote,
        items: cartItems,
        status: finalStatus
      });
      if (res?.data?.success) {
        setConfirmation({
          order_number: res.data.order.order_number,
          items: cartItems,
          store_name: store.store_name,
          status: finalStatus
        });
        setQuantities({});
        setReviewOpen(false);
      } else {
        alert(res?.data?.error || "Failed to submit order");
      }
    } catch {
      alert("Failed to submit order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const startNewOrder = () => {
    setConfirmation(null);
    setStore(null);
    setPickerOpen(true);
    setDraftOrder(null);
    setOrderNote("");
    setAutoSaveState("idle");
    if (window.location.search.includes("draftId")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  };

  if (confirmation) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-400" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">{confirmation.status === 'draft' ? 'Draft Saved!' : 'Order Submitted!'}</h1>
        <p className="text-zinc-400 mb-1">Order placed for <span className="text-white font-medium">{confirmation.store_name}</span></p>
        <p className="text-2xl font-bold text-orange-400 mb-8">{confirmation.order_number}</p>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-left mb-8">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">Order Summary</h2>
          <div className="space-y-2">
            {confirmation.items.map((it) => (
              <div key={it.portal_product_id} className="flex justify-between text-sm border-b border-zinc-800 pb-2">
                <div>
                  <div className="text-white">{it.product_name}</div>
                  <div className="text-zinc-500 text-xs">{it.sku}</div>
                </div>
                <div className="text-white font-semibold">{it.qty_ordered}</div>
              </div>
            ))}
          </div>
        </div>

        <Button onClick={startNewOrder} className="bg-orange-500 hover:bg-orange-600 text-white">
          Place Another Order
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-orange-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <ShoppingCart className="w-3.5 h-3.5" /> {draftOrder ? `Editing Draft · ${draftOrder.order_number}` : 'Create New Order'}
          </div>
          <h1 className="text-2xl font-bold text-white">Order Page</h1>
          <p className="text-white text-sm mt-1">Issues Contact The Support Team 905-682-0171</p>
        </div>
      </div>

      {/* Store context banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
        {store ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                <Store className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <div className="text-white font-semibold flex items-center gap-2">
                  {store.store_name}
                  <Badge variant="orange" className="text-[10px]">Selected Store</Badge>
                </div>
                <div className="text-xs text-zinc-400 flex flex-wrap gap-x-3 gap-y-1 mt-1">
                  {store.contact_name && <span className="flex items-center gap-1"><UserCircle2 className="w-3 h-3" />{store.contact_name}</span>}
                  {store.contact_email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{store.contact_email}</span>}
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setPickerOpen(true)}
              className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            >
              <ArrowLeftRight className="w-4 h-4 mr-2" /> Change Store
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm text-zinc-400">No store selected. Choose which store you're placing an order for.</div>
            <Button onClick={() => setPickerOpen(true)} className="bg-orange-500 hover:bg-orange-600 text-white">
              <Store className="w-4 h-4 mr-2" /> Select Store
            </Button>
          </div>
        )}
      </div>

      <div className={!store ? "opacity-50 pointer-events-none" : ""}>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search by product name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-zinc-900 border-zinc-800 text-white h-11"
          />
        </div>

        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === cat
                    ? "bg-orange-500 text-white"
                    : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-zinc-500">Loading products...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">
            {products.length === 0 ? "No products available yet." : "No products match your search."}
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-800/60 text-zinc-400">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-right w-28">neōb HQ Stock</th>
                  <th className="px-3 py-2 text-right w-28">Your Shelf</th>
                  <th className="px-3 py-2 text-right w-28">Suggested</th>
                  <th className="px-3 py-2 text-right w-44">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const skuKey = String(p.sku || "").toLowerCase();
                  const shelf = shelfStockBySku[skuKey]?.[store?.store_name];
                  return (
                    <PortalProductRow
                      key={p.id}
                      product={p}
                      quantity={quantities[p.id]}
                      onChange={handleQtyChange}
                      stock={stockBySku[skuKey]}
                      shelfStock={typeof shelf === "number" ? shelf : undefined}
                      suggestion={suggestionsBySku[skuKey]}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {store && (
        <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <label className="block text-sm font-semibold text-white mb-2">
            Order Notes
          </label>
          <p className="text-xs text-zinc-500 mb-2">
            Add any special instructions, delivery preferences, or other notes for this order. Saves automatically as a draft.
          </p>
          <Textarea
            value={orderNote}
            onChange={(e) => setOrderNote(e.target.value)}
            placeholder="e.g. Please deliver before noon, leave at back door..."
            rows={4}
            className="bg-zinc-800 border-zinc-700 text-white"
          />
        </div>
      )}

      {store && cartItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-zinc-900 border-t border-zinc-800 z-40">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="text-sm">
              <div className="text-white font-semibold flex items-center gap-2">
                {cartItems.length} {cartItems.length === 1 ? "product" : "products"} · {store.store_name}
                {autoSaveState === "saving" && (
                  <span className="flex items-center gap-1 text-xs text-zinc-400 font-normal">
                    <Loader2 className="w-3 h-3 animate-spin" /> Saving draft...
                  </span>
                )}
                {autoSaveState === "saved" && (
                  <span className="flex items-center gap-1 text-xs text-green-400 font-normal">
                    <Check className="w-3 h-3" /> Draft saved
                  </span>
                )}
              </div>
              <div className="text-zinc-400 text-xs">
                {totalUnits} units total
                {draftOrder && <span className="ml-2">· {draftOrder.order_number}</span>}
              </div>
            </div>
            <Button onClick={() => setReviewOpen(true)} className="bg-orange-500 hover:bg-orange-600 text-white">
              <ShoppingCart className="w-4 h-4 mr-2" />
              Review Order
            </Button>
          </div>
        </div>
      )}

      <OrderReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        items={cartItems}
        onSubmit={(payload) => handleSubmitOrder({ ...payload, notes: payload.notes || orderNote })}
        submitting={submitting}
        showSaveDraft={true}
      />

      <StorePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(a) => { setStore(a); setPickerOpen(false); }}
      />
    </div>
  );
}