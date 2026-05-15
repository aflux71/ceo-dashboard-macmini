import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { GitMerge, AlertTriangle } from "lucide-react";

export default function MergeDuplicateDialog({ open, onOpenChange, itemA, itemB, onMerged }) {
  const [keepId, setKeepId] = useState(null);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState(null);

  React.useEffect(() => {
    if (open && itemA && itemB) {
      // Default: keep the one with higher quantity, or the one with the cleaner-looking SKU
      const aQty = Number(itemA.quantity) || 0;
      const bQty = Number(itemB.quantity) || 0;
      setKeepId(aQty >= bQty ? itemA.id : itemB.id);
      setError(null);
    }
  }, [open, itemA, itemB]);

  if (!itemA || !itemB) return null;

  const keeper = keepId === itemA.id ? itemA : itemB;
  const removed = keepId === itemA.id ? itemB : itemA;
  const mergedQty = (Number(itemA.quantity) || 0) + (Number(itemB.quantity) || 0);

  const handleMerge = async () => {
    setIsMerging(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('mergeTwoInventoryItems', {
        keep_id: keeper.id,
        remove_id: removed.id,
      });
      if (res.data?.success) {
        onMerged?.(res.data);
        onOpenChange(false);
      } else {
        setError(res.data?.error || 'Merge failed');
      }
    } catch (e) {
      setError(e.message || 'Merge failed');
    } finally {
      setIsMerging(false);
    }
  };

  const renderOption = (item) => {
    const selected = keepId === item.id;
    return (
      <button
        type="button"
        onClick={() => setKeepId(item.id)}
        className={`text-left rounded-lg border p-3 transition-colors w-full ${
          selected
            ? 'border-orange-500 bg-orange-500/10'
            : 'border-zinc-700 bg-zinc-800/40 hover:border-zinc-600'
        }`}
      >
        <div className="flex items-center justify-between mb-1">
          <span className={`font-mono text-sm font-semibold ${selected ? 'text-orange-400' : 'text-zinc-300'}`}>
            {item.sku}
          </span>
          {selected && <span className="text-xs text-orange-400 font-medium">KEEP</span>}
        </div>
        <div className="text-sm text-zinc-200 mb-2">{item.name}</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-zinc-500">
          <div>Qty: <span className="text-zinc-300">{item.quantity ?? 0} {item.unit}</span></div>
          <div>Lots: <span className="text-zinc-300">{item.lot_numbers?.length || 0}</span></div>
          {item.supplier && <div className="col-span-2">Supplier: <span className="text-zinc-300">{item.supplier}</span></div>}
          {item.location && <div className="col-span-2">Location: <span className="text-zinc-300">{item.location}</span></div>}
        </div>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-orange-400" />
            Merge Duplicate Items
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-zinc-400">
            Choose which record to <span className="text-orange-400 font-medium">keep</span>. The other will be deleted, its quantity and lots merged in, and any recipes referencing it updated.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {renderOption(itemA)}
            {renderOption(itemB)}
          </div>

          {keeper && removed && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-sm space-y-1">
              <div className="text-zinc-400">
                <span className="text-orange-400 font-mono">{keeper.sku}</span> will keep its SKU. Resulting quantity: <span className="text-zinc-100 font-semibold">{mergedQty} {keeper.unit}</span>
              </div>
              <div className="text-zinc-500 text-xs">
                <span className="font-mono">{removed.sku}</span> will be deleted and added as an alias to <span className="font-mono">{keeper.sku}</span>.
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMerging} className="border-zinc-700">
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={isMerging || !keepId}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            <GitMerge className="w-4 h-4 mr-1" />
            {isMerging ? 'Merging...' : 'Merge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}