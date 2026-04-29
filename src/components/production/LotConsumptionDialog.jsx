import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScanLine, Loader2, AlertCircle, Package, Save, X, Layers } from "lucide-react";
import Badge from "@/components/ui/Badge";
import BarcodeScanner from "@/components/scanner/BarcodeScanner";
import { parseScannedCode } from "@/components/scanner/qrCodeUtils";

/**
 * Dialog for capturing actual lot numbers + quantities consumed during the
 * Batching stage. Persists into batch.material_usage and (optionally) deducts
 * the consumed qty from the matching lot on the Inventory record.
 */
export default function LotConsumptionDialog({ open, batch, recipe, inventory, onClose }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState([]); // one per ingredient
  const [scannerFor, setScannerFor] = useState(null); // index of row currently scanning
  const [saving, setSaving] = useState(false);

  // Build initial rows from recipe ingredients (or existing material_usage)
  useEffect(() => {
    if (!open || !batch) return;

    const ingredients = recipe?.ingredients || [];
    const existing = batch.material_usage || [];

    const initial = ingredients.map((ing) => {
      const prior = existing.find((m) => m.material_sku?.toLowerCase() === ing.sku?.toLowerCase());
      const expected = (Number(ing.qty) || 0) * ((batch.quantity || 0) / (recipe?.batch_size || 1));
      return {
        material_sku: ing.sku || "",
        material_name: ing.material || ing.sku || "",
        unit: ing.unit || "",
        expected_qty: Number(expected.toFixed(3)) || 0,
        actual_qty: prior?.actual_qty ?? "",
        lot_number: prior?.lot_number || "",
      };
    });

    setRows(initial);
  }, [open, batch, recipe]);

  // Inventory lookup by SKU
  const invBySku = useMemo(() => {
    const m = {};
    (inventory || []).forEach((i) => { if (i.sku) m[i.sku.toLowerCase()] = i; });
    return m;
  }, [inventory]);

  const updateRow = (idx, patch) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleScanResult = (raw) => {
    if (scannerFor == null) return;
    const code = parseScannedCode(raw);
    updateRow(scannerFor, { lot_number: code });
    setScannerFor(null);
    toast.success(`Lot scanned: ${code}`);
  };

  // Mutation: save material_usage on batch + deduct lot qty from inventory
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Build material_usage
      const now = new Date().toISOString();
      const usage = rows
        .filter((r) => r.actual_qty !== "" && Number(r.actual_qty) > 0)
        .map((r) => {
          const actual = Number(r.actual_qty) || 0;
          const variance = actual - (r.expected_qty || 0);
          const variancePct = r.expected_qty
            ? Number(((variance / r.expected_qty) * 100).toFixed(2))
            : 0;
          return {
            material_sku: r.material_sku,
            material_name: r.material_name,
            expected_qty: r.expected_qty,
            actual_qty: actual,
            variance,
            variance_percent: variancePct,
            unit: r.unit,
            lot_number: r.lot_number || "",
            verified_by: batch.operator || "",
            verified_at: now,
          };
        });

      // 1. Update batch
      await base44.entities.Batch.update(batch.id, { material_usage: usage });

      // 2. Deduct from inventory (per-lot if matched, else total qty)
      for (const u of usage) {
        const inv = invBySku[u.material_sku?.toLowerCase()];
        if (!inv) continue;

        let updates = {};

        if (u.lot_number && Array.isArray(inv.lot_numbers) && inv.lot_numbers.length > 0) {
          // Decrement matching lot
          const lots = inv.lot_numbers.map((l) => {
            if (l.lot?.toLowerCase() === u.lot_number.toLowerCase()) {
              return { ...l, quantity: Math.max(0, (Number(l.quantity) || 0) - u.actual_qty) };
            }
            return l;
          });
          const totalFromLots = lots.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
          updates = { lot_numbers: lots, quantity: totalFromLots };
        } else {
          // Plain qty deduction
          updates = { quantity: Math.max(0, (Number(inv.quantity) || 0) - u.actual_qty) };
        }

        await base44.entities.Inventory.update(inv.id, updates);
      }

      return usage.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["shopfloor_batches"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(`Saved ${count} material entries · inventory deducted`);
      onClose();
    },
    onError: (err) => toast.error(`Save failed: ${err?.message || "unknown"}`),
  });

  const totalActual = rows.reduce((s, r) => s + (Number(r.actual_qty) || 0), 0);
  const filledCount = rows.filter((r) => Number(r.actual_qty) > 0).length;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-orange-400" />
              Lot Capture — {batch?.batch_id}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="text-sm text-zinc-400">
              <span className="text-zinc-200 font-medium">{batch?.product_name}</span>
              <span className="text-zinc-600 mx-2">·</span>
              <span>{batch?.quantity?.toLocaleString()} units planned</span>
            </div>

            {rows.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-sm flex flex-col items-center gap-2">
                <AlertCircle className="w-6 h-6" />
                No recipe ingredients found for this batch.
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-800 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-800/50">
                      <th className="text-left px-3 py-2 text-zinc-400 font-medium">Material</th>
                      <th className="text-right px-3 py-2 text-zinc-400 font-medium">Expected</th>
                      <th className="text-left px-3 py-2 text-zinc-400 font-medium w-32">Actual</th>
                      <th className="text-left px-3 py-2 text-zinc-400 font-medium">Lot Number</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => {
                      const inv = invBySku[r.material_sku?.toLowerCase()];
                      const lots = inv?.lot_numbers || [];
                      const variance = (Number(r.actual_qty) || 0) - r.expected_qty;
                      const isOver = Math.abs(variance) > r.expected_qty * 0.05; // 5% tol

                      return (
                        <tr key={idx} className="border-b border-zinc-800/50 align-top">
                          <td className="px-3 py-2">
                            <div className="text-zinc-200">{r.material_name}</div>
                            <div className="font-mono text-[10px] text-zinc-500">{r.material_sku}</div>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <span className="text-zinc-300">{r.expected_qty}</span>
                            <span className="text-zinc-500 ml-1">{r.unit}</span>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              step="0.001"
                              value={r.actual_qty}
                              onChange={(e) => updateRow(idx, { actual_qty: e.target.value })}
                              placeholder="0"
                              className="bg-zinc-800 border-zinc-700 h-7 text-xs"
                            />
                            {Number(r.actual_qty) > 0 && isOver && (
                              <div className={`text-[10px] mt-0.5 ${variance > 0 ? "text-amber-400" : "text-red-400"}`}>
                                {variance > 0 ? "+" : ""}{variance.toFixed(2)} {r.unit}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              {lots.length > 0 ? (
                                <Select
                                  value={r.lot_number || ""}
                                  onValueChange={(v) => updateRow(idx, { lot_number: v })}
                                >
                                  <SelectTrigger className="bg-zinc-800 border-zinc-700 h-7 text-xs flex-1">
                                    <SelectValue placeholder="Pick lot…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {lots.map((l, li) => (
                                      <SelectItem key={li} value={l.lot}>
                                        {l.lot} ({l.quantity} {r.unit})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  value={r.lot_number}
                                  onChange={(e) => updateRow(idx, { lot_number: e.target.value })}
                                  placeholder="Lot #"
                                  className="bg-zinc-800 border-zinc-700 h-7 text-xs flex-1"
                                />
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setScannerFor(idx)}
                                className="h-7 w-7 p-0 text-zinc-400 hover:text-orange-400 shrink-0"
                                title="Scan lot barcode"
                              >
                                <ScanLine className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                            {!inv && (
                              <div className="text-[10px] text-amber-400/80 mt-0.5 flex items-center gap-1">
                                <AlertCircle className="w-2.5 h-2.5" /> No inventory match
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {rows.length > 0 && (
              <div className="bg-zinc-800/50 rounded-lg p-3 flex items-center justify-between text-sm">
                <div className="text-zinc-400">
                  <Package className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                  {filledCount} of {rows.length} materials recorded
                </div>
                <Badge variant="orange">Inventory will be deducted on save</Badge>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} className="border-zinc-700">
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
            <Button
              onClick={() => { setSaving(true); saveMutation.mutate(); }}
              disabled={saveMutation.isPending || filledCount === 0}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save & Deduct
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BarcodeScanner
        open={scannerFor != null}
        onClose={() => setScannerFor(null)}
        onScan={handleScanResult}
        title="Scan Lot Barcode"
      />
    </>
  );
}