import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function AdjustmentReviewDialog({
  open,
  onOpenChange,
  items,
  onSubmit,
  submitting
}) {
  const [requestedDate, setRequestedDate] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  const handleSubmit = () => {
    onSubmit({
      requested_date: requestedDate || null,
      additional_notes: additionalNotes
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Inventory Adjustment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-800/60 text-zinc-400">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.product_id} className="border-t border-zinc-800">
                    <td className="px-3 py-2 text-white">{it.product_name}</td>
                    <td className="px-3 py-2 text-zinc-400">{it.sku}</td>
                    <td className="px-3 py-2 text-right text-white font-semibold">
                      {it.quantity}
                    </td>
                    <td className="px-3 py-2 text-zinc-300">{it.adjustment_reason_label}</td>
                    <td className="px-3 py-2 text-zinc-400">{it.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-zinc-300">Requested Date</Label>
              <Input
                type="date"
                value={requestedDate}
                onChange={(e) => setRequestedDate(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white mt-1 focus-visible:ring-orange-500"
              />
            </div>
          </div>

          <div>
            <Label className="text-zinc-300">Additional Notes</Label>
            <Textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder="Any context for the team reviewing this submission..."
              rows={3}
              className="bg-zinc-800 border-zinc-700 text-white mt-1 focus-visible:ring-orange-500"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            Back to Edit
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || items.length === 0}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {submitting ? "Submitting..." : "Submit Adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}