import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency, formatPercent } from "./profitabilityEngine";
import { Badge } from "@/components/ui/badge";

export default function SKUCostBreakdown({ row, open, onClose }) {
  if (!row) return null;

  const costLines = [
    { label: "Ingredients", value: row.costs.ingredient },
    { label: "Packaging", value: row.costs.packaging },
    { label: "Labor", value: row.costs.labor },
    { label: "Overhead", value: row.costs.overhead },
    { label: "Shipping", value: row.costs.shipping },
    { label: "Other Variable", value: row.costs.other },
  ];

  const total = row.costs.total;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">
            {row.name}
            <span className="text-xs text-zinc-500 font-normal ml-2">{row.sku}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Cost breakdown */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Per-Unit Cost Breakdown</h3>
            <div className="space-y-1.5">
              {costLines.map(c => (
                <div key={c.label} className="flex items-center justify-between text-sm py-1.5 border-b border-zinc-800 last:border-0">
                  <span className="text-zinc-400">{c.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-zinc-200">{formatCurrency(c.value)}</span>
                    <span className="text-xs text-zinc-600 w-12 text-right">
                      {total > 0 ? `${((c.value / total) * 100).toFixed(0)}%` : "—"}
                    </span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm pt-2 mt-1 border-t border-zinc-700">
                <span className="font-semibold text-zinc-200">Dead Net Cost</span>
                <span className="font-mono font-semibold text-orange-400">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          {/* Pricing comparison */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Pricing & Margins</h3>
            <div className="grid grid-cols-2 gap-3">
              <PriceCard label="Retail" price={row.retail.price} cost={total} margin={row.retail.margin_pct} marginAmt={row.retail.margin_amount} below={row.retail.below_target} target={row.target_margin_pct} />
              <PriceCard label="Wholesale" price={row.wholesale.price} cost={total} margin={row.wholesale.margin_pct} marginAmt={row.wholesale.margin_amount} below={row.wholesale.below_target} target={row.target_margin_pct} />
            </div>
          </div>

          {/* Data gaps */}
          {row.data_gaps?.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-500 mb-2">Cost Data Gaps</h3>
              <div className="flex flex-wrap gap-1.5">
                {row.data_gaps.map((g, i) => (
                  <Badge key={i} className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">
                    {g}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                These items are missing cost data in Inventory — the cost shown excludes them.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PriceCard({ label, price, cost, margin, marginAmt, below, target }) {
  if (!price) {
    return (
      <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-3">
        <div className="text-xs text-zinc-500 uppercase tracking-wider">{label}</div>
        <div className="text-lg text-zinc-600 mt-1">No price set</div>
      </div>
    );
  }
  const toneClass = below ? "text-red-400" : margin >= 0 ? "text-green-400" : "text-amber-400";
  return (
    <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-zinc-500 uppercase tracking-wider">{label}</div>
        {below && <Badge className="bg-red-500/10 text-red-400 border-red-500/30 text-[10px]">Below {target}%</Badge>}
      </div>
      <div className="text-lg font-semibold text-zinc-100 mt-1 font-mono">{formatCurrency(price)}</div>
      <div className={`text-sm font-mono ${toneClass}`}>
        {formatPercent(margin)} margin
      </div>
      <div className="text-xs text-zinc-500 font-mono">
        {formatCurrency(marginAmt)} / unit
      </div>
    </div>
  );
}