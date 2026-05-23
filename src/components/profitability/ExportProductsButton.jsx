import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Escape a value for safe CSV output (handles commas, quotes, newlines).
const csvCell = (val) => {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const fmtMoney = (n) => {
  if (n === null || n === undefined || n === "" || isNaN(Number(n))) return "";
  return Number(n).toFixed(2);
};

/**
 * Exports finished_product inventory items as CSV with:
 * Product Name, SKU, UPC, Retail Price, Cost, Wholesale Price
 *
 * Field mapping:
 *  - SKU  -> Inventory.supplier_sku (the original Shopify variant SKU) if present,
 *           otherwise Inventory.sku
 *  - UPC  -> Inventory.sku (Shopify-synced records store the barcode here)
 */
export default function ExportProductsButton() {
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    setBusy(true);
    try {
      const items = await base44.entities.Inventory.filter(
        { type: "finished_product" },
        "name",
        5000
      );

      const headers = [
        "Product Name",
        "SKU",
        "UPC",
        "Retail Price",
        "Cost",
        "Wholesale Price",
      ];

      const rows = (items || []).map((it) => {
        const upc = it.sku || "";
        const sku = it.supplier_sku || it.sku || "";
        return [
          it.name || "",
          sku,
          upc,
          fmtMoney(it.retail_price),
          fmtMoney(it.cost_per_unit),
          fmtMoney(it.wholesale_price),
        ].map(csvCell).join(",");
      });

      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `products-export-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed: " + (err.message || "Unknown error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      onClick={handleExport}
      disabled={busy}
      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
    >
      {busy ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <Download className="w-4 h-4 mr-2" />
      )}
      Export CSV
    </Button>
  );
}