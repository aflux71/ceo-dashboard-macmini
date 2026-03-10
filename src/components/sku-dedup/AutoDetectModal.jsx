import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Search } from "lucide-react";

export default function AutoDetectModal({ open, onOpenChange, groups, isLoading, onAddPair }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Search className="w-5 h-5 text-orange-400" />Suspected Duplicates</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-3 py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /></div>
          ) : groups.length === 0 ? (
            <div className="text-center py-12"><p className="text-zinc-400 text-sm">No suspected duplicates found.</p><p className="text-zinc-600 text-xs mt-1">All DemandSummary products have unique SKUs.</p></div>
          ) : (
            groups.map((group, gi) => (
              <div key={gi} className="rounded-lg border border-zinc-800 bg-zinc-800/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-200">{group.product_name}</p>
                  <span className="text-xs text-zinc-500">{group.skus.length} SKUs</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.skus.map((sku, si) => (
                    <span key={si} className="px-2.5 py-1 rounded-md bg-zinc-700/60 border border-zinc-700 text-xs font-mono text-zinc-300">{sku}</span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {group.skus.length >= 2 && group.skus.slice(1).map((aliasSku, ai) => (
                    <Button
                      key={ai}
                      size="sm"
                      variant="outline"
                      onClick={() => onAddPair({ primary_sku: group.skus[0], alias_sku: aliasSku, product_name: group.product_name, reason: "Auto-detected duplicate" })}
                      className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10 text-xs h-7"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add {group.skus[0]} → {aliasSku}
                    </Button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}