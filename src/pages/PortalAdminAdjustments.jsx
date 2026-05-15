import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Eye, Lock, Plus } from "lucide-react";
import AdjustmentDetailDialog from "@/components/portal-admin/AdjustmentDetailDialog";
import AdminCreateAdjustmentDialog from "@/components/portal-admin/AdminCreateAdjustmentDialog";

const STATUS_FILTERS = ["All", "submitted", "acknowledged", "reviewed", "applied", "rejected"];

const statusVariant = (s) => ({
  submitted: "blue",
  acknowledged: "purple",
  reviewed: "orange",
  applied: "green",
  rejected: "red"
}[s] || "default");

const formatQty = (q) => {
  const n = Number(q) || 0;
  if (n > 0) return `+${n}`;
  return String(n);
};

const formatDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
};

export default function PortalAdminAdjustments() {
  const [currentUser, setCurrentUser] = useState(undefined);
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [allowedStores, setAllowedStores] = useState(null); // null = no restriction (admin)

  const load = async (storesFilter) => {
    setLoading(true);
    const list = await base44.entities.InventoryAdjustment.list("-created_date", 1000);
    let result = list || [];
    if (storesFilter && Array.isArray(storesFilter)) {
      const set = new Set(storesFilter);
      result = result.filter((a) => set.has(a.store_name));
    }
    setAdjustments(result);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        setCurrentUser(me);
        if (me && me.role !== "admin") {
          const accounts = await base44.entities.PortalAccount.filter({ is_active: true });
          const myAccounts = (accounts || []).filter((a) =>
            (a.linked_user_emails || []).map((e) => (e || "").toLowerCase()).includes((me.email || "").toLowerCase())
          );
          const stores = Array.from(
            new Set(
              myAccounts.flatMap((a) => (a.assigned_stores && a.assigned_stores.length ? a.assigned_stores : [a.store_name]))
            )
          ).filter(Boolean);
          setAllowedStores(stores);
          await load(stores);
        } else {
          setAllowedStores(null);
          await load(null);
        }
      } catch {
        setCurrentUser(null);
        await load(null);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return adjustments.filter((a) => {
      if (statusFilter !== "All" && a.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (a.store_name || "").toLowerCase().includes(q) ||
        (a.sku || "").toLowerCase().includes(q) ||
        (a.product_name || "").toLowerCase().includes(q) ||
        (a.adjustment_number || "").toLowerCase().includes(q)
      );
    });
  }, [adjustments, search, statusFilter]);

  const handleSave = async (id, updates) => {
    await base44.entities.InventoryAdjustment.update(id, updates);
    await load(allowedStores);
  };

  const exportCsv = () => {
    const rows = [["Adj #", "Store", "Product", "SKU", "Qty", "Reason", "Submitted By", "Submitted Date", "Status", "Acknowledged By", "Acknowledged At", "Notes", "Internal Notes"]];
    filtered.forEach((a) => {
      rows.push([
        a.adjustment_number || "",
        a.store_name || "",
        a.product_name || "",
        a.sku || "",
        formatQty(a.quantity),
        a.adjustment_reason_label || "",
        a.submitted_by || "",
        formatDate(a.created_date),
        a.status || "",
        a.acknowledged_by || "",
        a.acknowledged_at || "",
        a.notes || "",
        a.internal_notes || ""
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-adjustments-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (currentUser === undefined) return null;
  const isAdmin = currentUser?.role === "admin";
  if (!isAdmin && !(currentUser && allowedStores && allowedStores.length > 0)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <Lock className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Access Restricted</h2>
          <p className="text-zinc-400 text-sm">
            You do not have access to inventory adjustment requests.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory Adjustment Requests</h1>
          <p className="text-zinc-400 text-sm mt-1">Review and manage adjustment requests submitted by stores</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportCsv} variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="w-4 h-4 mr-2" /> New Request
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize ${
              statusFilter === s
                ? "bg-orange-500 text-white"
                : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white"
            }`}
          >
            {s === "All" ? "All" : s}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          placeholder="Search by store, SKU, product, or adjustment number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-zinc-900 border-zinc-800 text-white focus-visible:ring-orange-500"
        />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/60 text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">Adj #</th>
              <th className="px-3 py-2 text-left">Store</th>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-left">Reason</th>
              <th className="px-3 py-2 text-left">Submitted By</th>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="10" className="px-3 py-8 text-center text-zinc-500">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan="10" className="px-3 py-8 text-center text-zinc-500">No adjustment requests found</td></tr>
            ) : filtered.map((a) => {
              const q = Number(a.quantity) || 0;
              return (
                <tr
                  key={a.id}
                  className="border-t border-zinc-800 hover:bg-zinc-800/30 cursor-pointer"
                  onClick={() => setSelected(a)}
                >
                  <td className="px-3 py-2 text-orange-400 font-mono">{a.adjustment_number}</td>
                  <td className="px-3 py-2 text-white">{a.store_name}</td>
                  <td className="px-3 py-2 text-zinc-200">{a.product_name}</td>
                  <td className="px-3 py-2 text-zinc-400 font-mono text-xs">{a.sku}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${q < 0 ? "text-red-400" : "text-green-400"}`}>
                    {formatQty(q)}
                  </td>
                  <td className="px-3 py-2 text-zinc-300">{a.adjustment_reason_label || "—"}</td>
                  <td className="px-3 py-2 text-zinc-400">{a.submitted_by || "—"}</td>
                  <td className="px-3 py-2 text-zinc-400">{formatDate(a.created_date)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={statusVariant(a.status)} className="text-[10px] capitalize">
                      {a.status || ""}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); setSelected(a); }}
                      className="text-zinc-400 hover:text-white"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      {a.status === "submitted" ? "View / Acknowledge" : "View"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AdjustmentDetailDialog
        open={!!selected}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
        adjustment={selected}
        currentUserName={currentUser?.full_name || currentUser?.email || "ERP Admin"}
        onSave={handleSave}
      />

      <AdminCreateAdjustmentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        currentUserName={currentUser?.full_name || currentUser?.email || "ERP Admin"}
        onCreated={() => load()}
      />
    </div>
  );
}