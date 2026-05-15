import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ShoppingCart, CheckCircle2, Store, UserCircle2, Phone, Mail, ArrowLeftRight } from "lucide-react";
import PortalProductRow from "@/components/portal/PortalProductRow";
import OrderReviewDialog from "@/components/portal/OrderReviewDialog";
import StorePickerDialog from "@/components/portal-admin/StorePickerDialog";

export default function SalesRepOrder() {
  const [user, setUser] = useState(null);
  const [store, setStore] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(true);

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [quantities, setQuantities] = useState({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const all = await base44.entities.PortalProduct.filter({ portal_hidden: false }, "display_order", 500);
        setProducts(all || []);
      } catch {
        setProducts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

  const handleSubmitOrder = async ({ requested_delivery_date, notes }) => {
    if (!store) return;
    setSubmitting(true);
    try {
      const repName = user?.full_name || user?.email || "Sales Rep";
      const repNote = `[Phone order placed by ${repName}]${notes ? `\n${notes}` : ""}`;
      const res = await base44.functions.invoke("createPortalOrder", {
        store_name: store.store_name,
        contact_name: store.contact_name || store.store_name,
        contact_email: store.contact_email || "",
        submitted_by: repName,
        requested_delivery_date,
        notes: repNote,
        items: cartItems
      });
      if (res?.data?.success) {
        setConfirmation({
          order_number: res.data.order.order_number,
          items: cartItems,
          store_name: store.store_name
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
  };

  if (confirmation) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-400" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Order Submitted!</h1>
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
            <Phone className="w-3.5 h-3.5" /> Sales Rep · Phone Order
          </div>
          <h1 className="text-2xl font-bold text-white">Place Order on Behalf of Store</h1>
          <p className="text-zinc-400 text-sm mt-1">Walk the customer through the same catalog they see online.</p>
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
                  <th className="px-3 py-2 text-right w-32">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <PortalProductRow
                    key={p.id}
                    product={p}
                    quantity={quantities[p.id]}
                    onChange={handleQtyChange}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {store && cartItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-zinc-900 border-t border-zinc-800 z-40">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="text-sm">
              <div className="text-white font-semibold">
                {cartItems.length} {cartItems.length === 1 ? "product" : "products"} · {store.store_name}
              </div>
              <div className="text-zinc-400 text-xs">{totalUnits} units total</div>
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
        onSubmit={handleSubmitOrder}
        submitting={submitting}
      />

      <StorePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(a) => { setStore(a); setPickerOpen(false); }}
      />
    </div>
  );
}