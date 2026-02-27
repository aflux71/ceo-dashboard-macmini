import React, { useState } from "react";
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
  Plus,
  Droplets,
  Package,
  CheckCircle,
  Clock,
  AlertCircle,
  Trash2,
  Edit,
  Play,
  Pause,
  Search,
  Filter,
  ChevronRight
} from "lucide-react";

const STATUS_CONFIG = {
  draft: { label: "Draft", color: "default", icon: Clock },
  mixing: { label: "Mixing", color: "blue", icon: Droplets },
  ready_to_fill: { label: "Ready to Fill", color: "amber", icon: Package },
  filling: { label: "Filling", color: "purple", icon: Play },
  completed: { label: "Completed", color: "green", icon: CheckCircle },
  on_hold: { label: "On Hold", color: "red", icon: Pause }
};

const PRODUCT_TYPES = ["Hand Soap", "Body Wash", "Shampoo", "Conditioner", "Lotion", "Other"];

export default function LiquidBatches() {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["liquidBatches"],
    queryFn: () => base44.entities.LiquidBatch.list("-created_date")
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => base44.entities.Inventory.filter({ type: "finished_product" })
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.LiquidBatch.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["liquidBatches"] });
      setShowCreateDialog(false);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LiquidBatch.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["liquidBatches"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.LiquidBatch.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["liquidBatches"] });
    }
  });

  const filteredBatches = batches.filter(batch => {
    const matchesSearch = batch.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          batch.batch_id?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || batch.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: batches.length,
    active: batches.filter(b => ["mixing", "ready_to_fill", "filling"].includes(b.status)).length,
    readyToFill: batches.filter(b => b.status === "ready_to_fill").length,
    totalVolume: batches.filter(b => b.status !== "completed").reduce((sum, b) => sum + (b.remaining_volume_liters || 0), 0)
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Droplets className="w-7 h-7 text-blue-400" />
            Liquid Batches
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Manage liquid production batches and filling allocations
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          New Liquid Batch
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-xs text-zinc-400">Total Batches</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-400">{stats.active}</div>
            <div className="text-xs text-zinc-400">Active</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-amber-400">{stats.readyToFill}</div>
            <div className="text-xs text-zinc-400">Ready to Fill</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-purple-400">{stats.totalVolume}L</div>
            <div className="text-xs text-zinc-400">Volume Remaining</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search batches..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-zinc-900 border-zinc-700"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-zinc-900 border-zinc-700">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Batch List */}
      {isLoading ? (
        <div className="text-center py-12 text-zinc-500">Loading batches...</div>
      ) : filteredBatches.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-12 text-center">
            <Droplets className="w-12 h-12 mx-auto text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-zinc-300">No liquid batches found</h3>
            <p className="text-zinc-500 text-sm mt-1">Create a new batch to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredBatches.map(batch => {
            const statusCfg = STATUS_CONFIG[batch.status] || STATUS_CONFIG.draft;
            const StatusIcon = statusCfg.icon;
            const allocatedVolume = (batch.allocations || []).reduce((sum, a) => sum + (a.volume_allocated_liters || 0), 0);
            const allocationPercent = batch.total_volume_liters > 0 
              ? Math.round((allocatedVolume / batch.total_volume_liters) * 100) 
              : 0;

            return (
              <Card key={batch.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
                <CardContent className="p-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant={statusCfg.color}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {statusCfg.label}
                        </Badge>
                        <span className="text-xs text-zinc-500">{batch.batch_id}</span>
                      </div>
                      <h3 className="text-lg font-medium text-white">{batch.name}</h3>
                      <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-zinc-400">
                        <span className="flex items-center gap-1">
                          <Droplets className="w-4 h-4 text-blue-400" />
                          {batch.total_volume_liters}L total
                        </span>
                        <span className="flex items-center gap-1">
                          <Package className="w-4 h-4 text-purple-400" />
                          {batch.allocations?.length || 0} products
                        </span>
                        <span>{batch.product_type}</span>
                      </div>
                    </div>

                    {/* Allocation Progress */}
                    <div className="w-full lg:w-48">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-zinc-400">Allocated</span>
                        <span className="text-zinc-300">{allocatedVolume}L / {batch.total_volume_liters}L</span>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 transition-all"
                          style={{ width: `${allocationPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Link to={createPageUrl(`LiquidBatchDetail?id=${batch.id}`)}>
                        <Button variant="outline" size="sm" className="border-zinc-700">
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate(batch.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Allocations Preview */}
                  {batch.allocations?.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-zinc-800">
                      <div className="flex flex-wrap gap-2">
                        {batch.allocations.slice(0, 4).map((alloc, idx) => (
                          <div key={idx} className="text-xs bg-zinc-800 px-2 py-1 rounded flex items-center gap-2">
                            <span className="text-zinc-300">{alloc.product_name}</span>
                            <span className="text-zinc-500">{alloc.container_size_ml}ml</span>
                            <span className="text-blue-400">{alloc.units_to_produce} units</span>
                          </div>
                        ))}
                        {batch.allocations.length > 4 && (
                          <span className="text-xs text-zinc-500">+{batch.allocations.length - 4} more</span>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <CreateLiquidBatchDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={(data) => createMutation.mutate(data)}
        inventory={inventory}
      />
    </div>
  );
}

function CreateLiquidBatchDialog({ open, onOpenChange, onSubmit, inventory }) {
  const [formData, setFormData] = useState({
    name: "",
    product_type: "Hand Soap",
    total_volume_liters: 300,
    production_line: 1,
    notes: ""
  });

  const generateBatchId = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `LB-${year}${month}-${random}`;
  };

  const handleSubmit = () => {
    onSubmit({
      ...formData,
      batch_id: generateBatchId(),
      remaining_volume_liters: formData.total_volume_liters,
      status: "draft",
      allocations: []
    });
    setFormData({
      name: "",
      product_type: "Hand Soap",
      total_volume_liters: 300,
      production_line: 1,
      notes: ""
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Droplets className="w-5 h-5 text-blue-400" />
            New Liquid Batch
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Batch Name</label>
            <Input
              placeholder="e.g., Massuet Hand Soap Base"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Product Type</label>
            <Select 
              value={formData.product_type} 
              onValueChange={(v) => setFormData({ ...formData, product_type: v })}
            >
              <SelectTrigger className="bg-zinc-800 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_TYPES.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Total Volume (Liters)</label>
            <Input
              type="number"
              value={formData.total_volume_liters}
              onChange={(e) => setFormData({ ...formData, total_volume_liters: Number(e.target.value) })}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Production Line</label>
            <Select 
              value={String(formData.production_line)} 
              onValueChange={(v) => setFormData({ ...formData, production_line: Number(v) })}
            >
              <SelectTrigger className="bg-zinc-800 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Line 1</SelectItem>
                <SelectItem value="2">Line 2</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Notes (optional)</label>
            <Input
              placeholder="Any special instructions..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700">
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!formData.name || !formData.total_volume_liters}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Create Batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}