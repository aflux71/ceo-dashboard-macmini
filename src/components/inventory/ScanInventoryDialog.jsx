import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import BarcodeScanner from "@/components/scanner/BarcodeScanner";
import BinLocationPicker from "@/components/inventory/BinLocationPicker";
import { Camera, Plus, Minus, MapPin, Package, AlertCircle, Check, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * Camera-based inventory scan flow.
 * - Scan SKU/QR → find matching Inventory record
 * - Increment / decrement quantity
 * - Update bin/rack location (manually or by scanning a bin label)
 *
 * Bin lookup logic: if scanned code matches a known bin name, treat as a bin update
 * for the currently active item. Otherwise treat as a SKU lookup.
 */
export default function ScanInventoryDialog({ open, onClose, inventory, binLocations }) {
  const queryClient = useQueryClient();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMode, setScanMode] = useState("item"); // "item" | "bin"
  const [item, setItem] = useState(null);
  const [delta, setDelta] = useState(1);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Inventory.update(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setItem(updated);
    },
  });

  const reset = () => {
    setItem(null);
    setError(null);
    setSuccess(null);
    setDelta(1);
    setScanMode("item");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleScanResult = (decoded) => {
    setScannerOpen(false);
    setError(null);
    setSuccess(null);
    const code = (decoded || "").trim();
    if (!code) return;

    if (scanMode === "bin") {
      // Update active item's location
      if (!item) {
        setError("Scan an item first.");
        return;
      }
      const matchingBin = binLocations.find(
        (b) => b.name?.toLowerCase() === code.toLowerCase()
      );
      const newLocation = matchingBin ? matchingBin.name : code;
      updateMutation.mutate(
        { id: item.id, data: { location: newLocation } },
        {
          onSuccess: () => setSuccess(`Location updated to ${newLocation}`),
        }
      );
      setScanMode("item");
      return;
    }

    // Item lookup by SKU (case-insensitive). Also support QR payloads like "SKU:RM-001".
    const cleaned = code.replace(/^SKU[:\s]*/i, "").trim();
    const found = inventory.find(
      (i) => i.sku?.toLowerCase() === cleaned.toLowerCase()
    );
    if (!found) {
      setError(`No item found for code "${cleaned}"`);
      return;
    }
    setItem(found);
  };

  const adjustQty = (sign) => {
    if (!item) return;
    const amount = Math.abs(Number(delta) || 0);
    if (!amount) return;
    const newQty = Math.max(0, Number(item.quantity || 0) + sign * amount);
    updateMutation.mutate(
      { id: item.id, data: { quantity: newQty } },
      {
        onSuccess: () =>
          setSuccess(`Quantity updated: ${item.quantity} → ${newQty} ${item.unit || ""}`),
      }
    );
  };

  const updateLocation = (newLoc) => {
    if (!item) return;
    updateMutation.mutate(
      { id: item.id, data: { location: newLoc } },
      { onSuccess: () => setSuccess(`Location updated to ${newLoc || "—"}`) }
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-orange-400" />
              Scan Inventory
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Scan trigger */}
            {!item ? (
              <div className="text-center py-4">
                <p className="text-sm text-zinc-400 mb-4">
                  Scan a product barcode or QR code to look up an item.
                </p>
                <Button
                  onClick={() => {
                    setScanMode("item");
                    setScannerOpen(true);
                  }}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Open Camera
                </Button>
                {error && (
                  <p className="mt-3 text-sm text-red-400 flex items-center justify-center gap-1.5">
                    <AlertCircle className="w-4 h-4" /> {error}
                  </p>
                )}
              </div>
            ) : (
              <>
                {/* Item card */}
                <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-orange-400 shrink-0" />
                        <span className="font-mono text-sm text-orange-400">
                          {item.sku}
                        </span>
                      </div>
                      <p className="text-zinc-100 font-medium mt-1 truncate">{item.name}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Bin:{" "}
                        <span className="font-mono text-zinc-300">
                          {item.location || "—"}
                        </span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-bold text-zinc-100 tabular-nums">
                        {item.quantity}
                      </p>
                      <p className="text-xs text-zinc-500">{item.unit}</p>
                    </div>
                  </div>
                </div>

                {/* Quantity adjust */}
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400">Adjust quantity by</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => adjustQty(-1)}
                      disabled={updateMutation.isPending}
                      variant="outline"
                      className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300 flex-1"
                    >
                      <Minus className="w-4 h-4 mr-1" /> Remove
                    </Button>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={delta}
                      onChange={(e) => setDelta(e.target.value)}
                      className="w-20 bg-zinc-800 border-zinc-700 text-center"
                    />
                    <Button
                      onClick={() => adjustQty(+1)}
                      disabled={updateMutation.isPending}
                      variant="outline"
                      className="border-green-500/40 text-green-400 hover:bg-green-500/10 hover:text-green-300 flex-1"
                    >
                      <Plus className="w-4 h-4 mr-1" /> Add
                    </Button>
                  </div>
                </div>

                {/* Location update */}
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> Update bin / rack location
                  </Label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <BinLocationPicker
                        value={item.location || ""}
                        onChange={updateLocation}
                        bins={binLocations}
                      />
                    </div>
                    <Button
                      onClick={() => {
                        setScanMode("bin");
                        setScannerOpen(true);
                      }}
                      variant="outline"
                      className="border-zinc-700 text-zinc-300"
                      title="Scan bin label"
                    >
                      <Camera className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {success && (
                  <p className="text-sm text-green-400 flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> {success}
                  </p>
                )}
                {error && (
                  <p className="text-sm text-red-400 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" /> {error}
                  </p>
                )}

                <Button
                  onClick={() => {
                    reset();
                    setScannerOpen(true);
                  }}
                  variant="outline"
                  className="w-full border-zinc-700 text-zinc-300"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Scan another item
                </Button>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose} className="border-zinc-700">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScanResult}
        title={scanMode === "bin" ? "Scan Bin Label" : "Scan Product"}
      />
    </>
  );
}