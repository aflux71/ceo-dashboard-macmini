import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingCart, Check, AlertCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function AddToInventory() {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingQty, setEditingQty] = useState({}); // { [batchId]: qty }
  const queryClient = useQueryClient();

  // Fetch approved batches
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["approvedBatches"],
    queryFn: async () => {
      const result = await base44.entities.Batch.filter({ status: "approved" });
      return result || [];
    }
  });

  // Fetch labels for deduction
  const { data: labels = [] } = useQuery({
    queryKey: ["labels"],
    queryFn: () => base44.entities.Label.list()
  });

  // Helper: reported actual yield (override) takes precedence over planned quantity
  const getReportedQty = (b) => (b.actual_yield_units ?? b.quantity);

  // Mutation to save edited quantity (writes to actual_yield_units — the reported produced count)
  const updateQtyMutation = useMutation({
    mutationFn: async ({ batchId, quantity }) => {
      return base44.entities.Batch.update(batchId, { actual_yield_units: quantity });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvedBatches"] });
      toast.success("Quantity updated");
    }
  });

  // Fetch current user
  const { data: currentUser } = useQuery({
    queryKey: ["me"],
    queryFn: () => base44.auth.me(),
  });

  // Mutation to mark batch as added to inventory and deduct labels
  const updateBatchMutation = useMutation({
    mutationFn: async (batch) => {
      const reportedQty = getReportedQty(batch);
      const finalQty = editingQty[batch.id] ?? reportedQty;
      const today = format(new Date(), "yyyy-MM-dd");
      const addedByName = currentUser?.full_name || currentUser?.email || "";

      // Save reported quantity if it was edited
      if (editingQty[batch.id] !== undefined && editingQty[batch.id] !== reportedQty) {
        await base44.entities.Batch.update(batch.id, { actual_yield_units: finalQty });
      }

      // Find matching label by product SKU
      const matchingLabel = labels.find(l => l.product_sku === batch.sku);
      
      // Deduct label count if found
      if (matchingLabel) {
        const newQty = Math.max(0, matchingLabel.current_quantity - finalQty);
        await base44.entities.Label.update(matchingLabel.id, { 
          current_quantity: newQty 
        });
      }
      
      // Update batch status AND traveller inventory fields together
      return base44.entities.Batch.update(batch.id, {
        status: "added_to_inventory",
        inventory_added_checkbox: true,
        inventory_added_by: addedByName,
        inventory_added_date: today,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvedBatches"] });
      queryClient.invalidateQueries({ queryKey: ["labels"] });
      queryClient.invalidateQueries({ queryKey: ["batches-traveler"] });
      toast.success("Batch marked as added to Shopify (labels deducted)");
    }
  });

  const filteredBatches = batches.filter(b => 
    b.batch_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100">Add to Inventory</h1>
          <p className="text-sm text-zinc-400 mt-1">{batches.length} approved batches ready for Shopify</p>
        </div>
        <div className="bg-orange-500/20 border border-orange-500/30 rounded-lg px-4 py-2">
          <span className="text-2xl font-bold text-orange-400">{batches.length}</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Input
          placeholder="Search by batch ID, SKU, or product name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 bg-zinc-900 border-zinc-800"
        />
      </div>

      {/* Batches Grid */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-8 text-zinc-500">Loading...</div>
        ) : filteredBatches.length === 0 ? (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6 text-center text-zinc-500">
              {batches.length === 0 ? "No approved batches yet" : "No matching batches"}
            </CardContent>
          </Card>
        ) : (
          filteredBatches.map((batch) => (
            <div
              key={batch.id}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 flex items-start justify-between hover:border-zinc-700 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="bg-green-500/20 text-green-400 px-3 py-1 rounded text-sm font-mono font-semibold">
                    {batch.batch_id}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {new Date(batch.approved_date).toLocaleDateString()}
                  </span>
                </div>
                
                <h3 className="text-lg font-semibold text-zinc-100 mb-1">
                  {batch.product_name}
                </h3>
                
                <div className="flex gap-6 mt-3">
                  <div>
                    <span className="text-xs text-zinc-500 uppercase block">SKU</span>
                    <span className="text-sm font-mono text-zinc-300">{batch.sku}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 uppercase block">Quantity</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Input
                        type="number"
                        min={1}
                        value={editingQty[batch.id] ?? getReportedQty(batch)}
                        onChange={(e) => setEditingQty(prev => ({ ...prev, [batch.id]: parseInt(e.target.value) || 0 }))}
                        onBlur={() => {
                          const val = editingQty[batch.id];
                          if (val !== undefined && val !== getReportedQty(batch) && val > 0) {
                            updateQtyMutation.mutate({ batchId: batch.id, quantity: val });
                          }
                        }}
                        className="w-24 h-8 bg-zinc-800 border-zinc-700 text-orange-400 font-bold text-lg px-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-sm text-zinc-400">units</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 uppercase block">Batch Date</span>
                    <span className="text-sm text-zinc-300">
                      {new Date(batch.production_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => updateBatchMutation.mutate(batch)}
                disabled={updateBatchMutation.isPending}
                className="bg-green-600 hover:bg-green-700 gap-2 whitespace-nowrap ml-4"
              >
                <Check className="w-4 h-4" />
                Added to Shopify
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Info Alert */}
      <div className="bg-blue-950/30 border border-blue-800/30 rounded-lg p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-300">
          <p className="font-semibold mb-1">How Add to Shopify Works!</p>
          <p>Click "Add to Shopify" when the batch is physically packed and manually added to the Shopify inventory system.</p>
        </div>
      </div>
    </div>
  );
}