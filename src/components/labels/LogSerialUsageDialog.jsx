import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatSerialRange, rangeCount } from "./serialUtils";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

// Dialog for logging serial usage against a Label's received ranges.
// Updates the Label's serial_ranges quantity_used and creates a LabelSerialUsage record.
export default function LogSerialUsageDialog({ open, label, onClose, onLogged }) {
  const [rangeIdx, setRangeIdx] = useState(0);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [usedFor, setUsedFor] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const ranges = label?.serial_ranges || [];
  const selectedRange = ranges[rangeIdx];

  useEffect(() => {
    if (open) {
      setRangeIdx(0);
      setStart("");
      setEnd("");
      setUsedFor("");
      setNotes("");
    }
  }, [open]);

  // Suggest next available start based on quantity_used
  useEffect(() => {
    if (selectedRange) {
      const used = Number(selectedRange.quantity_used || 0);
      const nextStart = Number(selectedRange.serial_start) + used;
      if (nextStart <= Number(selectedRange.serial_end)) {
        setStart(String(nextStart));
        setEnd("");
      } else {
        setStart("");
        setEnd("");
      }
    }
  }, [rangeIdx, selectedRange]);

  const qty = useMemo(() => rangeCount(start, end), [start, end]);
  const available = selectedRange
    ? Number(selectedRange.quantity || 0) - Number(selectedRange.quantity_used || 0)
    : 0;

  const tooMany = qty > 0 && qty > available;
  const outOfBounds =
    selectedRange &&
    start !== "" &&
    end !== "" &&
    (Number(start) < Number(selectedRange.serial_start) || Number(end) > Number(selectedRange.serial_end));

  const handleSave = async () => {
    if (!selectedRange) return;
    if (qty <= 0) {
      toast.error("Enter a valid serial range");
      return;
    }
    if (tooMany) {
      toast.error(`Only ${available} serials available in this range`);
      return;
    }
    if (outOfBounds) {
      toast.error("Range is outside the received range");
      return;
    }

    setIsSaving(true);
    try {
      const user = await base44.auth.me().catch(() => null);

      // Create usage record
      await base44.entities.LabelSerialUsage.create({
        label_id: label.id,
        label_sku: label.sku,
        label_name: label.name,
        po_id: selectedRange.po_id,
        po_number: selectedRange.po_number,
        serial_prefix: selectedRange.serial_prefix,
        serial_start: Number(start),
        serial_end: Number(end),
        serial_padding: selectedRange.serial_padding || 4,
        quantity: qty,
        used_by: user?.full_name || user?.email || "Unknown",
        used_for: usedFor,
        notes,
      });

      // Update label: increment range used + decrement stock
      const updatedRanges = ranges.map((r, i) =>
        i === rangeIdx ? { ...r, quantity_used: Number(r.quantity_used || 0) + qty } : r
      );
      await base44.entities.Label.update(label.id, {
        serial_ranges: updatedRanges,
        current_quantity: Math.max(0, Number(label.current_quantity || 0) - qty),
      });

      toast.success(`Logged ${qty} serial${qty !== 1 ? "s" : ""}`);
      onLogged?.();
      onClose();
    } catch (e) {
      toast.error("Failed to log usage: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">
            Log Usage — {label?.name}
          </DialogTitle>
        </DialogHeader>

        {ranges.length === 0 ? (
          <p className="text-sm text-zinc-400 py-4">
            No serial ranges have been received for this label yet.
          </p>
        ) : (
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Serial Range</label>
              <Select value={String(rangeIdx)} onValueChange={(v) => setRangeIdx(Number(v))}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ranges.map((r, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {formatSerialRange(r.serial_prefix, r.serial_start, r.serial_end, r.serial_padding || 4)} · {r.po_number} · {Number(r.quantity_used || 0)}/{r.quantity} used
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRange && (
                <p className="text-xs text-zinc-500 mt-1">{available} available</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">From Serial #</label>
                <Input
                  type="number"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">To Serial #</label>
                <Input
                  type="number"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 h-9 text-sm"
                />
              </div>
            </div>

            {qty > 0 && (
              <p className="text-xs text-zinc-400">
                {qty} serial{qty !== 1 ? "s" : ""}
                {tooMany && <span className="text-amber-400 ml-2">⚠ exceeds available ({available})</span>}
                {outOfBounds && <span className="text-amber-400 ml-2">⚠ outside received range</span>}
              </p>
            )}

            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Used For</label>
              <Input
                value={usedFor}
                onChange={(e) => setUsedFor(e.target.value)}
                placeholder="Batch ID, production run, etc."
                className="bg-zinc-800 border-zinc-700 h-9 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Notes</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                className="bg-zinc-800 border-zinc-700 h-9 text-sm"
              />
            </div>
          </div>
        )}

        <DialogFooter className="pt-2 border-t border-zinc-800">
          <Button variant="outline" onClick={onClose} className="border-zinc-700">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={ranges.length === 0 || qty <= 0 || tooMany || outOfBounds || isSaving}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {isSaving ? "Saving..." : "Log Usage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}