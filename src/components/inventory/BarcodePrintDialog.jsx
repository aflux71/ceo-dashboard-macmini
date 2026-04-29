import React, { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Printer, Barcode as BarcodeIcon, X } from "lucide-react";

/**
 * Generate and print a Code-128 barcode label for an inventory item that
 * doesn't have a manufacturer barcode. Uses the SKU (or a custom code) as
 * the encoded value. Optionally prepends a lot number for traceability.
 */
export default function BarcodePrintDialog({ open, item, onClose }) {
  const svgRef = useRef(null);
  const [code, setCode] = useState("");
  const [lot, setLot] = useState("");
  const [copies, setCopies] = useState(1);

  useEffect(() => {
    if (open && item) {
      setCode(item.sku || "");
      setLot("");
      setCopies(1);
    }
  }, [open, item]);

  // Render the barcode whenever the code changes
  useEffect(() => {
    if (!open || !svgRef.current || !code) return;
    try {
      JsBarcode(svgRef.current, code, {
        format: "CODE128",
        width: 2,
        height: 70,
        displayValue: true,
        fontSize: 14,
        margin: 4,
      });
    } catch {
      /* invalid code — leave previous render */
    }
  }, [code, open]);

  const handlePrint = () => {
    if (!svgRef.current) return;
    const svgString = new XMLSerializer().serializeToString(svgRef.current);
    const labelHTML = `
      <div class="label">
        <div class="name">${item?.name || ""}</div>
        ${lot ? `<div class="lot">Lot: ${lot}</div>` : ""}
        <div class="bc">${svgString}</div>
      </div>
    `;

    const html = `<!DOCTYPE html><html><head><title>Barcode — ${code}</title>
    <style>
      @page { margin: 0.25in; }
      body { font-family: Arial, sans-serif; margin: 0; padding: 8px; }
      .label {
        border: 1px dashed #999;
        padding: 8px 12px;
        margin-bottom: 8px;
        page-break-inside: avoid;
        text-align: center;
        max-width: 320px;
      }
      .name { font-weight: bold; font-size: 12px; margin-bottom: 2px; }
      .lot { font-size: 10px; color: #555; margin-bottom: 4px; font-family: monospace; }
      .bc svg { display: block; margin: 0 auto; }
    </style></head><body>
      ${Array.from({ length: Math.max(1, Number(copies) || 1) }).map(() => labelHTML).join("")}
    </body></html>`;

    const win = window.open("", "_blank", "width=600,height=500");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarcodeIcon className="w-5 h-5 text-orange-400" />
            Print Barcode Label
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="text-sm text-zinc-400">
            <span className="text-zinc-200 font-medium">{item?.name}</span>
            <span className="text-zinc-600 mx-2">·</span>
            <span className="font-mono text-zinc-500">{item?.sku}</span>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Code (encoded as Code-128)</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-zinc-100 font-mono h-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Lot # (optional)</Label>
              <Input
                value={lot}
                onChange={(e) => setLot(e.target.value)}
                placeholder="LOT-001"
                className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Copies</Label>
              <Input
                type="number"
                min="1"
                max="100"
                value={copies}
                onChange={(e) => setCopies(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9"
              />
            </div>
          </div>

          {/* Preview */}
          <div className="bg-white rounded-md p-3 flex flex-col items-center justify-center min-h-[120px]">
            {code ? (
              <svg ref={svgRef} />
            ) : (
              <p className="text-zinc-400 text-xs">Enter a code to preview</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-zinc-700">
            <X className="w-4 h-4 mr-1" /> Cancel
          </Button>
          <Button
            onClick={handlePrint}
            disabled={!code}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}