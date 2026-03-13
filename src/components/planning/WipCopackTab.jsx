import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  Plus, Package, Loader2, AlertTriangle, CheckCircle2, Clock, Eye, EyeOff,
  Timer, Send, Building2, MapPin, RotateCcw, ExternalLink, Hammer, ShoppingCart, FileText, Search, ChevronDown
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import Badge from "@/components/ui/Badge";

function addDays(dateStr, days) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-CA", {
    month: "short", day: "numeric", year: "numeric",
  });
}

const COPACK_STATUSES = [
  { key: "draft",         label: "Draft",         dot: "bg-zinc-400",   text: "text-zinc-400",   bg: "bg-zinc-500/10",  border: "border-zinc-500/20" },
  { key: "sent",          label: "Sent",          dot: "bg-blue-400",   text: "text-blue-400",   bg: "bg-blue-500/10",  border: "border-blue-500/20" },
  { key: "in_production", label: "In Production", dot: "bg-amber-400",  text: "text-amber-400",  bg: "bg-amber-500/10", border: "border-amber-500/20" },
  { key: "qc_hold",       label: "QC Hold",       dot: "bg-purple-400", text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  { key: "returned",      label: "Returned",      dot: "bg-cyan-400",   text: "text-cyan-400",   bg: "bg-cyan-500/10",  border: "border-cyan-500/20" },
  { key: "complete",      label: "Complete",       dot: "bg-green-400",  text: "text-green-400",  bg: "bg-green-500/10", border: "border-green-500/20" },
];

const COPACK_ADVANCE = {
  draft:         { next: "sent",          label: "Mark Sent",          icon: Send },
  sent:          { next: "in_production", label: "Mark In Production", icon: Hammer },
  in_production: { next: "qc_hold",       label: "Move to QC Hold",   icon: Clock },
  qc_hold:       { next: "returned",      label: "Mark Returned",     icon: RotateCcw },
  returned:      { next: "complete",      label: "Mark Complete",      icon: CheckCircle2 },
};

const emptyCopackForm = { product_name: "", sku: "", quantity: "", co_packer_name: "", ship_by: "", notes: "" };

export default function WipCopackTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyCopackForm);
  const [returnDialog, setReturnDialog] = useState(null);
  const [returnDate, setReturnDate] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [poDialog, setPoDialog] = useState(null); // the copack order being added to a PO
  const [selectedPoId, setSelectedPoId] = useState("new");
  const [newPoSupplier, setNewPoSupplier] = useState("");
  const [newPoExpectedDate, setNewPoExpectedDate] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["planning_copack_orders"],
    queryFn: () => base44.entities.CopackOrder.list("-created_date", 500),
  });

  const { data: draftPOs = [] } = useQuery({
    queryKey: ["draft_purchase_orders"],
    queryFn: () => base44.entities.PurchaseOrder.filter({ status: "draft" }, "-created_date"),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers_list"],
    queryFn: () => base44.entities.Supplier.list(),
  });

  const today = new Date().toISOString().split("T")[0];
  const sevenDaysOut = addDays(today, 7);

  const urgentShipments = useMemo(() =>
    orders.filter((o) => o.status === "draft" && o.ship_by && o.ship_by <= sevenDaysOut && o.ship_by >= today),
    [orders, today, sevenDaysOut]
  );

  const overdueShipments = useMemo(() =>
    orders.filter((o) => o.status === "draft" && o.ship_by && o.ship_by < today),
    [orders, today]
  );

  const grouped = useMemo(() => {
    const map = {};
    COPACK_STATUSES.forEach((s) => { map[s.key] = []; });
    orders.forEach((o) => { if (map[o.status]) map[o.status].push(o); else map.draft.push(o); });
    return map;
  }, [orders]);

  const stats = useMemo(() => ({
    totalActive: orders.filter((o) => o.status !== "complete").length,
    awaitingShipment: orders.filter((o) => o.status === "draft").length,
    inProduction: orders.filter((o) => o.status === "in_production").length,
    overdue: orders.filter((o) => o.status !== "complete" && o.ship_by && o.ship_by < today && o.status === "draft").length,
  }), [orders, today]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.CopackOrder.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["planning_copack_orders"] }); toast.success("Co-pack order created"); setDialogOpen(false); setForm(emptyCopackForm); },
    onError: (err) => toast.error(`Failed to create order: ${err?.response?.data?.message || err?.message || String(err)}`),
  });

  const advanceMutation = useMutation({
    mutationFn: ({ id, updates }) => base44.entities.CopackOrder.update(id, updates),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["planning_copack_orders"] }); toast.success("Status updated"); },
    onError: (err) => toast.error(`Failed to update: ${err?.message || String(err)}`),
  });

  const handleCreate = () => {
    if (!form.product_name || !form.sku || !form.quantity || !form.co_packer_name) { toast.error("Product name, SKU, quantity, and co-packer are required"); return; }
    createMutation.mutate({ product_name: form.product_name, sku: form.sku, quantity: Number(form.quantity), co_packer_name: form.co_packer_name, ship_by: form.ship_by || null, notes: form.notes || "", status: "draft" });
  };

  const handleAdvance = (order) => {
    const advance = COPACK_ADVANCE[order.status];
    if (!advance) return;
    if (advance.next === "returned") { setReturnDialog(order); setReturnDate(today); return; }
    const updates = { status: advance.next };
    if (advance.next === "sent") updates.sent_date = today;
    advanceMutation.mutate({ id: order.id, updates });
  };

  const handleReturnConfirm = () => {
    if (!returnDialog) return;
    advanceMutation.mutate({ id: returnDialog.id, updates: { status: "returned", actual_return_date: returnDate || today } }, { onSuccess: () => { setReturnDialog(null); setReturnDate(""); } });
  };

  const handleCreateQcCheck = (order) => {
    base44.entities.ReviewQueue?.create?.({ batch_id: order.id, sku: order.sku, product_name: order.product_name, quantity: order.quantity, status: "pending", notes: `Co-pack return from ${order.co_packer_name}. Return date: ${order.actual_return_date || today}`, created_at: new Date().toISOString() })
      .then(() => toast.success("QC check created in Review Queue")).catch(() => toast.error("Failed to create QC check"));
  };

  const daysUntilShipBy = (order) => { if (!order.ship_by) return null; return Math.ceil((new Date(order.ship_by) - new Date(today)) / 86400000); };

  const addPoMutation = useMutation({
    mutationFn: async ({ order, poId, supplier, expectedDate }) => {
      const lineItem = {
        sku: order.sku,
        name: order.product_name,
        quantity: order.quantity || 0,
        unit: "units",
        unit_cost: 0,
        total_cost: 0,
        received_qty: 0,
      };
      if (poId === "new") {
        const poNumber = `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
        await base44.entities.PurchaseOrder.create({
          po_number: poNumber,
          supplier: supplier || order.co_packer_name,
          status: "draft",
          order_date: today,
          expected_date: expectedDate || null,
          items: [lineItem],
          notes: `Created from co-pack order: ${order.product_name}`,
        });
      } else {
        const existing = draftPOs.find((p) => p.id === poId);
        if (!existing) throw new Error("PO not found");
        const updatedItems = [...(existing.items || []), lineItem];
        await base44.entities.PurchaseOrder.update(poId, { items: updatedItems });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["draft_purchase_orders"] });
      toast.success("Added to Purchase Order");
      setPoDialog(null);
      setSelectedPoId("new");
      setNewPoSupplier("");
      setNewPoExpectedDate("");
    },
    onError: (err) => toast.error(`Failed: ${err?.message || String(err)}`),
  });

  const handleOpenPoDialog = (order) => {
    setPoDialog(order);
    setSelectedPoId(draftPOs.length > 0 ? draftPOs[0].id : "new");
    setNewPoSupplier(order.co_packer_name || "");
    setSupplierSearch(order.co_packer_name || "");
    setNewPoExpectedDate("");
    setSupplierDropdownOpen(false);
  };

  return (
    <div className="space-y-4">
      {(urgentShipments.length > 0 || overdueShipments.length > 0) && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${overdueShipments.length > 0 ? "bg-red-500/5 border-red-500/20" : "bg-amber-500/5 border-amber-500/20"}`}>
          <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${overdueShipments.length > 0 ? "text-red-400" : "text-amber-400"}`} />
          <div className="space-y-1 text-sm">
            {overdueShipments.length > 0 && <p className="text-red-400 font-medium">{overdueShipments.length} order{overdueShipments.length > 1 ? "s" : ""} overdue for shipment</p>}
            {urgentShipments.length > 0 && <p className="text-amber-400">{urgentShipments.length} order{urgentShipments.length > 1 ? "s" : ""} ship within 7 days: <span className="text-zinc-300">{urgentShipments.map((o) => o.product_name || o.sku).join(", ")}</span></p>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-cyan-500/30 transition-colors"><p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Total Active</p><p className="text-2xl font-bold text-cyan-400 mt-1">{stats.totalActive}</p><p className="text-xs text-zinc-500 mt-0.5">open orders</p></div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-blue-500/30 transition-colors"><p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Awaiting Shipment</p><p className="text-2xl font-bold text-blue-400 mt-1">{stats.awaitingShipment}</p><p className="text-xs text-zinc-500 mt-0.5">draft, not sent</p></div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-amber-500/30 transition-colors"><p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">In Production</p><p className="text-2xl font-bold text-amber-400 mt-1">{stats.inProduction}</p><p className="text-xs text-zinc-500 mt-0.5">at co-packer</p></div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-red-500/30 transition-colors"><p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Overdue</p><p className={`text-2xl font-bold mt-1 ${stats.overdue > 0 ? "text-red-400" : "text-zinc-600"}`}>{stats.overdue}</p><p className="text-xs text-zinc-500 mt-0.5">past ship-by date</p></div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button size="sm" onClick={() => setDialogOpen(true)} className="bg-cyan-600 hover:bg-cyan-700 text-white"><Plus className="w-4 h-4 mr-1.5" />New Co-pack Order</Button>
        <button onClick={() => setShowCompleted(!showCompleted)} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          {showCompleted ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showCompleted ? "Hide Completed" : "Show Completed"}
        </button>
      </div>

      {isLoading ? (
        <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-12 flex items-center justify-center"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {COPACK_STATUSES.map((statusDef) => {
            const items = grouped[statusDef.key] || [];
            if (statusDef.key === "complete" && !showCompleted) return null;
            if (items.length === 0 && statusDef.key === "complete") return null;
            return (
              <div key={statusDef.key} className="space-y-2">
                <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${statusDef.bg} border ${statusDef.border}`}>
                  <div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${statusDef.dot}`}></span><span className={`text-sm font-medium ${statusDef.text}`}>{statusDef.label}</span></div>
                  <span className={`text-xs font-medium ${statusDef.text}`}>{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <div className="p-3 rounded-lg border border-dashed border-zinc-800 text-center"><p className="text-xs text-zinc-600">No orders</p></div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {items.map((order) => {
                      const advance = COPACK_ADVANCE[order.status];
                      const shipDays = daysUntilShipBy(order);
                      const isOverdue = order.status === "draft" && order.ship_by && order.ship_by < today;
                      return (
                        <Card key={order.id} className={`bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors ${isOverdue ? "border-red-500/30" : ""} ${order.status === "complete" ? "opacity-75" : ""}`}>
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0"><h4 className="text-sm font-medium text-zinc-100 truncate">{order.product_name}</h4><span className="text-xs font-mono text-zinc-500">{order.sku}</span></div>
                              <div className="flex items-center gap-1.5 shrink-0">{isOverdue && <Badge variant="red">Overdue</Badge>}{order.status === "complete" && <CheckCircle2 className="w-4 h-4 text-green-400" />}</div>
                            </div>
                            <div className="space-y-1 text-xs text-zinc-500">
                              <div className="flex items-center justify-between"><span className="flex items-center gap-1"><Building2 className="w-3 h-3" />Co-packer</span><span className="text-zinc-300">{order.co_packer_name}</span></div>
                              <div className="flex items-center justify-between"><span className="flex items-center gap-1"><Package className="w-3 h-3" />Quantity</span><span className="text-zinc-300">{order.quantity?.toLocaleString()}</span></div>
                              {order.ship_by && <div className="flex items-center justify-between"><span className="flex items-center gap-1"><MapPin className="w-3 h-3" />Ship By</span><span className={`font-medium ${isOverdue ? "text-red-400" : shipDays !== null && shipDays <= 7 ? "text-amber-400" : "text-zinc-300"}`}>{formatDate(order.ship_by)}</span></div>}
                              {order.sent_date && <div className="flex items-center justify-between"><span className="flex items-center gap-1"><Send className="w-3 h-3" />Sent</span><span className="text-zinc-300">{formatDate(order.sent_date)}</span></div>}
                              {order.actual_return_date && <div className="flex items-center justify-between"><span className="flex items-center gap-1"><RotateCcw className="w-3 h-3" />Returned</span><span className="text-zinc-300">{formatDate(order.actual_return_date)}</span></div>}
                            </div>
                            {shipDays !== null && order.status === "draft" && <div className={`flex items-center gap-1 text-xs ${shipDays < 0 ? "text-red-400" : shipDays <= 3 ? "text-amber-400" : "text-zinc-500"}`}><Timer className="w-3 h-3" />{shipDays < 0 ? `${Math.abs(shipDays)}d overdue` : shipDays === 0 ? "Ship today" : `${shipDays}d until ship-by`}</div>}
                            {order.notes && <p className="text-xs text-zinc-500 italic truncate">{order.notes}</p>}
                            {order.status === "returned" && <Button size="sm" variant="outline" onClick={() => handleCreateQcCheck(order)} className="w-full text-xs border-purple-500/30 text-purple-400 hover:bg-purple-500/10"><ExternalLink className="w-3 h-3 mr-1.5" />Create QC Check</Button>}
                            {advance && <Button size="sm" variant="outline" onClick={() => handleAdvance(order)} disabled={advanceMutation.isPending} className={`w-full text-xs ${order.status === "draft" ? "border-blue-500/30 text-blue-400 hover:bg-blue-500/10" : order.status === "sent" ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10" : order.status === "in_production" ? "border-purple-500/30 text-purple-400 hover:bg-purple-500/10" : order.status === "qc_hold" ? "border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10" : "border-green-500/30 text-green-400 hover:bg-green-500/10"}`}>{advanceMutation.isPending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : (() => { const AdvIcon = advance.icon; return <AdvIcon className="w-3 h-3 mr-1.5" />; })()}{advance.label}</Button>}
                            {order.status !== "complete" && (
                              <Button size="sm" variant="outline" onClick={() => handleOpenPoDialog(order)} className="w-full text-xs border-orange-500/30 text-orange-400 hover:bg-orange-500/10">
                                <ShoppingCart className="w-3 h-3 mr-1.5" />Add to P.O.
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader><DialogTitle>New Co-pack Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-zinc-400 text-xs">Product Name *</Label><Input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} placeholder="Lavender Body Lotion" className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-zinc-400 text-xs">SKU *</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="LAV-BL-001" className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm font-mono" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-zinc-400 text-xs">Quantity *</Label><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="5000" className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-zinc-400 text-xs">Co-packer Name *</Label><Input value={form.co_packer_name} onChange={(e) => setForm({ ...form, co_packer_name: e.target.value })} placeholder="Acme Fill Co." className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm" /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-zinc-400 text-xs">Ship By Date</Label><Input type="date" value={form.ship_by} onChange={(e) => setForm({ ...form, ship_by: e.target.value })} className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-zinc-400 text-xs">Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Special instructions, packaging requirements, etc." rows={2} className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm resize-none" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-zinc-700">Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending} className="bg-cyan-600 hover:bg-cyan-700 text-white">{createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}Create Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to P.O. Dialog */}
      <Dialog open={!!poDialog} onOpenChange={(open) => { if (!open) { setPoDialog(null); setSelectedPoId("new"); setNewPoSupplier(""); setNewPoExpectedDate(""); } }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          {poDialog && (
            <>
              <DialogHeader><DialogTitle>Add to Purchase Order</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-sm">
                  <p className="text-zinc-200 font-medium">{poDialog.product_name}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">{poDialog.sku} · {poDialog.quantity?.toLocaleString()} units · {poDialog.co_packer_name}</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Purchase Order</Label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 p-3 rounded-lg border border-zinc-700 cursor-pointer hover:border-zinc-600 transition-colors">
                      <input type="radio" name="po_select" value="new" checked={selectedPoId === "new"} onChange={() => setSelectedPoId("new")} className="accent-orange-500" />
                      <div>
                        <p className="text-sm text-zinc-200">Create new P.O.</p>
                      </div>
                    </label>
                    {draftPOs.map((po) => (
                      <label key={po.id} className="flex items-center gap-2 p-3 rounded-lg border border-zinc-700 cursor-pointer hover:border-zinc-600 transition-colors">
                        <input type="radio" name="po_select" value={po.id} checked={selectedPoId === po.id} onChange={() => setSelectedPoId(po.id)} className="accent-orange-500" />
                        <div>
                          <p className="text-sm text-zinc-200">{po.po_number}</p>
                          <p className="text-xs text-zinc-500">{po.supplier} · {(po.items || []).length} item{(po.items || []).length !== 1 ? "s" : ""}</p>
                        </div>
                        <FileText className="w-3.5 h-3.5 text-zinc-600 ml-auto" />
                      </label>
                    ))}
                  </div>
                </div>

                {selectedPoId === "new" && (
                  <div className="space-y-3">
                    <div className="space-y-1.5 relative">
                      <Label className="text-zinc-400 text-xs">Supplier / Co-packer *</Label>
                      {supplierDropdownOpen && (
                        <div className="fixed inset-0 z-40" onClick={() => setSupplierDropdownOpen(false)} />
                      )}
                      <div
                        className="flex items-center bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 cursor-pointer gap-2"
                        onClick={() => setSupplierDropdownOpen(!supplierDropdownOpen)}
                      >
                        <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        <input
                          className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder-zinc-500"
                          placeholder="Search suppliers…"
                          value={supplierSearch}
                          onChange={(e) => { setSupplierSearch(e.target.value); setNewPoSupplier(e.target.value); setSupplierDropdownOpen(true); }}
                          onClick={(e) => { e.stopPropagation(); setSupplierDropdownOpen(true); }}
                        />
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      </div>
                      {supplierDropdownOpen && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
                          <div className="max-h-48 overflow-y-auto">
                            {suppliers
                              .filter(s => s.name?.toLowerCase().includes(supplierSearch.toLowerCase()))
                              .map(s => (
                                <button
                                  key={s.id}
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700 transition-colors text-zinc-200"
                                  onClick={() => { setNewPoSupplier(s.name); setSupplierSearch(s.name); setSupplierDropdownOpen(false); }}
                                >
                                  {s.name}
                                </button>
                              ))
                            }
                            {supplierSearch && !suppliers.find(s => s.name?.toLowerCase() === supplierSearch.toLowerCase()) && (
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700 transition-colors text-orange-400"
                                onClick={() => { setNewPoSupplier(supplierSearch); setSupplierDropdownOpen(false); }}
                              >
                                Use "{supplierSearch}"
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">Expected Date</Label>
                      <Input type="date" value={newPoExpectedDate} onChange={(e) => setNewPoExpectedDate(e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm" />
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPoDialog(null)} className="border-zinc-700">Cancel</Button>
                <Button
                  onClick={() => addPoMutation.mutate({ order: poDialog, poId: selectedPoId, supplier: newPoSupplier, expectedDate: newPoExpectedDate })}
                  disabled={addPoMutation.isPending || (selectedPoId === "new" && !newPoSupplier)}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {addPoMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
                  {selectedPoId === "new" ? "Create P.O." : "Add to P.O."}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!returnDialog} onOpenChange={(open) => { if (!open) { setReturnDialog(null); setReturnDate(""); } }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
          {returnDialog && (
            <>
              <DialogHeader><DialogTitle>Mark Returned</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="text-sm text-zinc-400"><span className="text-zinc-200 font-medium">{returnDialog.product_name}</span><span className="text-zinc-600 mx-1.5">·</span><span className="text-zinc-400">{returnDialog.co_packer_name}</span></div>
                <div className="space-y-1.5"><Label className="text-zinc-400 text-xs">Actual Return Date *</Label><Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm" autoFocus /></div>
                <p className="text-xs text-zinc-500">After marking returned, you can create a QC check from the order card.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setReturnDialog(null); setReturnDate(""); }} className="border-zinc-700">Cancel</Button>
                <Button onClick={handleReturnConfirm} disabled={advanceMutation.isPending || !returnDate} className="bg-cyan-600 hover:bg-cyan-700 text-white">{advanceMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}Confirm Return</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}