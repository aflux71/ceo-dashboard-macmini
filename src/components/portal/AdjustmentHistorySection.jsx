import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, History } from "lucide-react";

const STATUS_DISPLAY = {
  submitted: { label: "Submitted", className: "bg-zinc-700 text-zinc-200 border-zinc-600" },
  acknowledged: { label: "Acknowledged ✓", className: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
  reviewed: { label: "Under Review", className: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  applied: { label: "Applied", className: "bg-green-500/20 text-green-300 border-green-500/40" },
  rejected: { label: "Rejected", className: "bg-red-500/20 text-red-300 border-red-500/40" }
};

const formatQty = (q) => {
  const n = Number(q) || 0;
  return n > 0 ? `+${n}` : String(n);
};

const formatDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
};

export default function AdjustmentHistorySection({ storeName, refreshKey }) {
  const [expanded, setExpanded] = useState(false);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchHistory = async () => {
    if (!storeName) return;
    setLoading(true);
    try {
      const list = await base44.entities.InventoryAdjustment.filter(
        { store_name: storeName },
        "-created_date",
        30
      );
      setRecords(list || []);
      setLoaded(true);
    } catch {
      setRecords([]);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  // Load when first expanded
  useEffect(() => {
    if (expanded && !loaded) fetchHistory();
    // eslint-disable-next-line
  }, [expanded]);

  // Refresh when refreshKey changes (after a successful submission) if already loaded/expanded
  useEffect(() => {
    if (loaded) fetchHistory();
    // eslint-disable-next-line
  }, [refreshKey]);

  return (
    <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/40 transition-colors"
      >
        <div className="flex items-center gap-2 text-zinc-200">
          <History className="w-4 h-4 text-zinc-400" />
          <span className="font-semibold">Past Submissions</span>
          {loaded && (
            <span className="text-xs text-zinc-500">({records.length})</span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-zinc-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-zinc-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-zinc-800">
          {loading ? (
            <div className="px-4 py-8 text-center text-zinc-500 text-sm">Loading...</div>
          ) : records.length === 0 ? (
            <div className="px-4 py-8 text-center text-zinc-500 text-sm">
              No adjustment requests submitted yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-800/60 text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 text-left">Adj #</th>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-left">Reason</th>
                    <th className="px-3 py-2 text-left">Submitted</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const q = Number(r.quantity) || 0;
                    const status = STATUS_DISPLAY[r.status] || STATUS_DISPLAY.submitted;
                    return (
                      <tr key={r.id} className="border-t border-zinc-800">
                        <td className="px-3 py-2 text-orange-400 font-mono text-xs">{r.adjustment_number}</td>
                        <td className="px-3 py-2 text-zinc-200">{r.product_name}</td>
                        <td className="px-3 py-2 text-zinc-400 font-mono text-xs">{r.sku}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${q < 0 ? "text-red-400" : "text-green-400"}`}>
                          {formatQty(q)}
                        </td>
                        <td className="px-3 py-2 text-zinc-300">{r.adjustment_reason_label || "—"}</td>
                        <td className="px-3 py-2 text-zinc-400">{formatDate(r.created_date)}</td>
                        <td className="px-3 py-2">
                          <Badge className={`text-[10px] border ${status.className}`}>
                            {status.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}