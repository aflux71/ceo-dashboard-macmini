import React, { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, ClipboardList, Eye, Send, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { URGENCY_COLORS, URGENCY_LABELS, formatNumber, getCategories } from "@/components/demand/demandHelpers";
import { sortPlanItems } from "@/components/demand/demandEngine";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Read-only mirror of the Demand Planner's Full Plan table.
 * No selection, no push-to-planning, no config editing.
 */
const REQUEST_STATUS_LABEL = {
  pending: "Pending",
  material_check: "Material Check",
  approved: "Approved",
  in_production: "In Production",
};

export default function InventoryRequirementsTable({
  plan,
  plannerSKUs,
  requestedSKUs,
  workspace,
  onViewDetail,
  forecastMonths,
  onForecastMonthsChange,
}) {
  const [locallyRequested, setLocallyRequested] = useState(new Map());
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [urgencyFilter, setUrgencyFilter] = useState("All");
  const [sortBy, setSortBy] = useState("urgency");
  const [pushItem, setPushItem] = useState(null);
  const [pushQty, setPushQty] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(null);
  const [pushError, setPushError] = useState(null);
  const queryClient = useQueryClient();

  const openPush = (item) => {
    setPushItem(item);
    setPushQty(String(item.productionNeed > 0 ? item.productionNeed : ""));
    setPushError(null);
  };

  const closePush = () => {
    setPushItem(null);
    setPushQty("");
    setPushing(false);
    setPushError(null);
  };

  const submitPush = async () => {
    const qty = Number(pushQty);
    if (!pushItem || !qty || qty <= 0) return;
    setPushing(true);
    setPushError(null);
    try {
      const created = await base44.entities.ProductionRequest.create({
        sku: pushItem.sku,
        product_name: pushItem.product || pushItem.sku,
        quantity_needed: qty,
        status: "pending",
        urgency: "medium",
        source: "manual",
        requested_by: "Inventory Requirements",
      });
      console.log("ProductionRequest created:", created);
      queryClient.invalidateQueries({ queryKey: ["production_requests_pending"] });
      setLocallyRequested((prev) => {
        const next = new Map(prev);
        next.set(pushItem.sku, "pending");
        return next;
      });
      setPushSuccess(pushItem.sku);
      setTimeout(() => setPushSuccess(null), 3000);
      closePush();
    } catch (err) {
      console.error("Failed to create ProductionRequest:", err);
      setPushError(err?.message || "Failed to submit request. Please try again.");
    } finally {
      setPushing(false);
    }
  };

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

          {onForecastMonthsChange && (
            <select
              value={forecastMonths}
              onChange={e => onForecastMonthsChange(Number(e.target.value))}
              className="bg-zinc-900 border border-orange-500/40 text-zinc-300 text-sm rounded px-2 py-1.5 focus:border-orange-500 focus:outline-none"
              title="Forecast horizon"
            >
              {[1, 2, 3, 4, 5, 6].map(m => (
                <option key={m} value={m}>Forecast: {m} mo{m > 1 ? "s" : ""}</option>
              ))}
            </select>
          )}
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
              <th className="px-3 py-2 text-right text-zinc-500 font-medium text-xs uppercase w-32">Status</th>
              <th className="px-3 py-2 text-right text-zinc-500 font-medium text-xs uppercase w-28">Action</th>
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
                  {(() => {
                    const requestStatus = locallyRequested.get(item.sku) || requestedSKUs?.get?.(item.sku);
                    const onPlanner = plannerSKUs?.has?.(item.sku);
                    const inPipeline = !!requestStatus || onPlanner;
                    return (
                      <>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end">
                            {requestStatus ? (
                              <span
                                className="inline-flex items-center gap-1 h-7 px-2 text-xs font-medium rounded-md border text-amber-400 bg-amber-500/10 border-amber-500/30 whitespace-nowrap"
                                title={`Production Request — ${REQUEST_STATUS_LABEL[requestStatus] || requestStatus}`}
                              >
                                <Clock className="w-3 h-3" />
                                {REQUEST_STATUS_LABEL[requestStatus] || requestStatus}
                              </span>
                            ) : onPlanner ? (
                              <span
                                className="inline-flex items-center gap-1 h-7 px-2 text-xs font-medium rounded-md border text-blue-400 bg-blue-500/10 border-blue-500/30 whitespace-nowrap"
                                title="Already on Production Planner"
                              >
                                <ClipboardList className="w-3 h-3" />
                                Planner
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end">
                            <Button
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); openPush(item); }}
                              className={`h-7 px-2 text-xs border ${
                                inPipeline
                                  ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border-zinc-700"
                                  : "bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border-orange-500/30"
                              }`}
                              title={inPipeline ? "Already in pipeline — push again to add another request" : "Push to Production Request"}
                            >
                              {pushSuccess === item.sku ? (
                                <><CheckCircle2 className="w-3 h-3 mr-1" />Pushed</>
                              ) : inPipeline ? (
                                <><Send className="w-3 h-3 mr-1" />Re-push</>
                              ) : (
                                <><Send className="w-3 h-3 mr-1" />Push</>
                              )}
                            </Button>
                          </div>
                        </td>
                      </>
                    );
                  })()}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Push to Production Request dialog */}
      <Dialog open={!!pushItem} onOpenChange={(open) => !open && closePush()}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-100">
              <Send className="w-4 h-4 text-orange-400" />
              Push to Production Request
            </DialogTitle>
          </DialogHeader>
          {pushItem && (
            <div className="space-y-4">
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                <p className="text-sm font-medium text-zinc-100">{pushItem.product}</p>
                <p className="text-xs text-zinc-500 font-mono mt-0.5">{pushItem.sku}</p>
                <div className="flex gap-4 mt-2 text-xs text-zinc-400">
                  <span>On hand: <span className="text-zinc-200">{formatNumber(pushItem.onHand)}</span></span>
                  <span>Avg/Mo: <span className="text-zinc-200">{formatNumber(Math.round(pushItem.avgMonthly))}</span></span>
                  <span>Suggested Need: <span className="text-orange-400 font-semibold">{formatNumber(pushItem.productionNeed)}</span></span>
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400 uppercase tracking-wider">Quantity to Request</label>
                <Input
                  type="number"
                  min="1"
                  autoFocus
                  value={pushQty}
                  onChange={(e) => setPushQty(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitPush(); }}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-zinc-100"
                  placeholder="Enter quantity..."
                />
              </div>
              {pushError && (
                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{pushError}</span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closePush} className="bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700">
              Cancel
            </Button>
            <Button
              onClick={submitPush}
              disabled={!pushQty || Number(pushQty) <= 0 || pushing}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Send className="w-4 h-4 mr-2" />
              {pushing ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}