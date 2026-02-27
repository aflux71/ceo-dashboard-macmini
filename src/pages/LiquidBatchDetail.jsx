import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Badge from "@/components/ui/Badge";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Droplets,
  Package,
  Plus,
  Trash2,
  CheckCircle,
  Clock,
  Play,
  Pause,
  Edit,
  Save,
  AlertCircle,
  Calculator
} from "lucide-react";

const STATUS_CONFIG = {
  draft: { label: "Draft", color: "default", icon: Clock },
  mixing: { label: "Mixing", color: "blue", icon: Droplets },
  ready_to_fill: { label: "Ready to Fill", color: "amber", icon: Package },
  filling: { label: "Filling", color: "purple", icon: Play },
  completed: { label: "Completed", color: "green", icon: CheckCircle },
  on_hold: { label: "On Hold", color: "red", icon: Pause }
};

const CONTAINER_SIZES = [100, 250, 300, 500, 750, 1000, 2000, 4000];

export default function LiquidBatchDetail() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const batchId = urlParams.get("id");

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingAllocation, setEditingAllocation] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const { data: batch, isLoading } = useQuery({
    queryKey: ["liquidBatch", batchId],
    queryFn: async () => {
      const batches = await base44.entities.LiquidBatch.filter({ id: batchId });
      return batches[0];
    },
    enabled: !!batchId
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ["inventory", "finished"],
    queryFn: () => base44.entities.Inventory.filter({ type: "finished_product" })
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.LiquidBatch.update(batchId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["liquidBatch", batchId] });
    }
  });

  if (isLoading) {
    return <div className="text-center py-12 text-zinc-500">Loading batch...</div>;
  }

  if (!batch) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 mx-auto text-zinc-600 mb-4" />
        <h3 className="text-lg font-medium text-zinc-300">Batch not found</h3>
        <Link to={createPageUrl("LiquidBatches")}>
          <Button variant="outline" className="mt-4 border-zinc-700">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Batches
          </Button>
        </Link>
      </div>
    );
  }

  const allocations = batch.allocations || [];
  const allocatedVolume = allocations.reduce((sum, a) => sum + (a.volume_allocated_liters || 0), 0);
  const remainingVolume = batch.total_volume_liters - allocatedVolume;
  const statusCfg = STATUS_CONFIG[batch.status] || STATUS_CONFIG.draft;
  const StatusIcon = statusCfg.icon;

  const handleAddAllocation = (allocation) => {
    const newAllocations = [...allocations, allocation];
    updateMutation.mutate({
      allocations: newAllocations,
      remaining_volume_liters: batch.total_volume_liters - newAllocations.reduce((sum, a) => sum + (a.volume_allocated_liters || 0), 0)
    });
    setShowAddProduct(false);
  };

  const handleUpdateAllocation = (index, updates) => {
    const newAllocations = [...allocations];
    newAllocations[index] = { ...newAllocations[index], ...updates };
    updateMutation.mutate({
      allocations: newAllocations,
      remaining_volume_liters: batch.total_volume_liters - newAllocations.reduce((sum, a) => sum + (a.volume_allocated_liters || 0), 0)
    });
    setEditingAllocation(null);
  };

  const handleRemoveAllocation = (index) => {
    const newAllocations = allocations.filter((_, i) => i !== index);
    updateMutation.mutate({
      allocations: newAllocations,
      remaining_volume_liters: batch.total_volume_liters - newAllocations.reduce((sum, a) => sum + (a.volume_allocated_liters || 0), 0)
    });
    setDeleteConfirm(null);
  };

  const handleStatusChange = (newStatus) => {
    updateMutation.mutate({ status: newStatus });
  };

  const handleMarkFilled = (index, unitsFilled) => {
    const newAllocations = [...allocations];
    newAllocations[index] = {
      ...newAllocations[index],
      units_filled: unitsFilled,
      status: unitsFilled >= newAllocations[index].units_to_produce ? "completed" : "filling",
      filled_at: new Date().toISOString()
    };
    
    const allCompleted = newAllocations.every(a => a.status === "completed");
    updateMutation.mutate({
      allocations: newAllocations,
      status: allCompleted ? "completed" : batch.status
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <Link to={createPageUrl("LiquidBatches")} className="text-zinc-400 hover:text-zinc-300 text-sm flex items-center gap-1 mb-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Batches
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{batch.name}</h1>
            <Badge variant={statusCfg.color}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {statusCfg.label}
            </Badge>
          </div>
          <p className="text-zinc-400 text-sm mt-1">{batch.batch_id} • {batch.product_type}</p>
        </div>

        <div className="flex gap-2">
          <Select value={batch.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Volume Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Droplets className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{batch.total_volume_liters}L</div>
                <div className="text-xs text-zinc-400">Total Volume</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Package className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{allocatedVolume}L</div>
                <div className="text-xs text-zinc-400">Allocated</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${remainingVolume > 0 ? 'bg-amber-500/20' : 'bg-green-500/20'}`}>
                <Calculator className={`w-5 h-5 ${remainingVolume > 0 ? 'text-amber-400' : 'text-green-400'}`} />
              </div>
              <div>
                <div className={`text-2xl font-bold ${remainingVolume > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                  {remainingVolume}L
                </div>
                <div className="text-xs text-zinc-400">Remaining</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-zinc-400">Allocation Progress</span>
            <span className="text-zinc-300">
              {Math.round((allocatedVolume / batch.total_volume_liters) * 100)}%
            </span>
          </div>
          <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
              style={{ width: `${(allocatedVolume / batch.total_volume_liters) * 100}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Allocations */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-400" />
            Product Allocations
          </CardTitle>
          <Button 
            onClick={() => setShowAddProduct(true)}
            disabled={remainingVolume <= 0}
            className="bg-purple-600 hover:bg-purple-700"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Product
          </Button>
        </CardHeader>
        <CardContent>
          {allocations.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No products allocated yet</p>
              <p className="text-sm">Add products to divide the batch</p>
            </div>
          ) : (
            <div className="space-y-3">
              {allocations.map((alloc, idx) => (
                <div 
                  key={idx}
                  className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-white">{alloc.product_name}</h4>
                      <Badge variant={alloc.status === "completed" ? "green" : alloc.status === "filling" ? "purple" : "default"}>
                        {alloc.status || "pending"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
                      <span>{alloc.container_size_ml}ml containers</span>
                      <span>{alloc.volume_allocated_liters}L allocated</span>
                      <span className="text-blue-400">{alloc.units_to_produce} units</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Fill Progress */}
                    <div className="w-32">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-zinc-500">Filled</span>
                        <span className="text-zinc-300">{alloc.units_filled || 0}/{alloc.units_to_produce}</span>
                      </div>
                      <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500"
                          style={{ width: `${((alloc.units_filled || 0) / alloc.units_to_produce) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1">
                      {alloc.status !== "completed" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMarkFilled(idx, alloc.units_to_produce)}
                          className="text-green-400 hover:text-green-300 hover:bg-green-500/10"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingAllocation({ index: idx, data: alloc })}
                        className="text-zinc-400 hover:text-zinc-300"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirm(idx)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Product Dialog */}
      <AddAllocationDialog
        open={showAddProduct}
        onOpenChange={setShowAddProduct}
        onSubmit={handleAddAllocation}
        remainingVolume={remainingVolume}
        inventory={inventory}
        productType={batch.product_type}
      />

      {/* Edit Allocation Dialog */}
      {editingAllocation && (
        <EditAllocationDialog
          open={!!editingAllocation}
          onOpenChange={() => setEditingAllocation(null)}
          allocation={editingAllocation.data}
          onSubmit={(updates) => handleUpdateAllocation(editingAllocation.index, updates)}
          remainingVolume={remainingVolume + editingAllocation.data.volume_allocated_liters}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Remove Product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the product allocation and return the volume to available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleRemoveAllocation(deleteConfirm)}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddAllocationDialog({ open, onOpenChange, onSubmit, remainingVolume, inventory, productType }) {
  const [formData, setFormData] = useState({
    sku: "",
    product_name: "",
    container_size_ml: 250,
    volume_allocated_liters: 0,
    units_to_produce: 0
  });

  // Filter inventory for relevant products
  const relevantProducts = inventory.filter(item => {
    const name = (item.name || "").toLowerCase();
    const type = (productType || "").toLowerCase();
    return name.includes(type.split(" ")[0].toLowerCase()) || type === "other";
  });

  const calculateUnits = (volumeLiters, containerMl) => {
    if (!volumeLiters || !containerMl) return 0;
    return Math.floor((volumeLiters * 1000) / containerMl);
  };

  const handleVolumeChange = (volume) => {
    const vol = Math.min(Number(volume), remainingVolume);
    setFormData({
      ...formData,
      volume_allocated_liters: vol,
      units_to_produce: calculateUnits(vol, formData.container_size_ml)
    });
  };

  const handleContainerSizeChange = (size) => {
    setFormData({
      ...formData,
      container_size_ml: Number(size),
      units_to_produce: calculateUnits(formData.volume_allocated_liters, Number(size))
    });
  };

  const handleProductSelect = (sku) => {
    const product = relevantProducts.find(p => p.sku === sku);
    setFormData({
      ...formData,
      sku,
      product_name: product?.name || ""
    });
  };

  const handleSubmit = () => {
    onSubmit({
      ...formData,
      status: "pending",
      units_filled: 0
    });
    setFormData({
      sku: "",
      product_name: "",
      container_size_ml: 250,
      volume_allocated_liters: 0,
      units_to_produce: 0
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-purple-400" />
            Add Product Allocation
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="text-sm text-blue-400">Available Volume</div>
            <div className="text-2xl font-bold text-white">{remainingVolume}L</div>
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Product</label>
            {relevantProducts.length > 0 ? (
              <Select value={formData.sku} onValueChange={handleProductSelect}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  {relevantProducts.map(product => (
                    <SelectItem key={product.sku} value={product.sku}>
                      {product.name} ({product.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder="Enter product name"
                value={formData.product_name}
                onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
              />
            )}
          </div>

          {!formData.sku && relevantProducts.length > 0 && (
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Or enter custom name</label>
              <Input
                placeholder="Custom product name"
                value={formData.product_name}
                onChange={(e) => setFormData({ ...formData, product_name: e.target.value, sku: "" })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          )}

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Container Size (ml)</label>
            <Select 
              value={String(formData.container_size_ml)} 
              onValueChange={handleContainerSizeChange}
            >
              <SelectTrigger className="bg-zinc-800 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTAINER_SIZES.map(size => (
                  <SelectItem key={size} value={String(size)}>{size}ml</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Volume to Allocate (L)</label>
            <Input
              type="number"
              value={formData.volume_allocated_liters}
              onChange={(e) => handleVolumeChange(e.target.value)}
              max={remainingVolume}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>

          <div className="p-3 bg-zinc-800 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Units to Produce</span>
              <span className="text-2xl font-bold text-purple-400">{formData.units_to_produce}</span>
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              {formData.volume_allocated_liters}L ÷ {formData.container_size_ml}ml = {formData.units_to_produce} units
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700">
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={!formData.product_name || formData.units_to_produce <= 0}
            className="bg-purple-600 hover:bg-purple-700"
          >
            Add Allocation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditAllocationDialog({ open, onOpenChange, allocation, onSubmit, remainingVolume }) {
  const [formData, setFormData] = useState(allocation);

  useEffect(() => {
    setFormData(allocation);
  }, [allocation]);

  const calculateUnits = (volumeLiters, containerMl) => {
    if (!volumeLiters || !containerMl) return 0;
    return Math.floor((volumeLiters * 1000) / containerMl);
  };

  const handleVolumeChange = (volume) => {
    const vol = Math.min(Number(volume), remainingVolume);
    setFormData({
      ...formData,
      volume_allocated_liters: vol,
      units_to_produce: calculateUnits(vol, formData.container_size_ml)
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Edit className="w-5 h-5 text-blue-400" />
            Edit Allocation
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Product Name</label>
            <Input
              value={formData.product_name}
              onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Container Size (ml)</label>
            <Select 
              value={String(formData.container_size_ml)} 
              onValueChange={(v) => setFormData({
                ...formData,
                container_size_ml: Number(v),
                units_to_produce: calculateUnits(formData.volume_allocated_liters, Number(v))
              })}
            >
              <SelectTrigger className="bg-zinc-800 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTAINER_SIZES.map(size => (
                  <SelectItem key={size} value={String(size)}>{size}ml</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Volume Allocated (L)</label>
            <Input
              type="number"
              value={formData.volume_allocated_liters}
              onChange={(e) => handleVolumeChange(e.target.value)}
              max={remainingVolume}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Units Filled</label>
            <Input
              type="number"
              value={formData.units_filled || 0}
              onChange={(e) => setFormData({ ...formData, units_filled: Number(e.target.value) })}
              max={formData.units_to_produce}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>

          <div className="p-3 bg-zinc-800 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Units to Produce</span>
              <span className="text-2xl font-bold text-purple-400">{formData.units_to_produce}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700">
            Cancel
          </Button>
          <Button onClick={() => onSubmit(formData)} className="bg-blue-600 hover:bg-blue-700">
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}