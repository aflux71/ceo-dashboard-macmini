import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  X, ArrowRight, BarChart3, MapPin, ShoppingCart, TrendingUp,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { URGENCY_COLORS, URGENCY_LABELS, formatNumber, formatCurrency, getCategoryColor } from "@/components/demand/demandHelpers";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function SKUDetail({
  item,
  workspace,
  onClose,
  onPushToPlanning,
  onOverrideInventory,
}) {
  if (!item) return null;

  const uc = URGENCY_COLORS[item.urgency];

  // Monthly history data
  const monthlyData = (item.monthly || []).map((qty, i) => ({
    month: MONTHS[i],
    qty,
  }));

  // Channel split
  const channelData = Object.entries(item.byChannel || {}).map(([name, value]) => ({
    name: name === "pos" ? "In-Store (POS)" : name === "online" ? "Online" : name,
    value,
  }));

  // Location breakdown
  const locationData = Object.entries(item.byLocation || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Forecast projection (combine history + forecast)
  const forecastData = item.forecastByMonth?.map(fm => ({
    month: fm.month,
    forecast: fm.demand,
  })) || [];

  const overrideValue = workspace.inventoryOverrides?.[item.sku];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-zinc-950 border-l border-zinc-800 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-950 border-b border-zinc-800 p-4 z-10">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge className={`${uc.bg} ${uc.text} ${uc.border} border text-xs`}>
                  {URGENCY_LABELS[item.urgency]}
                </Badge>
                <span className="text-xs text-zinc-500 font-mono">SKU {item.sku}</span>
              </div>
              <h2 className="text-lg font-semibold text-zinc-100">{item.product}</h2>
              <p className="text-sm text-zinc-500">{item.category}</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-5">
          {/* Key metrics */}
          <div className="grid grid-cols-3 gap-3">
            <MetricBox label="On Hand" value={formatNumber(item.onHand)} />
            <MetricBox label="Avg/Mo" value={formatNumber(Math.round(item.avgMonthly))} />
            <MetricBox label="Coverage" value={item.monthsCover === 99 ? "99+" : `${item.monthsCover} mo`} color={uc.text} />
            <MetricBox label="Production Need" value={formatNumber(item.productionNeed)} color={item.productionNeed > 0 ? "text-orange-400" : undefined} />
            <MetricBox label="Total Sold" value={formatNumber(item.totalQty)} />
            <MetricBox label="Revenue" value={formatCurrency(item.totalRevenue)} />
          </div>

          {/* Override on-hand */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-400">Override On-Hand for this workspace</p>
                  <p className="text-[10px] text-zinc-600">
                    {overrideValue != null ? `Override active: ${overrideValue}` : "Using inventory sync value"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder={String(item.onHand)}
                    className="w-24 h-8 bg-zinc-800 border-zinc-700 text-sm"
                    onBlur={e => {
                      const val = e.target.value;
                      if (val !== "") onOverrideInventory(item.sku, Number(val));
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        const val = e.target.value;
                        if (val !== "") onOverrideInventory(item.sku, Number(val));
                      }
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Monthly history */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-orange-400" />
                Monthly Sales History (2025)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#71717a", fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px" }}
                      labelStyle={{ color: "#e4e4e7" }}
                      formatter={v => [formatNumber(v), "Units"]}
                    />
                    <Bar dataKey="qty" fill="#ea580c" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Channel split */}
          {channelData.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-blue-400" />
                  Channel Split
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {channelData.map((ch, i) => {
                    const total = channelData.reduce((s, c) => s + c.value, 0);
                    const pct = total > 0 ? Math.round((ch.value / total) * 100) : 0;
                    return (
                      <div key={ch.name}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-zinc-300">{ch.name}</span>
                          <span className="text-zinc-400">{formatNumber(ch.value)} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: i === 0 ? "#3b82f6" : "#ea580c" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Location breakdown */}
          {locationData.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-green-400" />
                  Location Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {locationData.map((loc, i) => {
                    const total = locationData.reduce((s, l) => s + l.value, 0);
                    const pct = total > 0 ? Math.round((loc.value / total) * 100) : 0;
                    return (
                      <div key={loc.name}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-zinc-300">{loc.name}</span>
                          <span className="text-zinc-400">{formatNumber(loc.value)} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: getCategoryColor(i) }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Forecast projection */}
          {forecastData.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-purple-400" />
                  Forecast Projection
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={forecastData}>
                      <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 10 }} />
                      <YAxis tick={{ fill: "#71717a", fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px" }}
                        labelStyle={{ color: "#e4e4e7" }}
                        formatter={v => [formatNumber(v), "Forecast"]}
                      />
                      <Bar dataKey="forecast" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Event details */}
          {item.eventDetails?.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-amber-400" />
                  Event Demand
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {item.eventDetails.map((ev, i) => (
                    <div key={i} className="flex justify-between items-center text-xs p-2 bg-zinc-800/50 rounded">
                      <span className="text-zinc-300">{ev.event}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-500">Due {ev.due}</span>
                        <span className="text-amber-400 font-medium">{formatNumber(ev.qty)} units</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Push to planning */}
          <button
            onClick={() => onPushToPlanning([item])}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-500 text-white font-medium rounded-lg transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            Push to Planning — {formatNumber(item.productionNeed)} units
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold ${color || "text-zinc-100"}`}>{value}</p>
    </div>
  );
}