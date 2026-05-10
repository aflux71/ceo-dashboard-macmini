import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, ClipboardList, Eye } from "lucide-react";
import { URGENCY_COLORS, URGENCY_LABELS, formatNumber, getCategories } from "@/components/demand/demandHelpers";
import { sortPlanItems } from "@/components/demand/demandEngine";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Read-only mirror of the Demand Planner's Full Plan table.
 * No selection, no push-to-planning, no config editing.
 */
export default function InventoryRequirementsTable({
  plan,
  plannerSKUs,
  workspace,
  onViewDetail,
}) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [urgencyFilter, setUrgencyFilter] = useState("All");
  const [sortBy, setSortBy] = useState("urgency");

  const categories = useMemo(() => plan ? getCategories(plan.items) : [], [plan]);

  const filtered = useMemo(() => {
    if (!plan) return [];
    let items = plan.items;

    if (search) {
      const q = search.toLowerCase();
      items = items.filter(i =>
        i.product.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q)
      );
    }
    if (catFilter !== "All") {
      items = items.filter(i => i.category === catFilter);
    }
    if (urgencyFilter !== "All") {
      items = items.filter(i => i.urgency === urgencyFilter);
    }

    return sortPlanItems(items, sortBy);
  }, [plan, search, catFilter, urgencyFilter, sortBy]);

  const now = new Date();
  const forecastMonthHeaders = [];
  for (let i = 0; i < (workspace.forecastMonths || 3); i++) {
    forecastMonthHeaders.push(MONTHS[(now.getMonth() + i) % 12]);
  }

  return (
    <div className="space-y-4">
      {/* Read-only banner */}
      <Card className="bg-blue-500/5 border-blue-500/20">
        <CardContent className="p-3 flex items-center gap-2">
          <Eye className="w-4 h-4 text-blue-400" />
          <span className="text-xs text-blue-300">
            Read-only view. To edit settings, exclusions, or push items to Planning, use the Demand Planner.
          </span>
        </CardContent>
      </Card>

      {/* Filters only — no config editing, no actions */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 items-center flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Search SKU or product..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 w-64 h-8 bg-zinc-900 border-zinc-700 text-sm"
            />
          </div>

          <select
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded px-2 py-1.5 focus:border-orange-500 focus:outline-none"
          >
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={urgencyFilter}
            onChange={e => setUrgencyFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded px-2 py-1.5 focus:border-orange-500 focus:outline-none"
          >
            <option value="All">All Urgency</option>
            <option value="CRITICAL">Critical</option>
            <option value="LOW">Low Stock</option>
            <option value="WATCH">Watch</option>
            <option value="OK">OK</option>
          </select>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded px-2 py-1.5 focus:border-orange-500 focus:outline-none"
          >
            <option value="urgency">Sort: Urgency</option>
            <option value="need">Sort: Need</option>
            <option value="demand">Sort: Demand</option>
            <option value="name">Sort: Name</option>
            <option value="sku">Sort: SKU</option>
            <option value="cover">Sort: Coverage</option>
          </select>
        </div>

        <div className="flex gap-2 items-center">
          <span className="text-xs text-zinc-500">{filtered.length} SKUs</span>
        </div>
      </div>

      {/* Table — read-only (no checkbox column, no push) */}
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 border-b border-zinc-800">
              <th className="px-3 py-2 text-left text-zinc-500 font-medium text-xs uppercase w-20">Urgency</th>
              <th className="px-3 py-2 text-left text-zinc-500 font-medium text-xs uppercase w-16">SKU</th>
              <th className="px-3 py-2 text-left text-zinc-500 font-medium text-xs uppercase">Product</th>
              <th className="px-3 py-2 text-right text-zinc-500 font-medium text-xs uppercase w-20">On Hand</th>
              <th className="px-3 py-2 text-right text-zinc-500 font-medium text-xs uppercase w-20">Avg/Mo</th>
              {workspace.mode === "forecast" && forecastMonthHeaders.map(m => (
                <th key={m} className="px-3 py-2 text-right text-zinc-500 font-medium text-xs uppercase w-16">{m}</th>
              ))}
              <th className="px-3 py-2 text-right text-zinc-500 font-medium text-xs uppercase w-20">Need</th>
              <th className="px-3 py-2 text-right text-zinc-500 font-medium text-xs uppercase w-20">Cover</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const uc = URGENCY_COLORS[item.urgency];
              return (
                <tr
                  key={item.sku}
                  onClick={() => onViewDetail && onViewDetail(item)}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/50 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2">
                    <Badge className={`${uc.bg} ${uc.text} ${uc.border} border text-[10px] px-1.5 py-0`}>
                      {URGENCY_LABELS[item.urgency]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-400">{item.sku}</td>
                  <td className="px-3 py-2">
                    <div className="text-zinc-200 text-sm flex items-center gap-1.5">
                      {item.product}
                      {plannerSKUs?.has(item.sku) && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1 py-0 rounded-full shrink-0" title="On Production Planner">
                          <ClipboardList className="w-2.5 h-2.5" /> Planner
                        </span>
                      )}
                    </div>
                    <div className="text-zinc-500 text-xs">{item.category}</div>
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">{formatNumber(item.onHand)}</td>
                  <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">{formatNumber(Math.round(item.avgMonthly))}</td>
                  {workspace.mode === "forecast" && item.forecastByMonth?.map((fm, i) => (
                    <td key={i} className="px-3 py-2 text-right text-zinc-400 tabular-nums text-xs">
                      {formatNumber(fm.demand)}
                    </td>
                  ))}
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${item.productionNeed > 0 ? "text-orange-400" : "text-zinc-500"}`}>
                    {formatNumber(item.productionNeed)}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${uc.text}`}>
                    {item.monthsCover === 99 ? "99+" : `${item.monthsCover} mo`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}