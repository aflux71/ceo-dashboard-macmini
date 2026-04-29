import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X, AlertCircle, Loader2 } from "lucide-react";

/**
 * Camera-based barcode/QR scanner.
 * Calls onScan(decodedText) with the decoded string, then closes.
 */
export default function BarcodeScanner({ open, onClose, onScan, title = "Scan Code" }) {
  const containerId = "barcode-scanner-region";
  const scannerRef = useRef(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError(null);
    setStarting(true);

    const start = async () => {
      try {
        const scanner = new Html5Qrcode(containerId, { verbose: false });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          (decoded) => {
            // Stop scanning then return result
            scanner.stop().then(() => {
              if (!cancelled) onScan(decoded);
            }).catch(() => {
              if (!cancelled) onScan(decoded);
            });
          },
          () => { /* ignore per-frame decode errors */ }
        );
        if (!cancelled) setStarting(false);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Unable to start camera");
          setStarting(false);
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        s.stop().catch(() => {}).finally(() => {
          try { s.clear(); } catch { /* ignore */ }
        });
        scannerRef.current = null;
      }
    };
  }, [open, onScan]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b border-zinc-800">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Camera className="w-4 h-4 text-orange-400" /> {title}
          </DialogTitle>
        </DialogHeader>

        <div className="relative bg-black aspect-square">
          <div id={containerId} className="w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover" />

          {starting && (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Starting camera…
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-zinc-900/90">
              <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
              <p className="text-sm text-zinc-300 mb-1 font-medium">Camera unavailable</p>
              <p className="text-xs text-zinc-500">{error}</p>
            </div>
          )}

          {!error && !starting && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-[260px] h-[260px] border-2 border-orange-400/70 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-between">
          <p className="text-xs text-zinc-500">Point camera at QR code or barcode</p>
          <Button variant="outline" size="sm" onClick={onClose} className="border-zinc-700">
            <X className="w-3.5 h-3.5 mr-1" /> Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}