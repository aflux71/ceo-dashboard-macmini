import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  Package,
  AlertTriangle,
  Search,
  Flag,
  Check
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Badge from "@/components/ui/Badge";

export default function KioskInventoryCheck({ user }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all, low, flagged

  const queryClient = useQueryClient();

  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => base44.entities.Inventory.list(),
  });

  const { data: requisitions = [] } = useQuery({
    queryKey: ['requisitions'],
    queryFn: () => base44.entities.PurchaseRequisition.filter({ status: 'pending' }),
  });

  const createRequisition = useMutation({
    mutationFn: async (item) => {
      return base44.entities.PurchaseRequisition.create({
        item_sku: item.sku,
        item_name: item.name,
        current_qty: item.quantity,
        suggested_qty: item.reorder_qty || Math.ceil(item.reorder_point * 2),
        urgency: item.quantity === 0 ? 'critical' : item.quantity < item.reorder_point ? 'high' : 'medium',
        status: 'pending',
        requested_by: user.name,
        requested_at: new Date().toISOString(),
        notes: `Flagged from kiosk by ${user.name}`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      toast.success("Item flagged for reorder!");
    },
    onError: (error) => {
      toast.error("Failed to flag item: " + error.message);
    }
  });

  const isItemFlagged = (sku) => {
    return requisitions.some(r => r.item_sku === sku);
  };

  const handleFlag = (item) => {
    if (!isItemFlagged(item.sku)) {
      createRequisition.mutate(item);
    }
  };

  const filteredInventory = inventory.filter(item => {
    // Search filter
    const matchesSearch = 
      item.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Status filter
    if (filter === 'low') {
      return matchesSearch && item.quantity <= (item.reorder_point || 0);
    }
    if (filter === 'flagged') {
      return matchesSearch && isItemFlagged(item.sku);
    }
    
    return matchesSearch;
  });

  const lowStockCount = inventory.filter(i => i.quantity <= (i.reorder_point || 0)).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-500">Loading inventory...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-zinc-100">Inventory Check</h2>
        <p className="text-zinc-500">View stock levels and flag items for reorder</p>
      </div>

      {/* Low Stock Alert */}
      {lowStockCount > 0 && (
        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <p className="text-amber-400 font-semibold">{lowStockCount} Items Low on Stock</p>
            <p className="text-sm text-zinc-400">These items are at or below reorder point</p>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <Input
            placeholder="Search by name or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-14 text-lg bg-zinc-900 border-zinc-800"
          />
        </div>
        <div className="flex gap-2">
          {[
            { id: 'all', label: 'All' },
            { id: 'low', label: 'Low Stock' },
            { id: 'flagged', label: 'Flagged' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-6 h-14 rounded-xl font-medium transition-all ${
                filter === f.id
                  ? 'bg-orange-500/20 text-orange-400 border-2 border-orange-500'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory Grid */}
      <div className="grid gap-4 max-h-[500px] overflow-y-auto pr-2">
        {filteredInventory.map((item) => {
          const isLow = item.quantity <= (item.reorder_point || 0);
          const isFlagged = isItemFlagged(item.sku);
          
          return (
            <div
              key={item.id}
              className={`p-5 bg-zinc-900 border rounded-2xl ${
                isLow ? 'border-amber-500/50' : 'border-zinc-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                    isLow ? 'bg-amber-500/20' : 'bg-zinc-800'
                  }`}>
                    <Package className={`w-7 h-7 ${isLow ? 'text-amber-400' : 'text-zinc-500'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-orange-400">{item.sku}</span>
                      <span className="text-zinc-200 font-medium">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-sm text-zinc-500">
                        {item.type === 'raw_material' ? 'Raw Material' : 
                         item.type === 'packaging' ? 'Packaging' : 'Finished Product'}
                      </span>
                      {item.location && (
                        <span className="text-sm text-zinc-600">📍 {item.location}</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-6">
                  {/* Stock Level */}
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${
                      isLow ? 'text-amber-400' : 'text-zinc-100'
                    }`}>
                      {item.quantity} <span className="text-sm font-normal text-zinc-500">{item.unit}</span>
                    </p>
                    {item.reorder_point && (
                      <p className="text-xs text-zinc-500">
                        Reorder at: {item.reorder_point} {item.unit}
                      </p>
                    )}
                  </div>

                  {/* Status / Actions */}
                  {isFlagged ? (
                    <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-xl">
                      <Check className="w-5 h-5 text-green-400" />
                      <span className="text-green-400 font-medium">Flagged</span>
                    </div>
                  ) : isLow ? (
                    <Button
                      onClick={() => handleFlag(item)}
                      disabled={createRequisition.isPending}
                      className="bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 h-12 px-6"
                    >
                      <Flag className="w-5 h-5 mr-2" />
                      Flag for Reorder
                    </Button>
                  ) : (
                    <Badge variant="green" className="px-4 py-2">
                      In Stock
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredInventory.length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            No items found matching your search
          </div>
        )}
      </div>
    </div>
  );
}