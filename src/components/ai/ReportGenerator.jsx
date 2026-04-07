import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Download, FileText, BarChart3, Package, Tag, Layers } from "lucide-react";
import ReactMarkdown from "react-markdown";
import Papa from "papaparse";

const REPORT_TYPES = [
  {
    id: "low_stock",
    label: "Low Stock Report",
    icon: Package,
    description: "All inventory items at or below reorder point",
    color: "text-red-400",
  },
  {
    id: "label_status",
    label: "Label Stock Status",
    icon: Tag,
    description: "All labels with current qty vs reorder point",
    color: "text-amber-400",
  },
  {
    id: "demand_summary",
    label: "Demand Summary Report",
    icon: BarChart3,
    description: "Top SKUs by avg monthly demand with urgency",
    color: "text-blue-400",
  },
  {
    id: "batch_summary",
    label: "Active Batch Summary",
    icon: Layers,
    description: "All batches currently in production or pending QC",
    color: "text-green-400",
  },
];

export default function ReportGenerator() {
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [aiSummary, setAiSummary] = useState("");

  const generateReport = async (type) => {
    setSelectedReport(type);
    setLoading(true);
    setReportData(null);
    setAiSummary("");

    try {
      let rows = [];
      let prompt = "";

      if (type === "low_stock") {
        const inv = await base44.entities.Inventory.list('-updated_date', 500).catch(() => []);
        rows = inv
          .filter(i => i.reorder_point != null && i.quantity <= i.reorder_point)
          .map(i => ({
            SKU: i.sku,
            Name: i.name,
            Type: i.type,
            "On Hand": i.quantity,
            Unit: i.unit,
            "Reorder Point": i.reorder_point,
            "Reorder Qty": i.reorder_qty || "",
            Supplier: i.supplier || "",
          }))
          .sort((a, b) => (a["On Hand"] - a["Reorder Point"]) - (b["On Hand"] - b["Reorder Point"]));
        prompt = `Summarize this low stock report for a manufacturing company. Highlight the most critical items and any patterns you notice:\n\n${rows.map(r => `${r.Name} (${r.SKU}): ${r["On Hand"]} / ${r["Reorder Point"]} ${r.Unit}`).join('\n')}`;

      } else if (type === "label_status") {
        const labels = await base44.entities.Label.list('-updated_date', 500).catch(() => []);
        rows = labels
          .map(l => ({
            SKU: l.sku,
            Name: l.name,
            "Product SKU": l.product_sku || "",
            "On Hand": l.current_quantity,
            "Reorder Point": l.reorder_point,
            Status: l.current_quantity <= l.reorder_point ? "⚠ Low" : "OK",
            Supplier: l.supplier_name || "",
          }))
          .sort((a, b) => (a["On Hand"] - a["Reorder Point"]) - (b["On Hand"] - b["Reorder Point"]));
        const low = rows.filter(r => r.Status === "⚠ Low");
        prompt = `Summarize this label stock report. There are ${low.length} labels below reorder point out of ${rows.length} total. Highlight the most urgent:\n\n${low.slice(0, 20).map(r => `${r.Name}: ${r["On Hand"]} on hand, reorder at ${r["Reorder Point"]}`).join('\n')}`;

      } else if (type === "demand_summary") {
        const demand = await base44.entities.DemandSummary.list('-avgMonthly', 100).catch(() => []);
        rows = demand.map(d => ({
          SKU: d.sku,
          Product: d.product,
          Category: d.category || "",
          "Avg Monthly": d.avgMonthly,
          "Total Qty": d.totalQty,
          "Data Months": d.dataMonths,
          "Period Start": d.periodStart || "",
          "Period End": d.periodEnd || "",
        }));
        prompt = `Summarize this demand report for a soap/bath product manufacturer. Identify top performers, slow movers, and any insights:\n\n${rows.slice(0, 30).map(r => `${r.Product} (${r.SKU}): ${r["Avg Monthly"]}/mo avg, ${r["Total Qty"]} total`).join('\n')}`;

      } else if (type === "batch_summary") {
        const batches = await base44.entities.Batch.filter({ status: { $in: ['started', 'on_hold', 'pending_qc', 'draft'] } }).catch(() => []);
        rows = batches.map(b => ({
          "Batch ID": b.batch_id,
          Product: b.product_name,
          SKU: b.sku,
          Qty: b.quantity,
          Status: b.status,
          Operator: b.operator || "",
          "Production Date": b.production_date ? new Date(b.production_date).toLocaleDateString() : "",
          Notes: b.notes || "",
        }));
        prompt = `Summarize this active batch report. Highlight any batches on hold, pending QC, or notable issues:\n\n${rows.map(r => `${r["Batch ID"]} - ${r.Product}: ${r.Qty} units, status: ${r.Status}`).join('\n')}`;
      }

      setReportData(rows);

      // AI summary
      if (prompt && rows.length > 0) {
        const summary = await base44.integrations.Core.InvokeLLM({ prompt });
        setAiSummary(summary);
      }
    } catch (err) {
      setAiSummary("Failed to generate report: " + err.message);
    }
    setLoading(false);
  };

  const downloadCSV = () => {
    if (!reportData) return;
    const csv = Papa.unparse(reportData);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedReport}_report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reportHeaders = reportData && reportData.length > 0 ? Object.keys(reportData[0]) : [];

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Report type selection */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {REPORT_TYPES.map(r => {
          const Icon = r.icon;
          return (
            <button
              key={r.id}
              onClick={() => generateReport(r.id)}
              disabled={loading}
              className={`p-4 rounded-lg border text-left transition-colors ${
                selectedReport === r.id
                  ? "border-orange-500/40 bg-orange-500/10"
                  : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
              }`}
            >
              <Icon className={`w-5 h-5 mb-2 ${r.color}`} />
              <p className="text-sm font-medium text-zinc-200">{r.label}</p>
              <p className="text-[11px] text-zinc-500 mt-1">{r.description}</p>
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
          <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
          <span className="text-sm text-zinc-400">Generating report and AI summary...</span>
        </div>
      )}

      {/* AI Summary */}
      {aiSummary && !loading && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-orange-400" />
              <h3 className="text-sm font-semibold text-zinc-300">AI Summary</h3>
            </div>
            <ReactMarkdown className="prose prose-sm prose-invert max-w-none text-zinc-300">
              {aiSummary}
            </ReactMarkdown>
          </CardContent>
        </Card>
      )}

      {/* Table + download */}
      {reportData && !loading && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">{reportData.length} rows</p>
            <Button onClick={downloadCSV} variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:text-white">
              <Download className="w-3.5 h-3.5 mr-1.5" /> Download CSV
            </Button>
          </div>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-0 overflow-auto max-h-[400px]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-800/60 sticky top-0">
                    {reportHeaders.map(h => (
                      <th key={h} className="text-left px-3 py-2 text-zinc-400 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((row, i) => (
                    <tr key={i} className="border-b border-zinc-800/40 hover:bg-zinc-800/30">
                      {reportHeaders.map(h => (
                        <td key={h} className={`px-3 py-1.5 whitespace-nowrap ${
                          String(row[h]).includes("⚠") ? "text-amber-400" :
                          h === "Status" && row[h] === "OK" ? "text-green-400" :
                          "text-zinc-300"
                        }`}>
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      {reportData && reportData.length === 0 && !loading && (
        <div className="text-center py-10 text-zinc-500 text-sm">No data found for this report.</div>
      )}
    </div>
  );
}