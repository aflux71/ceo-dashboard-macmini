import React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export default function PhotoViewerDialog({ open, onClose, item }) {
  if (!item) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 max-w-2xl p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <p className="font-semibold text-zinc-100 text-sm leading-tight">{item.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{item.sku}</p>
        </div>
        <div className="bg-black flex items-center justify-center max-h-[70vh] overflow-hidden">
          {item.component_photo ? (
            <img
              src={item.component_photo}
              alt={item.name}
              className="max-w-full max-h-[70vh] object-contain"
            />
          ) : (
            <p className="text-zinc-500 py-12 text-sm">No photo available</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}