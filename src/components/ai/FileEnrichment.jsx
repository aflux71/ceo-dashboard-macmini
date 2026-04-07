import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Download, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet } from "lucide-react";
import Papa from "papaparse";

const ENRICHMENT_TYPES = [
  { id: "label_count", label: "Add Label On-Hand Count", description: "Matches product SKU/name and appends current label stock qty" },
  { id: "inventory_qty", label: "Add Inventory Quantity", description: "Appends current on-hand quantity from Inventory entity" },
  { id: "demand_avg", label: "Add Avg Monthly Demand", description: "Appends average monthly demand from DemandSummary" },
];

export default function FileEnrichment() {
  const [enrichmentType, setEnrichmentType] = useState("label_count");
  const [rows, setRows] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [fileName, setFileName] = useState("");
  const [enriched, setEnriched] = useState(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const fileRef = useRef(null);

  const handleFile = (file) => {
    if (!file) return;
    setFileName(file.name);
    setEnriched(null);
    setSummary(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        setRows(result.data);
        setHeaders(result.meta.fields || []);
      },
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const runEnrichment = async () => {
    if (!rows || rows.length === 0) return;
    setLoading(true);

    try {
      let enrichedRows = [];
      let matched = 0;

      if (enrichmentType === "label_count") {
        const labels = await base44.entities.Label.list('-updated_date', 500).catch(() => []);
        // Build lookup by product_sku and by name (lowercase)
        const byProductSku = {};
        const byName = {};
        labels.forEach(l => {
          if (l.product_sku) byProductSku[l.product_sku.toLowerCase()] = l;
          if (l.name) byName[l.name.toLowerCase()] = l;
          if (l.sku) byProductSku[l.sku.toLowerCase()] = l;
        });

        enrichedRows = rows.map(row => {
          const skuVal = (row.SKU || row.sku || row.Sku || row['Product SKU'] || "").toString().toLowerCase().trim();
          const nameVal = (row.Name || row.name || row.Product || row.product || row['Product Name'] || "").toString().toLowerCase().trim();
          const label = byProductSku[skuVal] || byName[nameVal] || null;
          if (label) matched++;
          return {
            ...row,
            "Label On Hand": label ? label.current_quantity : "Not Found",
            "Label Name": label ? label.name : "",
            "Label Reorder Point": label ? label.reorder_point : "",
          };
        });

      } else if (enrichmentType === "inventory_qty") {
        const inv = await base44.entities.Inventory.list('-updated_date', 500).catch(() => []);
        const bySku = {};
        inv.forEach(i => { if (i.sku) bySku[i.sku.toLowerCase()] = i; });

        enrichedRows = rows.map(row => {
          const skuVal = (row.SKU || row.sku || row.Sku || row['Product SKU'] || "").toString().toLowerCase().trim();
          const item = bySku[skuVal] || null;
          if (item) matched++;
          return {
            ...row,
            "On Hand Qty": item ? item.quantity : "Not Found",
            "Unit": item ? item.unit : "",
            "Reorder Point": item ? (item.reorder_point || "") : "",
          };
        });

      } else if (enrichmentType === "demand_avg") {
        const demand = await base44.entities.DemandSummary.list('-updated_date', 500).catch(() => []);
        const bySku = {};
        demand.forEach(d => { if (d.sku) bySku[d.sku.toLowerCase()] = d; });

        enrichedRows = rows.map(row => {
          const skuVal = (row.SKU || row.sku || row.Sku || row['Product SKU'] || "").toString().toLowerCase().trim();
          const d = bySku[skuVal] || null;
          if (d) matched++;
          return {
            ...row,
            "Avg Monthly Demand": d ? d.avgMonthly : "Not Found",
            "Total Qty (Period)": d ? d.totalQty : "",
            "Data Months": d ? d.dataMonths : "",
          };
        });
      }

      setEnriched(enrichedRows);
      setSummary({ total: rows.length, matched, unmatched: rows.length - matched });
    } catch (err) {
      alert("Enrichment failed: " + err.message);
    }
    setLoading(false);
  };

  const downloadCSV = () => {
    if (!enriched) return;
    const csv = Papa.unparse(enriched);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.replace(".csv", "") + "_enriched.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const enrichedHeaders = enriched && enriched.length > 0 ? Object.keys(enriched[0]) : [];

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Enrichment Type */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">1. Choose Enrichment Type</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ENRICHMENT_TYPES.map(t => (
              <button
                key={t.id}
                onClick={() => setEnrichmentType(t.id)}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  enrichmentType === t.id
                    ? "border-orange-500/40 bg-orange-500/10"
                    : "border-zinc-700 hover:border-zinc-600 bg-zinc-800/50"
                }`}
              >
                <p className={`text-sm font-medium ${enrichmentType === t.id ? "text-orange-400" : "text-zinc-200"}`}>{t.label}</p>
                <p className="text-[11px] text-zinc-500 mt-1">{t.description}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* File Upload */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">2. Upload Your CSV File</h3>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-zinc-700 hover:border-orange-500/40 rounded-lg p-8 text-center cursor-pointer transition-colors"
          >
            <Upload className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-sm text-zinc-400">Drop a CSV file here or <span className="text-orange-400">browse</span></p>
            <p className="text-[11px] text-zinc-600 mt-1">Needs a SKU or Product Name column to match records</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>
          {rows && (
            <div className="mt-3 flex items-center gap-2 text-sm text-zinc-400">
              <FileSpreadsheet className="w-4 h-4 text-green-400" />
              <span className="text-zinc-300">{fileName}</span>
              <span className="text-zinc-500">— {rows.length} rows, {headers.length} columns</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Run */}
      {rows && (
        <Button
          onClick={runEnrichment}
          disabled={loading}
          className="bg-orange-600 hover:bg-orange-500 text-white"
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {loading ? "Enriching..." : "Run Enrichment"}
        </Button>
      )}

      {/* Summary */}
      {summary && (
        <div className="flex items-center gap-4 p-3 bg-zinc-900 border border-zinc-800 rounded-lg text-sm">
          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
          <span className="text-zinc-300">
            <span className="text-green-400 font-semibold">{summary.matched}</span>/{summary.total} rows matched
            {summary.unmatched > 0 && <span className="text-zinc-500"> · {summary.unmatched} unmatched (showing "Not Found")</span>}
          </span>
          <Button onClick={downloadCSV} variant="outline" size="sm" className="ml-auto border-zinc-700 text-zinc-300 hover:text-white">
            <Download className="w-3.5 h-3.5 mr-1.5" /> Download CSV
          </Button>
        </div>
      )}

      {/* Preview Table */}
      {enriched && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0 overflow-auto max-h-96">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-800/50">
                  {enrichedHeaders.map(h => (
                    <th key={h} className="text-left px-3 py-2 text-zinc-400 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enriched.slice(0, 100).map((row, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    {enrichedHeaders.map(h => (
                      <td key={h} className={`px-3 py-1.5 whitespace-nowrap ${
                        row[h] === "Not Found" ? "text-red-400" :
                        ["Label On Hand","On Hand Qty","Avg Monthly Demand"].includes(h) ? "text-green-400 font-medium" :
                        "text-zinc-300"
                      }`}>
                        {row[h]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {enriched.length > 100 && (
              <p className="text-xs text-zinc-500 text-center py-2">Showing first 100 of {enriched.length} rows. Download CSV for full data.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}