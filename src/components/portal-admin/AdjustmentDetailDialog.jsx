import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

const STATUS_OPTIONS = ["submitted", "acknowledged", "reviewed", "applied", "rejected"];

const statusVariant = (s) => ({
  submitted: "blue",
  acknowledged: "purple",
  reviewed: "orange",
  applied: "green",
  rejected: "red"
}[s] || "default");

const formatQty = (q) => {
  const n = Number(q) || 0;
  if (n > 0) return `+${n}`;
  return String(n);
};

const formatDateTime = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

export default function AdjustmentDetailDialog({
  open,
  onOpenChange,
  adjustment,
  currentUserName,
  onSave
}) {
  const [status, setStatus] = useState("submitted");
  const [internalNotes, setInternalNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (adjustment) {
      setStatus(adjustment.status || "submitted");
      setInternalNotes(adjustment.internal_notes || "");
    }
  }, [adjustment]);

  if (!adjustment) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = {
        status,
        internal_notes: internalNotes
      };
      // Auto-fill acknowledged_by/at when transitioning from submitted to acknowledged
      // (or to any later status) for the first time
      const movingPastSubmitted =
        adjustment.status === "submitted" && status !== "submitted";
      if (movingPastSubmitted && !adjustment.acknowledged_at) {
        updates.acknowledged_by = currentUserName || "ERP Admin";
        updates.acknowledged_at = new Date().toISOString();
      }
      await onSave(adjustment.id, updates);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono text-orange-400">{adjustment.adjustment_number}</span>
            <Badge variant={statusVariant(adjustment.status)} className="text-[10px]">
              {(adjustment.status || "").replace("_", " ")}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Header info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Store</div>
              <div className="text-white">{adjustment.store_name}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Contact</div>
              <div className="text-white">{adjustment.contact_name || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Submitted By</div>
              <div className="text-white">{adjustment.submitted_by || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Submitted At</div>
              <div className="text-white">{formatDateTime(adjustment.created_date)}</div>
            </div>
            {adjustment.acknowledged_at && (
              <>
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Acknowledged By</div>
                  <div className="text-white">{adjustment.acknowledged_by || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Acknowledged At</div>
                  <div className="text-white">{formatDateTime(adjustment.acknowledged_at)}</div>
                </div>
              </>
            )}
          </div>

          {/* Line detail */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-3">
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Product</div>
              <div className="text-white font-medium">{adjustment.product_name}</div>
              <div className="text-xs text-zinc-500 mt-0.5">SKU: {adjustment.sku}</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Quantity</div>
                <div className={`text-lg font-bold ${Number(adjustment.quantity) < 0 ? "text-red-400" : "text-green-400"}`}>
                  {formatQty(adjustment.quantity)}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Reason</div>
                <div className="text-white">{adjustment.adjustment_reason_label || "—"}</div>
              </div>
            </div>
            {adjustment.notes && (
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Notes from Store</div>
                <div className="text-sm text-zinc-300 whitespace-pre-wrap">{adjustment.notes}</div>
              </div>
            )}
          </div>

          {/* Status update */}
          <div>
            <Label className="text-zinc-300">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1 focus:ring-orange-500">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {adjustment.status === "submitted" && status !== "submitted" && !adjustment.acknowledged_at && (
              <p className="text-xs text-orange-400 mt-2">
                Acknowledged By and Acknowledged At will be set automatically on save.
              </p>
            )}
          </div>

          {/* Internal notes */}
          <div>
            <Label className="text-zinc-300">
              Internal Notes <span className="text-zinc-500 text-xs">(never visible to portal user)</span>
            </Label>
            <Textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              rows={3}
              placeholder="Add internal notes for the team..."
              className="bg-zinc-800 border-zinc-700 text-white mt-1 focus-visible:ring-orange-500"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}