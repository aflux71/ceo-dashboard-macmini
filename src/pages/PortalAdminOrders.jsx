import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Eye, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import OrderDetailDialog from "@/components/portal-admin/OrderDetailDialog";

const STATUS_FILTERS = ["All", "draft", "submitted", "acknowledged", "in_progress", "fulfilled", "cancelled"];

const statusVariant = (s) => ({
  draft: "default",
  submitted: "blue",
  acknowledged: "purple",
  in_progress: "orange",
  fulfilled: "green",
  cancelled: "red"
}[s] || "default");

export default function PortalAdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    const list = await base44.entities.PortalOrder.list("-created_date", 1000);
    setOrders(list || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "All" && o.status !== statusFilter) return false;
      if (!q) return true;
      return (o.store_name || "").toLowerCase().includes(q) ||
             (o.order_number || "").toLowerCase().includes(q);
    });
  }, [orders, search, statusFilter]);

  const handleSaveOrder = async (updates) => {
    if (!selectedOrder) return;
    await base44.entities.PortalOrder.update(selectedOrder.id, updates);
    setSelectedOrder(null);
    load();
  };

  const exportCsv = () => {
    const rows = [["Order #", "Store", "Submitted By", "Order Date", "Requested Delivery", "Items", "Status"]];
    filtered.forEach((o) => {
      rows.push([
        o.order_number, o.store_name, o.submitted_by || "",
        o.order_date || "", o.requested_delivery_date || "",
        (o.items || []).length, o.status
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portal-orders-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Portal Orders</h1>
          <p className="text-zinc-400 text-sm mt-1">Review and manage submitted store orders</p>
        </div>
        <Button onClick={exportCsv} variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s
                ? "bg-orange-500 text-white"
                : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white"
            }`}
          >
            {s === "All" ? "All" : s.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          placeholder="Search by store name or order number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-zinc-900 border-zinc-800 text-white"
        />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/60 text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">Order #</th>
              <th className="px-3 py-2 text-left">Store</th>
              <th className="px-3 py-2 text-left">Submitted By</th>
              <th className="px-3 py-2 text-left">Order Date</th>
              <th className="px-3 py-2 text-left">Requested</th>
              <th className="px-3 py-2 text-right">Items</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" className="px-3 py-8 text-center text-zinc-500">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan="8" className="px-3 py-8 text-center text-zinc-500">No orders found</td></tr>
            ) : filtered.map((o) => (
              <tr key={o.id} className="border-t border-zinc-800 hover:bg-zinc-800/30 cursor-pointer" onClick={() => setSelectedOrder(o)}>
                <td className="px-3 py-2 text-orange-400 font-mono">{o.order_number}</td>
                <td className="px-3 py-2 text-white">{o.store_name}</td>
                <td className="px-3 py-2 text-zinc-400">{o.submitted_by || "—"}</td>
                <td className="px-3 py-2 text-zinc-400">{o.order_date || "—"}</td>
                <td className="px-3 py-2 text-zinc-400">{o.requested_delivery_date || "—"}</td>
                <td className="px-3 py-2 text-right text-white">{(o.items || []).length}</td>
                <td className="px-3 py-2">
                  <Badge variant={statusVariant(o.status)} className="text-[10px]">
                    {(o.status || "").replace("_", " ")}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  {o.status === 'draft' ? (
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/portal-admin/sales-rep-order?draftId=${o.id}`); }} className="text-orange-400 hover:text-orange-300">
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Reopen to Edit
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelectedOrder(o); }} className="text-zinc-400 hover:text-white">
                      <Eye className="w-3.5 h-3.5 mr-1" /> View
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <OrderDetailDialog
        open={!!selectedOrder}
        onOpenChange={(o) => { if (!o) setSelectedOrder(null); }}
        order={selectedOrder}
        onSave={handleSaveOrder}
      />
    </div>
  );
}