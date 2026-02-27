import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight, Check } from "lucide-react";
import { format } from "date-fns";

export default function ConflictModal({ 
  open, 
  onOpenChange, 
  conflictPairs = [],
  onEditItem,
  onDismissConflict
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-zinc-100 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            Scheduling Conflicts ({conflictPairs.length})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-zinc-400">
            The following production runs have overlapping schedules on the same line. 
            You can edit them to resolve or dismiss individual conflicts to acknowledge they're intentional.
          </p>

          {conflictPairs.map((pair, idx) => (
            <div 
              key={idx} 
              className="p-4 bg-zinc-800/50 border border-red-500/30 rounded-lg space-y-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-200">{pair.a.product_name}</p>
                  <p className="text-xs text-zinc-500">
                    {pair.a.sku} • Line {pair.a.assigned_production_line} • {format(new Date(pair.a.scheduled_start_date), "MMM d")}
                  </p>
                </div>
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <div className="flex-1 text-right">
                  <p className="text-sm font-medium text-zinc-200">{pair.b.product_name}</p>
                  <p className="text-xs text-zinc-500">
                    {pair.b.sku} • Line {pair.b.assigned_production_line} • {format(new Date(pair.b.scheduled_start_date), "MMM d")}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-2 border-t border-zinc-700">
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      onEditItem(pair.a);
                      onOpenChange(false);
                    }}
                  >
                    Edit {pair.a.product_name?.substring(0, 15)}...
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      onEditItem(pair.b);
                      onOpenChange(false);
                    }}
                  >
                    Edit {pair.b.product_name?.substring(0, 15)}...
                  </Button>
                </div>
                <Button 
                  size="sm" 
                  variant="ghost"
                  className="text-zinc-400 hover:text-zinc-200"
                  onClick={() => onDismissConflict?.(pair)}
                >
                  <Check className="w-4 h-4 mr-1" />
                  Acknowledge
                </Button>
              </div>
            </div>
          ))}

          {conflictPairs.length === 0 && (
            <div className="text-center py-8 text-zinc-500">
              No conflicts found
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}