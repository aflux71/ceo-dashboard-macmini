import React, { useState } from "react";
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
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

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
  const [isGenerating, setIsGenerating] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: labels = [] } = useQuery({
    queryKey: ["labels"],
    queryFn: () => base44.entities.Label.list(),
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

  const handleReceive = async (po) => {
    // Update PO status
    await base44.entities.LabelPurchaseOrder.update(po.id, {
      status: "received",
      received_date: new Date().toISOString().split("T")[0],
    });

    // Update label quantities
    for (const item of po.items || []) {
      if (item.label_id) {
        const labels = await base44.entities.Label.filter({ id: item.label_id });
        if (labels.length > 0) {
          const label = labels[0];
          await base44.entities.Label.update(item.label_id, {
            current_quantity: (label.current_quantity || 0) + item.quantity,
          });
        }
      }
    }

    queryClient.invalidateQueries({ queryKey: ["labelPurchaseOrders"] });
    queryClient.invalidateQueries({ queryKey: ["labels"] });
    toast.success("Order received and label quantities updated");
  };

  const handleCancel = (po) => {
    updateMutation.mutate({ id: po.id, data: { status: "cancelled" } });
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
                              onClick={() => handleReceive(order)}
                              className="text-green-400 hover:text-green-300"
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

      {/* Detail Dialog */}
      <Dialog open={!!selectedPO} onOpenChange={() => setSelectedPO(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              {selectedPO?.po_number}
              {selectedPO?.auto_generated && (
                <Badge variant="amber">Auto-generated</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedPO && (
            <div className="space-y-4">
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedPO(null)} className="border-zinc-700">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}