import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingDown, TrendingUp, Settings2 } from "lucide-react";
import { formatCurrency, formatPercent } from "./profitabilityEngine";

export default function ProfitabilityTable({ rows, onSelect, onEditCosts }) {
  if (!rows || rows.length === 0) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-8 text-center text-zinc-500">
          No products match the current filters.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950/50 text-xs uppercase text-zinc-500 tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-medium">SKU / Product</th>
              <th className="text-right px-4 py-3 font-medium">Dead Net Cost</th>
              <th className="text-right px-4 py-3 font-medium">Retail $</th>
              <th className="text-right px-4 py-3 font-medium">Retail Margin</th>
              <th className="text-right px-4 py-3 font-medium">Wholesale $</th>
              <th className="text-right px-4 py-3 font-medium">WS Margin</th>
              <th className="text-right px-4 py-3 font-medium">Target</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="text-center px-4 py-3 font-medium w-20">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.map((r) => (
              <tr
                key={r.sku}
                className="hover:bg-zinc-800/40 transition-colors cursor-pointer"
                onClick={() => onSelect?.(r)}
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-zinc-100">{r.name}</div>
                  <div className="text-xs text-zinc-500 flex items-center gap-2">
                    <span>{r.sku}</span>
                    {r.category && <span className="text-zinc-600">• {r.category}</span>}
                    {r.data_gaps?.length > 0 && (
                      <span className="text-amber-500 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {r.data_gaps.length} cost gap{r.data_gaps.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-zinc-200 font-mono">
                  {formatCurrency(r.costs.total)}
                </td>
                <td className="px-4 py-3 text-right text-zinc-300 font-mono">
                  {r.retail.price > 0 ? formatCurrency(r.retail.price) : <span className="text-zinc-600">—</span>}
                </td>
                <td className={`px-4 py-3 text-right font-mono ${r.retail.below_target ? "text-red-400" : r.retail.margin_pct != null && r.retail.margin_pct >= 0 ? "text-green-400" : "text-zinc-500"}`}>
                  <div>{formatPercent(r.retail.margin_pct)}</div>
                  {r.retail.price > 0 && (
                    <div className="text-[10px] text-zinc-500">{formatCurrency(r.retail.margin_amount)}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-zinc-300 font-mono">
                  {r.wholesale.price > 0 ? formatCurrency(r.wholesale.price) : <span className="text-zinc-600">—</span>}
                </td>
                <td className={`px-4 py-3 text-right font-mono ${r.wholesale.below_target ? "text-red-400" : r.wholesale.margin_pct != null && r.wholesale.margin_pct >= 0 ? "text-green-400" : "text-zinc-500"}`}>
                  <div>{formatPercent(r.wholesale.margin_pct)}</div>
                  {r.wholesale.price > 0 && (
                    <div className="text-[10px] text-zinc-500">{formatCurrency(r.wholesale.margin_amount)}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-zinc-400 font-mono">
                  {r.target_margin_pct != null ? `${r.target_margin_pct}%` : <span className="text-zinc-600">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  {!r.has_price ? (
                    <Badge variant="outline" className="border-zinc-700 text-zinc-500">No Price</Badge>
                  ) : r.retail.below_target || r.wholesale.below_target ? (
                    <Badge className="bg-red-500/10 text-red-400 border-red-500/30">
                      <TrendingDown className="w-3 h-3 mr-1" /> Below Target
                    </Badge>
                  ) : r.target_margin_pct != null ? (
                    <Badge className="bg-green-500/10 text-green-400 border-green-500/30">
                      <TrendingUp className="w-3 h-3 mr-1" /> On Target
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-zinc-700 text-zinc-500">No Target</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onEditCosts?.(r)}
                    className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-orange-400 transition-colors"
                    title="Edit overhead / pricing"
                  >
                    <Settings2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}