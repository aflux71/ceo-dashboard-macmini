import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingDown, TrendingUp, AlertTriangle, DollarSign } from "lucide-react";
import { formatPercent } from "./profitabilityEngine";

export default function ProfitabilityStats({ rows }) {
  const withPrice = rows.filter(r => r.has_price);
  const belowTarget = rows.filter(r => r.retail.below_target || r.wholesale.below_target).length;
  const noTarget = rows.filter(r => r.has_price && r.target_margin_pct == null).length;
  const withGaps = rows.filter(r => r.data_gaps.length > 0).length;

  const validRetailMargins = withPrice.map(r => r.retail.margin_pct).filter(n => n != null && !isNaN(n));
  const avgRetailMargin = validRetailMargins.length
    ? validRetailMargins.reduce((a, b) => a + b, 0) / validRetailMargins.length
    : null;

  const stats = [
    {
      label: "Avg Retail Margin",
      value: formatPercent(avgRetailMargin),
      icon: DollarSign,
      tone: "text-orange-400",
      bg: "bg-orange-500/10",
    },
    {
      label: "Below Target",
      value: belowTarget,
      icon: TrendingDown,
      tone: "text-red-400",
      bg: "bg-red-500/10",
    },
    {
      label: "No Target Set",
      value: noTarget,
      icon: TrendingUp,
      tone: "text-zinc-400",
      bg: "bg-zinc-700/30",
    },
    {
      label: "Cost Data Gaps",
      value: withGaps,
      icon: AlertTriangle,
      tone: "text-amber-400",
      bg: "bg-amber-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map(s => (
        <Card key={s.label} className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center`}>
              <s.icon className={`w-5 h-5 ${s.tone}`} />
            </div>
            <div>
              <div className="text-xs text-zinc-500">{s.label}</div>
              <div className={`text-xl font-semibold ${s.tone}`}>{s.value}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}