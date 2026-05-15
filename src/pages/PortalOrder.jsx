import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ShoppingCart, CheckCircle2 } from "lucide-react";
import { getPortalSession, clearPortalSession, getActiveStore, setActiveStore } from "@/components/portal/portalSession";
import PortalTopBar from "@/components/portal/PortalTopBar";
import PortalTabBar from "@/components/portal/PortalTabBar";
import PortalProductRow from "@/components/portal/PortalProductRow";
import OrderReviewDialog from "@/components/portal/OrderReviewDialog";
import PortalAdjustmentTab from "@/components/portal/PortalAdjustmentTab";
import { History, Repeat } from "lucide-react";

export default function PortalOrder() {
  const navigate = useNavigate();
  const session = getPortalSession();
  const activeStore = getActiveStore();
  const assignedStores = session?.assigned_stores || (session ? [session.store_name] : []);
  const isMultiStore = assignedStores.length > 1;

  const [activeTab, setActiveTab] = useState("order");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [quantities, setQuantities] = useState({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    if (!session) {
      navigate("/portal/login", { replace: true });
      return;
    }
    if (!activeStore) {
      // Need to pick a store first (multi-store account) or default to single
      if (assignedStores.length === 1) {
        setActiveStore(assignedStores[0]);
      } else {
        navigate("/portal/select-store", { replace: true });
        return;
      }
    }
    (async () => {
      try {
        const all = await base44.entities.PortalProduct.filter({ portal_hidden: false }, "display_order", 500);
        setProducts(all || []);
      } catch (err) {
        setProducts([]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line
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
      if (!value || isNaN(n) || n <= 0) {
        delete next[id];
      } else {
        next[id] = n;
      }
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

  const handleLogout = () => {
    clearPortalSession();
    navigate("/portal/login", { replace: true });
  };

  const handleSubmitOrder = async ({ requested_delivery_date, notes }) => {
    setSubmitting(true);
    try {
      const orderStore = getActiveStore() || session.store_name;
      const res = await base44.functions.invoke("createPortalOrder", {
        store_name: orderStore,
        contact_name: session.contact_name || orderStore,
        contact_email: session.contact_email || "",
        submitted_by: session.contact_name || orderStore,
        requested_delivery_date,
        notes,
        items: cartItems
      });
      if (res?.data?.success) {
        setConfirmation({
          order_number: res.data.order.order_number,
          items: cartItems
        });
        setQuantities({});
        setReviewOpen(false);
      } else {
        alert(res?.data?.error || "Failed to submit order");
      }
    } catch (err) {
      alert("Failed to submit order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) return null;
  const displayStore = activeStore || session.store_name;

  if (confirmation) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <PortalTopBar storeName={displayStore} onLogout={handleLogout} />
        <PortalTabBar activeTab={activeTab} onChange={setActiveTab} />
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Order Submitted!</h1>
          <p className="text-zinc-400 mb-1">Your order number is</p>
          <p className="text-2xl font-bold text-orange-400 mb-8">{confirmation.order_number}</p>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-left mb-8">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
              Order Summary
            </h2>
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

          <Button
            onClick={() => setConfirmation(null)}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            Place Another Order
          </Button>
        </div>
      </div>
    );
  }

  if (activeTab === "adjustment") {
    return (
      <div className="min-h-screen bg-zinc-950 pb-24">
        <PortalTopBar storeName={displayStore} onLogout={handleLogout} />
        <PortalTabBar activeTab={activeTab} onChange={setActiveTab} />
        <PortalAdjustmentTab session={session} activeStore={activeStore} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 pb-24">
      <PortalTopBar storeName={displayStore} onLogout={handleLogout} />
      <PortalTabBar activeTab={activeTab} onChange={setActiveTab} />

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Place Your Order</h1>
            <p className="text-zinc-400 text-sm">Browse available products and add quantities</p>
          </div>
          <div className="flex items-center gap-2">
            {isMultiStore && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/portal/select-store")}
                className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              >
                <Repeat className="w-4 h-4 mr-2" /> Switch Store
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/portal/orders")}
              className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
            >
              <History className="w-4 h-4 mr-2" /> Order History
            </Button>
          </div>
        </div>

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

      {cartItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 z-40">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="text-sm">
              <div className="text-white font-semibold">
                {cartItems.length} {cartItems.length === 1 ? "product" : "products"} selected
              </div>
              <div className="text-zinc-400 text-xs">{totalUnits} units total</div>
            </div>
            <Button
              onClick={() => setReviewOpen(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
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
    </div>
  );
}