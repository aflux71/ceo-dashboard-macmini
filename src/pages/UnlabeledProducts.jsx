import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Tag, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

export default function UnlabeledProducts() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null); // { id, qty_unlabeled, qty_labeled, notes }

  const { data: items = [] } = useQuery({
    queryKey: ["unlabeled_products"],
    queryFn: () => base44.entities.UnlabeledProduct.list("-created_date"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.UnlabeledProduct.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unlabeled_products"] });
      toast.success("Removed");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.UnlabeledProduct.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unlabeled_products"] });
      setEditing(null);
      toast.success("Updated");
    },
  });

  const startEdit = (item) => {
    setEditing({ id: item.id, qty_unlabeled: item.qty_unlabeled, qty_labeled: item.qty_labeled, notes: item.notes || "" });
  };

  const saveEdit = () => {
    updateMutation.mutate({
      id: editing.id,
      data: {
        qty_unlabeled: Number(editing.qty_unlabeled),
        qty_labeled: Number(editing.qty_labeled),
        notes: editing.notes,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100">Unlabeled Products</h1>
          <p className="text-sm text-zinc-400 mt-1">Products pending labeling from the review queue</p>
        </div>
        <div className="bg-amber-500/20 border border-amber-500/30 rounded-lg px-4 py-2 text-center">
          <p className="text-xs text-amber-400 font-medium">Unlabeled</p>
          <span className="text-2xl font-bold text-amber-400">{items.length}</span>
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 text-center text-zinc-500">
            No unlabeled products recorded
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isEditing = editing?.id === item.id;
            return (
              <div key={item.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded text-xs font-mono font-semibold">
                        {item.batch_id}
                      </span>
                      <Tag className="w-3 h-3 text-zinc-500" />
                    </div>
                    <p className="font-semibold text-zinc-100">{item.product_name}</p>
                    <p className="text-xs text-zinc-500 font-mono">{item.sku}</p>

                    {isEditing ? (
                      <div className="mt-3 space-y-2">
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="text-xs text-zinc-400 block mb-1">Qty Unlabeled</label>
                            <Input
                              type="number"
                              min={0}
                              value={editing.qty_unlabeled}
                              onChange={(e) => setEditing((p) => ({ ...p, qty_unlabeled: e.target.value }))}
                              className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm h-8"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-xs text-zinc-400 block mb-1">Qty Labeled</label>
                            <Input
                              type="number"
                              min={0}
                              value={editing.qty_labeled}
                              onChange={(e) => setEditing((p) => ({ ...p, qty_labeled: e.target.value }))}
                              className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm h-8"
                            />
                          </div>
                        </div>
                        <Textarea
                          placeholder="Notes..."
                          value={editing.notes}
                          onChange={(e) => setEditing((p) => ({ ...p, notes: e.target.value }))}
                          className="bg-zinc-800 border-zinc-700 text-zinc-100 text-xs min-h-[50px]"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveEdit} disabled={updateMutation.isPending} className="bg-green-600 hover:bg-green-700 text-xs gap-1">
                            <Check className="w-3 h-3" /> Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditing(null)} className="border-zinc-700 text-zinc-400 text-xs gap-1">
                            <X className="w-3 h-3" /> Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex gap-6 text-sm">
                        <div>
                          <span className="text-zinc-500 text-xs">Unlabeled: </span>
                          <span className="text-amber-400 font-semibold">{item.qty_unlabeled}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500 text-xs">Labeled: </span>
                          <span className="text-green-400 font-semibold">{item.qty_labeled}</span>
                        </div>
                        {item.notes && (
                          <p className="text-xs text-zinc-400 mt-1">{item.notes}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => startEdit(item)}
                        className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(item.id)}
                        className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-950/20 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}