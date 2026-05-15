import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import {
  getPortalSession,
  clearPortalSession,
  getActiveStore,
} from "@/components/portal/portalSession";
import PortalTopBar from "@/components/portal/PortalTopBar";

const statusVariant = (s) => ({
  submitted: "blue",
  acknowledged: "purple",
  in_progress: "orange",
  fulfilled: "green",
  cancelled: "red",
}[s] || "default");

export default function PortalOrderHistory() {
  const navigate = useNavigate();
  const session = getPortalSession();
  const activeStore = getActiveStore();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      navigate("/portal/login", { replace: true });
      return;
    }
    if (!activeStore) {
      navigate("/portal/select-store", { replace: true });
      return;
    }
    (async () => {
      try {
        const list = await base44.entities.PortalOrder.filter(
          { store_name: activeStore },
          "-created_date",
          200
        );
        setOrders(list || []);
      } catch {
        setOrders([]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line
  }, []);

  const handleLogout = () => {
    clearPortalSession();
    navigate("/portal/login", { replace: true });
  };

  if (!session || !activeStore) return null;

  return (
    <div className="min-h-screen bg-zinc-950">
      <PortalTopBar storeName={activeStore} onLogout={handleLogout} />
      <div className="max-w-5xl mx-auto px-4 py-6">
        <Button
          variant="ghost"
          onClick={() => navigate("/portal/order")}
          className="text-zinc-400 hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Ordering
        </Button>

        <h1 className="text-2xl font-bold text-white mb-1">Your Order History</h1>
        <p className="text-zinc-400 text-sm mb-6">Showing orders for {activeStore}</p>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800/60 text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left">Order #</th>
                <th className="px-3 py-2 text-left">Order Date</th>
                <th className="px-3 py-2 text-left">Requested Delivery</th>
                <th className="px-3 py-2 text-right">Items</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="px-3 py-8 text-center text-zinc-500">Loading...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan="5" className="px-3 py-8 text-center text-zinc-500">No orders yet for this store.</td></tr>
              ) : orders.map((o) => (
                <tr key={o.id} className="border-t border-zinc-800">
                  <td className="px-3 py-2 text-orange-400 font-mono">{o.order_number}</td>
                  <td className="px-3 py-2 text-zinc-300">{o.order_date || "—"}</td>
                  <td className="px-3 py-2 text-zinc-300">{o.requested_delivery_date || "—"}</td>
                  <td className="px-3 py-2 text-right text-white">{(o.items || []).length}</td>
                  <td className="px-3 py-2">
                    <Badge variant={statusVariant(o.status)} className="text-[10px]">
                      {(o.status || "").replace("_", " ")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}