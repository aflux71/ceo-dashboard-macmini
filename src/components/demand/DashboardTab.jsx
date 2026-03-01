import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  TrendingUp,
  Package,
  Calendar,
  ArrowRight,
  ShieldAlert,
  BarChart3,
  Eye,
  Ban,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { URGENCY_COLORS, URGENCY_LABELS, formatNumber, getCategoryColor } from "@/lib/demandHelpers";

export default function DashboardTab({
  plan,
  onViewDetail,
  onPushToPlanning,
  onExclude,
}) {
  if (!plan) return null;

  const { items, categories, summary } = plan;
  const top40 = items
    .slice()
    .sort((a, b) => {
      const uo = { CRITICAL: 0, LOW: 1, WATCH: 2, OK: 3 };
      if (uo[a.urgency] !== uo[b.urgency]) return uo[a.urgency] - uo[b.urgency];
      return b.productionNeed - a.productionNeed;
    })
    .slice(0, 40);

  const catChartData = categories.slice(0, 12).map((c, i) => ({
    name: c.category,
    need: c.totalNeed,
    fill: getCategoryColor(i),
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={ShieldAlert}
          label="Critical Items"
          value={summary.critical}
          sub="Immediate action needed"
          color="text-red-400"
          bg="bg-red-500/10"
        />
        <SummaryCard
          icon={Package}
          label="Total Production Need"
          value={formatNumber(summary.totalNeed)}
          sub={`${summary.totalSKUs} active SKUs`}
          color="text-orange-400"
          bg="bg-orange-500/10"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Avg Coverage"
          value={`${summary.avgCover} mo`}
          sub={`${summary.ok} SKUs OK`}
          color="text-green-400"
          bg="bg-green-500/10"
        />
        <SummaryCard
          icon={Calendar}
          label="Events Pending"
          value={summary.eventItems}
          sub={`${formatNumber(summary.eventQty)} units`}
          color="text-blue-400"
          bg="bg-blue-500/10"
        />
      </div>

      {/* Urgency breakdown bar */}
      <div className="flex gap-1 h-2 rounded-full overflow-hidden">
        {summary.critical > 0 && (
          <div className="bg-red-500" style={{ width: `${(summary.critical / summary.totalSKUs) * 100}%` }} />
        )}
        {summary.low > 0 && (
          <div className="bg-amber-500" style={{ width: `${(summary.low / summary.totalSKUs) * 100}%` }} />
        )}
        {summary.watch > 0 && (
          <div className="bg-yellow-500" style={{ width: `${(summary.watch / summary.totalSKUs) * 100}%` }} />
        )}
        {summary.ok > 0 && (
          <div className="bg-green-500" style={{ width: `${(summary.ok / summary.totalSKUs) * 100}%` }} />
        )}
      </div>
      <div className="flex gap-4 text-xs text-zinc-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />{summary.critical} Critical</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />{summary.low} Low</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" />{summary.watch} Watch</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />{summary.ok} OK</span>
      </div>

      {/* Top 40 Grid */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-400" />
          Top 40 — Urgent SKUs
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {top40.map((item) => {
            const uc = URGENCY_COLORS[item.urgency];
            return (
              <Card
                key={item.sku}
                className={`bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer`}
                onClick={() => onViewDetail(item)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`${uc.bg} ${uc.text} ${uc.border} border text-[10px] px-1.5 py-0`}>
                          {URGENCY_LABELS[item.urgency]}
                        </Badge>
                        <span className="text-[11px] text-zinc-500 font-mono">SKU {item.sku}</span>
                      </div>
                      <p className="text-sm font-medium text-zinc-200 truncate">{item.product}</p>
                      <p className="text-xs text-zinc-500">{item.category}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-zinc-800">
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase">On Hand</p>
                      <p className="text-sm font-semibold text-zinc-200">{formatNumber(item.onHand)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase">Avg/Mo</p>
                      <p className="text-sm font-semibold text-zinc-200">{formatNumber(Math.round(item.avgMonthly))}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase">Need</p>
                      <p className={`text-sm font-semibold ${item.productionNeed > 0 ? "text-orange-400" : "text-zinc-400"}`}>
                        {formatNumber(item.productionNeed)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); onPushToPlanning([item]); }}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded transition-colors"
                    >
                      <ArrowRight className="w-3 h-3" /> Push to Planning
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onViewDetail(item); }}
                      className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
                      title="View detail"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onExclude(item.sku); }}
                      className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-red-400 transition-colors"
                      title="Exclude SKU"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Category Breakdown */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-orange-400" />
            Production Need by Category
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={catChartData} layout="vertical" margin={{ left: 100, right: 20, top: 5, bottom: 5 }}>
                <XAxis type="number" tick={{ fill: "#71717a", fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  width={100}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px" }}
                  labelStyle={{ color: "#e4e4e7" }}
                  itemStyle={{ color: "#ea580c" }}
                  formatter={(v) => [formatNumber(v), "Need"]}
                />
                <Bar dataKey="need" radius={[0, 4, 4, 0]}>
                  {catChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, sub, color, bg }) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${bg}`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
          <div>
            <p className="text-[11px] text-zinc-500 uppercase tracking-wide">{label}</p>
            <p className="text-xl font-bold text-zinc-100">{value}</p>
            <p className="text-xs text-zinc-500">{sub}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
