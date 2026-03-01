import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowRight,
  Search,
  Filter,
  ChevronDown,
  ArrowUpDown,
  CheckSquare,
  Square,
} from "lucide-react";
import { URGENCY_COLORS, URGENCY_LABELS, formatNumber, getCategories } from "@/lib/demandHelpers";
import { sortPlanItems } from "@/lib/demandEngine";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function PlanTable({
  plan,
  workspace,
  onWorkspaceChange,
  onViewDetail,
  onPushToPlanning,
  initialUrgencyFilter,
  onClearUrgencyFilter,
}) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [urgencyFilter, setUrgencyFilter] = useState(initialUrgencyFilter || "All");

  // Sync urgencyFilter when initialUrgencyFilter changes (e.g. from dashboard buttons)
  React.useEffect(() => {
    if (initialUrgencyFilter) {
      setUrgencyFilter(initialUrgencyFilter);
    }
  }, [initialUrgencyFilter]);
  const [sortBy, setSortBy] = useState("urgency");
  const [selected, setSelected] = useState(new Set());

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

  const toggleSelect = (sku) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku); else next.add(sku);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(i => i.sku)));
    }
  };

  const selectedItems = filtered.filter(i => selected.has(i.sku));

  const now = new Date();
  const forecastMonthHeaders = [];
  for (let i = 0; i < workspace.forecastMonths; i++) {
    forecastMonthHeaders.push(MONTHS[(now.getMonth() + i) % 12]);
  }

  return (
    <div className="space-y-4">
      {/* Config bar */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <ConfigField label="Mode">
              <select
                value={workspace.mode}
                onChange={e => onWorkspaceChange({ mode: e.target.value })}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-2 py-1.5 focus:border-orange-500 focus:outline-none"
              >
                <option value="forecast">Forecast</option>
                <option value="level">Level</option>
              </select>
            </ConfigField>

            {workspace.mode === "forecast" && (
              <>
                <ConfigField label="Months">
                  <select
                    value={workspace.forecastMonths}
                    onChange={e => onWorkspaceChange({ forecastMonths: Number(e.target.value) })}
                    className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-2 py-1.5 focus:border-orange-500 focus:outline-none"
                  >
                    {[1, 2, 3, 4, 5, 6].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </ConfigField>

                <ConfigField label="Growth %">
                  <Input
                    type="number"
                    value={workspace.growthPct}
                    onChange={e => onWorkspaceChange({ growthPct: Number(e.target.value) })}
                    className="w-20 h-8 bg-zinc-800 border-zinc-700 text-sm"
                  />
                </ConfigField>

                <ConfigField label="Safety %">
                  <Input
                    type="number"
                    value={workspace.safetyPct}
                    onChange={e => onWorkspaceChange({ safetyPct: Number(e.target.value) })}
                    className="w-20 h-8 bg-zinc-800 border-zinc-700 text-sm"
                  />
                </ConfigField>
              </>
            )}

            <ConfigField label="Min Velocity">
              <Input
                type="number"
                value={workspace.minMonthlyVelocity}
                onChange={e => onWorkspaceChange({ minMonthlyVelocity: Number(e.target.value) })}
                className="w-20 h-8 bg-zinc-800 border-zinc-700 text-sm"
              />
            </ConfigField>
          </div>
        </CardContent>
      </Card>

      {/* Filters + Actions */}
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
            onChange={e => {
              setUrgencyFilter(e.target.value);
              if (onClearUrgencyFilter) onClearUrgencyFilter();
            }}
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
          {selected.size > 0 && (
            <button
              onClick={() => onPushToPlanning(selectedItems)}
              className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded transition-colors"
            >
              <ArrowRight className="w-3 h-3" />
              Push {selected.size} to Planning
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 border-b border-zinc-800">
              <th className="px-3 py-2 text-left w-8">
                <button onClick={toggleAll} className="text-zinc-500 hover:text-zinc-300">
                  {selected.size === filtered.length && filtered.length > 0
                    ? <CheckSquare className="w-4 h-4" />
                    : <Square className="w-4 h-4" />}
                </button>
              </th>
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
              const isSelected = selected.has(item.sku);
              return (
                <tr
                  key={item.sku}
                  onClick={() => onViewDetail(item)}
                  className={`border-b border-zinc-800/50 hover:bg-zinc-800/50 cursor-pointer transition-colors ${isSelected ? "bg-orange-500/5" : ""}`}
                >
                  <td className="px-3 py-2">
                    <button
                      onClick={e => { e.stopPropagation(); toggleSelect(item.sku); }}
                      className="text-zinc-500 hover:text-zinc-300"
                    >
                      {isSelected
                        ? <CheckSquare className="w-4 h-4 text-orange-400" />
                        : <Square className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <Badge className={`${uc.bg} ${uc.text} ${uc.border} border text-[10px] px-1.5 py-0`}>
                      {URGENCY_LABELS[item.urgency]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-400">{item.sku}</td>
                  <td className="px-3 py-2">
                    <div className="text-zinc-200 text-sm">{item.product}</div>
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

function ConfigField({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}