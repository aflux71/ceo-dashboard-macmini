import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Package, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import SerialRangeInputs from "./SerialRangeInputs";
import { rangeCount, validateRanges } from "./serialUtils";

// Dialog shown when receiving a Label PO. Requires the user to confirm/enter
// a serial range for each line item before the PO is marked received.
// onConfirm(items) — receives the items array with serial ranges filled in.
export default function ReceivePODialog({ open, po, onClose, onConfirm, isPending }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (po) {
      setItems((po.items || []).map((i) => ({ ...i, serial_padding: i.serial_padding ?? 4 })));
    }
  }, [po]);

  const updateItem = (idx, field, value) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  const allHaveRanges = items.every(
    (i) => i.serial_start !== undefined && i.serial_end !== undefined && rangeCount(i.serial_start, i.serial_end) > 0
  );

  const handleConfirm = () => {
    if (!allHaveRanges) {
      toast.error("Enter a serial range for every line item before receiving.");
      return;
    }
    const err = validateRanges(items);
    if (err) {
      toast.error(err.message);
      return;
    }
    onConfirm(items);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-green-400" />
            Receive PO — {po?.po_number}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 pr-1 space-y-4">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Confirm or enter the serial number range for every line item. These ranges will be
              saved on each label so usage can be tracked.
            </span>
          </div>

          {items.map((item, idx) => {
            const count = rangeCount(item.serial_start, item.serial_end);
            const mismatch = count > 0 && Number(item.quantity || 0) > 0 && count !== Number(item.quantity);
            return (
              <div key={idx} className="border border-zinc-800 rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-white text-sm font-medium">{item.label_name}</p>
                    <p className="text-xs text-zinc-500">
                      {item.label_sku} · Qty {item.quantity}
                    </p>
                  </div>
                  {mismatch && (
                    <span className="text-xs text-amber-400">
                      Range = {count}, expected {item.quantity}
                    </span>
                  )}
                </div>
                <SerialRangeInputs
                  item={item}
                  onChange={(field, value) => updateItem(idx, field, value)}
                  compact
                />
              </div>
            );
          })}
        </div>

        <DialogFooter className="pt-2 border-t border-zinc-800">
          <Button variant="outline" onClick={onClose} className="border-zinc-700">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!allHaveRanges || isPending}
            className="bg-green-500 hover:bg-green-600"
          >
            {isPending ? "Receiving..." : "Confirm & Receive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}