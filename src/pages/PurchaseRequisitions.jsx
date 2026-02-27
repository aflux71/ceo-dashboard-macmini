import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  AlertTriangle,
  Plus,
  Check,
  X,
  Printer,
  ShoppingCart,
  Clock,
  Filter,
  Search,
  CheckCircle,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Badge from "@/components/ui/Badge";
import { useFloorPin } from "@/components/auth/FloorPinContext";
import RequisitionPrintTag from "@/components/purchase/RequisitionPrintTag";

const urgencyConfig = {
  low: { color: "blue", label: "Low" },
  medium: { color: "amber", label: "Medium" },
  high: { color: "orange", label: "High" },
  critical: { color: "red", label: "Critical" }
};

export default function PurchaseRequisitions() {
  const { floorUser, hasPermission } = useFloorPin();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [selectedReq, setSelectedReq] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState({
    item_sku: "",
    item_name: "",
    current_qty: 0,
    suggested_qty: 0,
    urgency: "medium",
    notes: ""
  });

  const queryClient = useQueryClient();
  const canApprove = hasPermission("purchase_orders");

  const { data: requisitions = [], isLoading } = useQuery({
    queryKey: ["purchase_requisitions"],
    queryFn: () => base44.entities.PurchaseRequisition.list("-created_date")
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => base44.entities.Inventory.list()
  });

  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ["purchase_orders"],
    queryFn: () => base44.entities.PurchaseOrder.list()
  });

  // Check for existing pending requisition for SKU
  const hasPendingRequisition = (sku) => {
    return requisitions.some(r => r.item_sku === sku && r.status === "pending");
  };

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.PurchaseRequisition.create({
      ...data,
      requested_by: floorUser?.name || "Unknown",
      requested_at: new Date().toISOString(),
      status: "pending"
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase_requisitions"] });
      toast.success("Requisition created");
      setShowCreateDialog(false);
      resetForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PurchaseRequisition.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase_requisitions"] });
    }
  });

  const resetForm = () => {
    setForm({
      item_sku: "",
      item_name: "",
      current_qty: 0,
      suggested_qty: 0,
      urgency: "medium",
      notes: ""
    });
  };

  const openCreate = (inventoryItem = null) => {
    if (inventoryItem) {
      if (hasPendingRequisition(inventoryItem.sku)) {
        toast.error("A pending requisition already exists for this item");
        return;
      }
      setForm({
        item_sku: inventoryItem.sku,
        item_name: inventoryItem.name,
        current_qty: inventoryItem.quantity,
        suggested_qty: inventoryItem.reorder_qty || Math.ceil(inventoryItem.reorder_point * 2),
        urgency: inventoryItem.quantity <= 0 ? "critical" : 
                 inventoryItem.quantity <= inventoryItem.reorder_point * 0.5 ? "high" : "medium",
        notes: ""
      });
    } else {
      resetForm();
    }
    setShowCreateDialog(true);
  };

  const handleSelectItem = (sku) => {
    const item = inventory.find(i => i.sku === sku);
    if (item) {
      if (hasPendingRequisition(sku)) {
        toast.error("A pending requisition already exists for this item");
        return;
      }
      setForm({
        ...form,
        item_sku: item.sku,
        item_name: item.name,
        current_qty: item.quantity,
        suggested_qty: item.reorder_qty || Math.ceil((item.reorder_point || 10) * 2),
        urgency: item.quantity <= 0 ? "critical" : 
                 item.quantity <= (item.reorder_point || 10) * 0.5 ? "high" : "medium"
      });
    }
  };

  const handleApprove = async (req) => {
    await updateMutation.mutateAsync({
      id: req.id,
      data: {
        status: "approved",
        reviewed_by: floorUser?.name,
        reviewed_at: new Date().toISOString()
      }
    });
    toast.success("Requisition approved");
  };

  const handleReject = async (req) => {
    await updateMutation.mutateAsync({
      id: req.id,
      data: {
        status: "rejected",
        reviewed_by: floorUser?.name,
        reviewed_at: new Date().toISOString()
      }
    });
    toast.success("Requisition rejected");
  };

  const handleConvertToPO = async (req) => {
    // Find supplier from inventory item
    const invItem = inventory.find(i => i.sku === req.item_sku);
    
    // Generate PO number
    const poCount = purchaseOrders.length + 1;
    const poNumber = `PO-${new Date().getFullYear()}-${String(poCount).padStart(3, '0')}`;

    // Create draft PO
    await base44.entities.PurchaseOrder.create({
      po_number: poNumber,
      supplier: invItem?.supplier || "TBD",
      status: "draft",
      order_date: new Date().toISOString().split('T')[0],
      items: [{
        inventory_id: invItem?.id,
        sku: req.item_sku,
        name: req.item_name,
        quantity: req.suggested_qty,
        unit: invItem?.unit || "units",
        unit_cost: invItem?.cost_per_unit || 0,
        total_cost: (invItem?.cost_per_unit || 0) * req.suggested_qty
      }],
      subtotal: (invItem?.cost_per_unit || 0) * req.suggested_qty,
      total: (invItem?.cost_per_unit || 0) * req.suggested_qty,
      notes: `Created from requisition by ${req.requested_by}`
    });

    // Update requisition
    await updateMutation.mutateAsync({
      id: req.id,
      data: {
        status: "ordered",
        po_number: poNumber
      }
    });

    queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
    toast.success(`PO ${poNumber} created`);
  };

  const handlePrint = (req) => {
    setSelectedReq(req);
    setShowPrintDialog(true);
  };

  // Filter requisitions
  const filtered = requisitions.filter(r => {
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    const matchesSearch = !searchTerm || 
      r.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.item_sku?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Stats
  const pendingCount = requisitions.filter(r => r.status === "pending").length;
  const criticalCount = requisitions.filter(r => r.status === "pending" && r.urgency === "critical").length;
  const approvedCount = requisitions.filter(r => r.status === "approved").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Purchase Requisitions</h1>
          <p className="text-zinc-500 text-sm mt-1">Flag low inventory items for reorder</p>
        </div>
        <Button onClick={() => openCreate()} className="bg-orange-500 hover:bg-orange-600">
          <Plus className="w-4 h-4 mr-2" />
          New Requisition
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 rounded-lg">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">{pendingCount}</p>
                <p className="text-xs text-zinc-500">Pending Review</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">{criticalCount}</p>
                <p className="text-xs text-zinc-500">Critical</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">{approvedCount}</p>
                <p className="text-xs text-zinc-500">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <ShoppingCart className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">
                  {requisitions.filter(r => r.status === "ordered").length}
                </p>
                <p className="text-xs text-zinc-500">Ordered</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search by item name or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-zinc-900 border-zinc-800"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-zinc-900 border-zinc-800">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="ordered">Ordered</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Requisitions List */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">Requisitions ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-zinc-500 text-center py-8">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-zinc-500 text-center py-8">No requisitions found</p>
          ) : (
            <div className="space-y-3">
              {filtered.map((req) => (
                <div
                  key={req.id}
                  className="p-4 rounded-lg border bg-zinc-800/50 border-zinc-700"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono text-sm text-orange-400">{req.item_sku}</span>
                        <span className="text-zinc-200 font-medium">{req.item_name}</span>
                        <Badge variant={urgencyConfig[req.urgency]?.color}>
                          {urgencyConfig[req.urgency]?.label}
                        </Badge>
                        <Badge variant={
                          req.status === "pending" ? "amber" :
                          req.status === "approved" ? "green" :
                          req.status === "ordered" ? "blue" : "red"
                        }>
                          {req.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-6 text-sm text-zinc-500">
                        <span>Current: {req.current_qty}</span>
                        <span>Suggested: {req.suggested_qty}</span>
                        <span>By: {req.requested_by}</span>
                        <span>{new Date(req.requested_at).toLocaleDateString()}</span>
                        {req.po_number && (
                          <span className="text-blue-400">PO: {req.po_number}</span>
                        )}
                      </div>
                      {req.notes && (
                        <p className="text-sm text-zinc-400 mt-2">{req.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePrint(req)}
                      >
                        <Printer className="w-4 h-4" />
                      </Button>
                      
                      {req.status === "pending" && canApprove && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleApprove(req)}
                            className="text-green-400 hover:text-green-300"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReject(req)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      
                      {req.status === "approved" && canApprove && (
                        <Button
                          size="sm"
                          onClick={() => handleConvertToPO(req)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <FileText className="w-4 h-4 mr-1" />
                          Create PO
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>New Purchase Requisition</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Item</Label>
              <Select value={form.item_sku} onValueChange={handleSelectItem}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue placeholder="Select inventory item..." />
                </SelectTrigger>
                <SelectContent>
                  {inventory
                    .filter(i => i.type === "raw_material" || i.type === "packaging")
                    .map((item) => (
                      <SelectItem 
                        key={item.sku} 
                        value={item.sku}
                        disabled={hasPendingRequisition(item.sku)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{item.sku}</span>
                          <span>{item.name}</span>
                          {item.quantity <= (item.reorder_point || 0) && (
                            <Badge variant="red" className="text-xs">Low</Badge>
                          )}
                          {hasPendingRequisition(item.sku) && (
                            <Badge variant="amber" className="text-xs">Pending</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Current Qty</Label>
                <Input
                  type="number"
                  value={form.current_qty}
                  readOnly
                  className="bg-zinc-800 border-zinc-700 text-zinc-500"
                />
              </div>
              <div className="space-y-2">
                <Label>Suggested Qty</Label>
                <Input
                  type="number"
                  value={form.suggested_qty}
                  onChange={(e) => setForm({ ...form, suggested_qty: parseInt(e.target.value) || 0 })}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Urgency</Label>
              <Select value={form.urgency} onValueChange={(v) => setForm({ ...form, urgency: v })}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Why is this needed urgently?"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.item_sku || createMutation.isPending}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Submit Requisition
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Dialog */}
      <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle>Print Requisition Tag</DialogTitle>
          </DialogHeader>
          {selectedReq && <RequisitionPrintTag requisition={selectedReq} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPrintDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}