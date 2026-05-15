import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function OrderReviewDialog({ open, onOpenChange, items, onSubmit, submitting }) {
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = () => {
    onSubmit({ requested_delivery_date: deliveryDate || null, notes });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">Review Your Order</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-800/60">
                <tr>
                  <th className="text-left px-3 py-2 text-zinc-400 font-medium">Product</th>
                  <th className="text-left px-3 py-2 text-zinc-400 font-medium">SKU</th>
                  <th className="text-right px-3 py-2 text-zinc-400 font-medium">Qty</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.portal_product_id} className="border-t border-zinc-800">
                    <td className="px-3 py-2 text-white">{it.product_name}</td>
                    <td className="px-3 py-2 text-zinc-400">{it.sku}</td>
                    <td className="px-3 py-2 text-right text-white font-semibold">{it.qty_ordered}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-zinc-300 mb-2 block">Requested Delivery Date</Label>
              <Input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
          </div>

          <div>
            <Label className="text-zinc-300 mb-2 block">Order Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special instructions..."
              className="bg-zinc-800 border-zinc-700 text-white min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
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
            disabled={submitting}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {submitting ? "Submitting..." : "Submit Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}