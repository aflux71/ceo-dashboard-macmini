import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/Badge";
import {
  Search,
  Tag,
  Plus,
  ShoppingCart,
  Check,
  X,
  Send,
  Package,
  Clock,
  AlertCircle,
  RefreshCw,
  Eye,
  Zap,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import SerialRangeInputs from "@/components/labels/SerialRangeInputs";
import ReceivePODialog from "@/components/labels/ReceivePODialog";
import { formatSerialRange, rangeCount, validateRanges, autoSerialRange } from "@/components/labels/serialUtils";

const STATUS_CONFIG = {
  pending_approval: { label: "Pending Approval", variant: "amber", icon: Clock },
  approved: { label: "Approved", variant: "blue", icon: Check },
  submitted: { label: "Submitted", variant: "purple", icon: Send },
  shipped: { label: "Shipped", variant: "cyan", icon: Package },
  received: { label: "Received", variant: "green", icon: Check },
  cancelled: { label: "Cancelled", variant: "red", icon: X },
};

export default function LabelPurchaseOrders() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedPO, setSelectedPO] = useState(null);
  const [editPO, setEditPO] = useState(null);
  const [receivePO, setReceivePO] = useState(null);
  const [isReceiving, setIsReceiving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: labels = [] } = useQuery({
    queryKey: ["labels"],
    queryFn: () => base44.entities.Label.list(),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-active"],
    queryFn: () => base44.entities.Supplier.filter({ active: true }, "name"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.LabelPurchaseOrder.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["labelPurchaseOrders"] });
      setCreateModalOpen(false);
      toast.success("Manual PO created successfully");
    },
    onError: (err) => toast.error("Failed to create PO: " + err.message),
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["labelPurchaseOrders"],
    queryFn: () => base44.entities.LabelPurchaseOrder.list("-created_date"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LabelPurchaseOrder.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["labelPurchaseOrders"] });
      toast.success("Order updated");
    },
  });

  const handleGenerateOrders = async () => {
    setIsGenerating(true);
    try {
      const response = await base44.functions.invoke("checkLabelStock", {});
      queryClient.invalidateQueries({ queryKey: ["labelPurchaseOrders"] });
      toast.success(response.data.message || "Check complete");
    } catch (error) {
      toast.error("Failed to check stock: " + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApprove = async (po) => {
    const user = await base44.auth.me();
    updateMutation.mutate({
      id: po.id,
      data: {
        status: "approved",
        approved_by: user?.full_name || user?.email,
        approved_date: new Date().toISOString(),
      },
    });
  };

  const handleSubmit = (po) => {
    updateMutation.mutate({
      id: po.id,
      data: {
        status: "submitted",
        order_date: new Date().toISOString().split("T")[0],
      },
    });
  };

  const handleReceiveConfirm = async (itemsWithSerials) => {
    setIsReceiving(true);
    try {
      const today = new Date().toISOString().split("T")[0];

      // Update PO with serial ranges + received status
      await base44.entities.LabelPurchaseOrder.update(receivePO.id, {
        status: "received",
        received_date: today,
        items: itemsWithSerials,
      });

      // Update label quantities AND append serial range to each label
      for (const item of itemsWithSerials) {
        if (!item.label_id) continue;
        const labels = await base44.entities.Label.filter({ id: item.label_id });
        if (labels.length === 0) continue;
        const label = labels[0];
        const newRange = {
          po_id: receivePO.id,
          po_number: receivePO.po_number,
          serial_prefix: item.serial_prefix || "",
          serial_start: Number(item.serial_start),
          serial_end: Number(item.serial_end),
          serial_padding: item.serial_padding || 4,
          quantity: rangeCount(item.serial_start, item.serial_end),
          quantity_used: 0,
          received_date: today,
        };
        await base44.entities.Label.update(item.label_id, {
          current_quantity: (label.current_quantity || 0) + item.quantity,
          serial_ranges: [...(label.serial_ranges || []), newRange],
        });
      }

      queryClient.invalidateQueries({ queryKey: ["labelPurchaseOrders"] });
      queryClient.invalidateQueries({ queryKey: ["labels"] });
      toast.success("Order received and serial ranges saved");
      setReceivePO(null);
    } catch (e) {
      toast.error("Failed to receive: " + e.message);
    } finally {
      setIsReceiving(false);
    }
  };

  const handleCancel = (po) => {
    updateMutation.mutate({ id: po.id, data: { status: "cancelled" } });
  };

  const handleEditSave = (po, updatedData) => {
    updateMutation.mutate({ id: po.id, data: updatedData }, {
      onSuccess: () => setEditPO(null),
    });
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.po_number?.toLowerCase().includes(search.toLowerCase()) ||
      order.supplier_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    pending: orders.filter((o) => o.status === "pending_approval").length,
    approved: orders.filter((o) => o.status === "approved").length,
    submitted: orders.filter((o) => o.status === "submitted").length,
    totalValue: orders
      .filter((o) => ["pending_approval", "approved", "submitted"].includes(o.status))
      .reduce((sum, o) => sum + (o.total || 0), 0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShoppingCart className="w-7 h-7 text-orange-400" />
            Label Purchase Orders
          </h1>
          <p className="text-zinc-400 mt-1">Manage and approve label reorder requests</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setCreateModalOpen(true)}
            className="border-zinc-700 text-zinc-200 hover:text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Manual PO
          </Button>
          <Button
            onClick={handleGenerateOrders}
            disabled={isGenerating}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {isGenerating ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 mr-2" />
            )}
            Check Low Stock
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 rounded-lg">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-zinc-400 text-sm">Pending Approval</p>
                <p className="text-xl font-bold text-amber-400">{stats.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Check className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-zinc-400 text-sm">Approved</p>
                <p className="text-xl font-bold text-blue-400">{stats.approved}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Send className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-zinc-400 text-sm">Submitted</p>
                <p className="text-xl font-bold text-purple-400">{stats.submitted}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Tag className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-zinc-400 text-sm">Open Orders Value</p>
                <p className="text-xl font-bold text-white">${stats.totalValue.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-zinc-900 border-zinc-700"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 bg-zinc-900 border-zinc-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending_approval">Pending Approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">PO Number</TableHead>
                <TableHead className="text-zinc-400">Supplier</TableHead>
                <TableHead className="text-zinc-400">Items</TableHead>
                <TableHead className="text-zinc-400">Total</TableHead>
                <TableHead className="text-zinc-400">Expected Delivery</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-zinc-500 py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-zinc-500 py-8">
                    No orders found
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((order) => {
                  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending_approval;
                  return (
                    <TableRow key={order.id} className="border-zinc-800">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{order.po_number}</span>
                          {order.auto_generated && (
                            <Zap className="w-3 h-3 text-amber-400" title="Auto-generated" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-zinc-300">{order.supplier_name || "-"}</TableCell>
                      <TableCell className="text-zinc-300">{order.items?.length || 0} labels</TableCell>
                      <TableCell className="text-white font-medium">${(order.total || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-zinc-300">
                        {order.expected_delivery_date
                          ? format(new Date(order.expected_delivery_date), "MMM d, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedPO(order)}
                            className="text-zinc-400 hover:text-white"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {order.status === "pending_approval" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleApprove(order)}
                                className="text-green-400 hover:text-green-300"
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleCancel(order)}
                                className="text-red-400 hover:text-red-300"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {order.status === "approved" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleSubmit(order)}
                              className="text-purple-400 hover:text-purple-300"
                            >
                              <Send className="w-4 h-4" />
                            </Button>
                          )}
                          {order.status === "submitted" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setReceivePO(order)}
                              className="text-green-400 hover:text-green-300"
                              title="Receive PO"
                            >
                              <Package className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Manual PO Modal */}
      <ManualPODialog
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        labels={labels}
        suppliers={suppliers}
        onCreate={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />

      {/* Detail Dialog */}
      <Dialog open={!!selectedPO} onOpenChange={() => setSelectedPO(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              {selectedPO?.po_number}
              {selectedPO?.auto_generated && (
                <Badge variant="amber">Auto-generated</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedPO && (
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-zinc-500">Supplier</p>
                  <p className="text-white">{selectedPO.supplier_name}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Status</p>
                  <Badge variant={STATUS_CONFIG[selectedPO.status]?.variant}>
                    {STATUS_CONFIG[selectedPO.status]?.label}
                  </Badge>
                </div>
                <div>
                  <p className="text-zinc-500">Expected Delivery</p>
                  <p className="text-white">
                    {selectedPO.expected_delivery_date
                      ? format(new Date(selectedPO.expected_delivery_date), "MMM d, yyyy")
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Total</p>
                  <p className="text-white font-bold">${(selectedPO.total || 0).toFixed(2)}</p>
                </div>
              </div>

              {selectedPO.generation_reason && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {selectedPO.generation_reason}
                  </div>
                </div>
              )}

              <div>
                <p className="text-zinc-400 text-sm mb-2">Order Items</p>
                <div className="border border-zinc-800 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-800">
                        <TableHead className="text-zinc-400">Label</TableHead>
                        <TableHead className="text-zinc-400 text-right">Qty</TableHead>
                        <TableHead className="text-zinc-400 text-right">Unit Cost</TableHead>
                        <TableHead className="text-zinc-400 text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedPO.items?.map((item, idx) => (
                        <TableRow key={idx} className="border-zinc-800">
                          <TableCell>
                            <div>
                              <p className="text-white">{item.label_name}</p>
                              <p className="text-xs text-zinc-500">{item.label_sku}</p>
                              {item.serial_start !== undefined && item.serial_end !== undefined && (
                                <p className="text-xs text-orange-400 font-mono mt-1">
                                  S/N: {formatSerialRange(item.serial_prefix, item.serial_start, item.serial_end, item.serial_padding || 4)}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-white">{item.quantity}</TableCell>
                          <TableCell className="text-right text-zinc-300">
                            ${(item.unit_cost || 0).toFixed(3)}
                          </TableCell>
                          <TableCell className="text-right text-white">
                            ${(item.total_cost || 0).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="pt-2 border-t border-zinc-800 mt-2">
            <Button variant="outline" onClick={() => setSelectedPO(null)} className="border-zinc-700">
              Close
            </Button>
            {selectedPO && !["received", "cancelled"].includes(selectedPO.status) && (
              <Button
                className="bg-orange-500 hover:bg-orange-600"
                onClick={() => { setEditPO(selectedPO); setSelectedPO(null); }}
              >
                Edit PO
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive PO Dialog */}
      <ReceivePODialog
        open={!!receivePO}
        po={receivePO}
        onClose={() => setReceivePO(null)}
        onConfirm={handleReceiveConfirm}
        isPending={isReceiving}
      />

      {/* Edit PO Dialog */}
      <EditPODialog
        open={!!editPO}
        po={editPO}
        labels={labels}
        suppliers={suppliers}
        onClose={() => setEditPO(null)}
        onSave={(updatedData) => handleEditSave(editPO, updatedData)}
        isPending={updateMutation.isPending}
      />
    </div>
  );
}

function EditPODialog({ open, po, labels, suppliers = [], onClose, onSave, isPending }) {
  const [supplierName, setSupplierName] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (po) {
      setSupplierName(po.supplier_name || "");
      setExpectedDate(po.expected_delivery_date || "");
      setNotes(po.notes || "");
      setItems(po.items ? po.items.map(i => ({ ...i })) : []);
    }
  }, [po]);

  const filteredLabels = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return labels.filter(l =>
      l.name?.toLowerCase().includes(q) ||
      l.sku?.toLowerCase().includes(q) ||
      l.product_name?.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [labels, search]);

  const addLabel = (label) => {
    if (items.find(i => i.label_id === label.id)) return;
    const qty = label.reorder_qty || 500;
    const auto = autoSerialRange(label, qty, new Date(), items);
    setItems(prev => [...prev, {
      label_id: label.id,
      label_name: label.name,
      label_sku: label.sku,
      quantity: qty,
      unit_cost: label.cost_per_unit || 0,
      total_cost: qty * (label.cost_per_unit || 0),
      ...auto,
    }]);
    setSearch("");
  };

  const updateItem = (labelId, field, value) => {
    setItems(prev => prev.map(item => {
      if (item.label_id !== labelId) return item;
      const updated = { ...item, [field]: Number(value) };
      updated.total_cost = updated.quantity * updated.unit_cost;
      return updated;
    }));
  };

  const updateItemSerial = (labelId, field, value) => {
    setItems(prev => prev.map(item => item.label_id === labelId ? { ...item, [field]: value } : item));
  };

  const removeItem = (labelId) => {
    setItems(prev => prev.filter(i => i.label_id !== labelId));
  };

  const total = items.reduce((sum, i) => sum + (i.total_cost || 0), 0);

  const handleSave = () => {
    const err = validateRanges(items);
    if (err) {
      toast.error(err.message);
      return;
    }
    onSave({
      supplier_name: supplierName,
      expected_delivery_date: expectedDate || null,
      notes,
      items,
      total,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            Edit PO — {po?.po_number}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Supplier</label>
              <SupplierSelect value={supplierName} onChange={setSupplierName} suppliers={suppliers} />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Expected Delivery Date</label>
              <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="bg-zinc-800 border-zinc-700 h-9 text-sm" />
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Add Labels</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by label name or SKU..."
                className="bg-zinc-800 border-zinc-700 h-9 text-sm pl-9"
              />
            </div>
            {filteredLabels.length > 0 && (
              <div className="mt-1 border border-zinc-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto bg-zinc-800">
                {filteredLabels.map((label) => {
                  const alreadyAdded = items.find(i => i.label_id === label.id);
                  return (
                    <button
                      key={label.id}
                      onClick={() => addLabel(label)}
                      disabled={!!alreadyAdded}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-700 flex items-center justify-between transition-colors disabled:opacity-40"
                    >
                      <div>
                        <p className="text-sm text-zinc-200">{label.name}</p>
                        <p className="text-xs text-zinc-500">{label.sku}</p>
                      </div>
                      {alreadyAdded ? <span className="text-xs text-zinc-500">Added</span> : <Plus className="w-4 h-4 text-orange-400" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div>
              <label className="text-xs text-zinc-400 mb-2 block">Order Items ({items.length})</label>
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800">
                      <TableHead className="text-zinc-400 text-xs">Label</TableHead>
                      <TableHead className="text-zinc-400 text-xs text-right">Qty</TableHead>
                      <TableHead className="text-zinc-400 text-xs text-right">Unit Cost</TableHead>
                      <TableHead className="text-zinc-400 text-xs text-right">Total</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <React.Fragment key={item.label_id}>
                        <TableRow className="border-zinc-800">
                          <TableCell>
                            <p className="text-white text-sm">{item.label_name}</p>
                            <p className="text-xs text-zinc-500">{item.label_sku}</p>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateItem(item.label_id, "quantity", e.target.value)}
                              className="bg-zinc-800 border-zinc-700 h-7 text-sm w-20 text-right ml-auto"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              step="0.001"
                              value={item.unit_cost}
                              onChange={(e) => updateItem(item.label_id, "unit_cost", e.target.value)}
                              className="bg-zinc-800 border-zinc-700 h-7 text-sm w-24 text-right ml-auto"
                            />
                          </TableCell>
                          <TableCell className="text-right text-white text-sm font-medium">
                            ${(item.total_cost || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <button onClick={() => removeItem(item.label_id)} className="text-zinc-500 hover:text-red-400">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </TableCell>
                        </TableRow>
                        <TableRow className="border-zinc-800 bg-zinc-950/40">
                          <TableCell colSpan={5} className="py-2">
                            <p className="text-[11px] text-zinc-500 mb-1">Serial range (optional)</p>
                            <SerialRangeInputs
                              item={item}
                              onChange={(field, value) => updateItemSerial(item.label_id, field, value)}
                              compact
                            />
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex justify-end px-4 py-2 border-t border-zinc-800">
                  <span className="text-sm text-zinc-400 mr-2">Total:</span>
                  <span className="text-white font-bold">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." className="bg-zinc-800 border-zinc-700 h-9 text-sm" />
          </div>
        </div>

        <DialogFooter className="pt-2 border-t border-zinc-800">
          <Button variant="outline" onClick={onClose} className="border-zinc-700">Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={items.length === 0 || isPending}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupplierSelect({ value, onChange, suppliers }) {
  // Show the current value even if it doesn't match a known supplier (legacy free-text)
  const hasUnknownLegacy = value && !suppliers.some((s) => s.name === value);
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger className="bg-zinc-800 border-zinc-700 h-9 text-sm">
        <SelectValue placeholder="Select supplier..." />
      </SelectTrigger>
      <SelectContent>
        {hasUnknownLegacy && (
          <SelectItem value={value}>{value} (legacy)</SelectItem>
        )}
        {suppliers.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-zinc-500">No active suppliers</div>
        ) : (
          suppliers.map((s) => (
            <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

function ManualPODialog({ open, onClose, labels, suppliers = [], onCreate, isPending }) {
  const [search, setSearch] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSupplierName("");
      setExpectedDate("");
      setNotes("");
      setItems([]);
    }
  }, [open]);

  const filteredLabels = useMemo(() => {
    if (!search.trim()) return labels.slice(0, 20);
    const q = search.toLowerCase();
    return labels.filter(
      (l) =>
        l.name?.toLowerCase().includes(q) ||
        l.sku?.toLowerCase().includes(q) ||
        l.product_name?.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [labels, search]);

  const addItem = (label) => {
    if (items.find((i) => i.label_id === label.id)) return;
    const qty = label.reorder_qty || 500;
    const auto = autoSerialRange(label, qty, new Date(), items);
    setItems((prev) => [
      ...prev,
      {
        label_id: label.id,
        label_name: label.name,
        label_sku: label.sku,
        quantity: qty,
        unit_cost: label.cost_per_unit || 0,
        total_cost: qty * (label.cost_per_unit || 0),
        ...auto,
      },
    ]);
  };

  const updateItem = (labelId, field, value) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.label_id !== labelId) return item;
        const updated = { ...item, [field]: Number(value) };
        updated.total_cost = updated.quantity * updated.unit_cost;
        return updated;
      })
    );
  };

  const updateItemSerial = (labelId, field, value) => {
    setItems((prev) => prev.map((item) => item.label_id === labelId ? { ...item, [field]: value } : item));
  };

  const removeItem = (labelId) => {
    setItems((prev) => prev.filter((i) => i.label_id !== labelId));
  };

  const total = items.reduce((sum, i) => sum + (i.total_cost || 0), 0);

  const handleCreate = () => {
    const err = validateRanges(items);
    if (err) {
      toast.error(err.message);
      return;
    }
    const poNumber = `LPO-${Date.now().toString().slice(-6)}`;
    onCreate({
      po_number: poNumber,
      supplier_name: supplierName,
      status: "pending_approval",
      expected_delivery_date: expectedDate || null,
      notes,
      items,
      total,
      auto_generated: false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-orange-400" />
            Create Manual Label PO
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1">
          {/* PO Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Supplier</label>
              <SupplierSelect value={supplierName} onChange={setSupplierName} suppliers={suppliers} />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Expected Delivery Date</label>
              <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="bg-zinc-800 border-zinc-700 h-9 text-sm" />
            </div>
          </div>

          {/* Label Search */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Search & Add Labels</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by label name, SKU, or product..."
                className="bg-zinc-800 border-zinc-700 h-9 text-sm pl-9"
              />
            </div>
            {search.trim() && (
              <div className="mt-1 border border-zinc-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto bg-zinc-800">
                {filteredLabels.length === 0 ? (
                  <p className="text-zinc-500 text-xs p-3">No labels found</p>
                ) : (
                  filteredLabels.map((label) => {
                    const alreadyAdded = items.find((i) => i.label_id === label.id);
                    return (
                      <button
                        key={label.id}
                        onClick={() => addItem(label)}
                        disabled={!!alreadyAdded}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-700 flex items-center justify-between transition-colors disabled:opacity-40"
                      >
                        <div>
                          <p className="text-sm text-zinc-200">{label.name}</p>
                          <p className="text-xs text-zinc-500">{label.sku}{label.product_name ? ` · ${label.product_name}` : ""}</p>
                        </div>
                        {alreadyAdded ? (
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

          {/* Items Table */}
          {items.length > 0 && (
            <div>
              <label className="text-xs text-zinc-400 mb-2 block">Order Items ({items.length})</label>
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800">
                      <TableHead className="text-zinc-400 text-xs">Label</TableHead>
                      <TableHead className="text-zinc-400 text-xs text-right">Qty</TableHead>
                      <TableHead className="text-zinc-400 text-xs text-right">Unit Cost</TableHead>
                      <TableHead className="text-zinc-400 text-xs text-right">Total</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <React.Fragment key={item.label_id}>
                        <TableRow className="border-zinc-800">
                          <TableCell>
                            <p className="text-white text-sm">{item.label_name}</p>
                            <p className="text-xs text-zinc-500">{item.label_sku}</p>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateItem(item.label_id, "quantity", e.target.value)}
                              className="bg-zinc-800 border-zinc-700 h-7 text-sm w-20 text-right ml-auto"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              step="0.001"
                              value={item.unit_cost}
                              onChange={(e) => updateItem(item.label_id, "unit_cost", e.target.value)}
                              className="bg-zinc-800 border-zinc-700 h-7 text-sm w-24 text-right ml-auto"
                            />
                          </TableCell>
                          <TableCell className="text-right text-white text-sm font-medium">
                            ${item.total_cost.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <button onClick={() => removeItem(item.label_id)} className="text-zinc-500 hover:text-red-400">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </TableCell>
                        </TableRow>
                        <TableRow className="border-zinc-800 bg-zinc-950/40">
                          <TableCell colSpan={5} className="py-2">
                            <p className="text-[11px] text-zinc-500 mb-1">Serial range (optional)</p>
                            <SerialRangeInputs
                              item={item}
                              onChange={(field, value) => updateItemSerial(item.label_id, field, value)}
                              compact
                            />
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex justify-end px-4 py-2 border-t border-zinc-800">
                  <span className="text-sm text-zinc-400 mr-2">Total:</span>
                  <span className="text-white font-bold">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." className="bg-zinc-800 border-zinc-700 h-9 text-sm" />
          </div>
        </div>

        <DialogFooter className="pt-2 border-t border-zinc-800">
          <Button variant="outline" onClick={onClose} className="border-zinc-700">Cancel</Button>
          <Button
            onClick={handleCreate}
            disabled={items.length === 0 || isPending}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {isPending ? "Creating..." : `Create PO (${items.length} item${items.length !== 1 ? "s" : ""})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}