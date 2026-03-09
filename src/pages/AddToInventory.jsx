import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingCart, Check, AlertCircle, Pencil } from "lucide-react";
import { toast } from "sonner";

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

  // Mutation to mark batch as added to inventory and deduct labels
  const updateBatchMutation = useMutation({
    mutationFn: async (batch) => {
      // Find matching label by product SKU
      const matchingLabel = labels.find(l => l.product_sku === batch.sku);
      
      // Deduct label count if found
      if (matchingLabel) {
        const newQty = Math.max(0, matchingLabel.current_quantity - batch.quantity);
        await base44.entities.Label.update(matchingLabel.id, { 
          current_quantity: newQty 
        });
      }
      
      // Update batch status
      return base44.entities.Batch.update(batch.id, { status: "added_to_inventory" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvedBatches"] });
      queryClient.invalidateQueries({ queryKey: ["labels"] });
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
                    <span className="text-lg font-bold text-orange-400">{batch.quantity} {batch.quantity > 1 ? 'units' : 'unit'}</span>
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