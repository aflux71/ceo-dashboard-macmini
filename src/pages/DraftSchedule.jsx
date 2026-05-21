import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, ShoppingCart, AlertOctagon, CheckCircle2, ListChecks, Printer, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";

const PRIORITY_STYLE = {
  critical: "bg-red-500/20 text-red-300 border-red-500/40",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  medium: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  low: "bg-zinc-700 text-zinc-300 border-zinc-600",
};

const BOM_STYLE = {
  can_make: "bg-green-500/20 text-green-300 border-green-500/40",
  partial: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  blocked: "bg-red-500/20 text-red-300 border-red-500/40",
  data_gap: "bg-zinc-700 text-zinc-300 border-zinc-600",
};

export default function DraftSchedulePage() {
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (!id) {
      setError("No draft schedule ID provided");
      setLoading(false);
      return;
    }
    base44.entities.DraftSchedule.filter({ id })
      .then((rows) => {
        if (!rows || rows.length === 0) {
          setError("Draft schedule not found");
        } else {
          setDraft(rows[0]);
        }
      })
      .catch((e) => setError(e.message || "Failed to load draft schedule"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <AlertOctagon className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h2 className="text-xl font-semibold text-zinc-100 mb-2">Unable to load draft schedule</h2>
        <p className="text-zinc-400 mb-6">{error || "Unknown error"}</p>
        <Link to="/AIAssistant">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to AI Assistant
          </Button>
        </Link>
      </div>
    );
  }

  const scheduled = draft.scheduled_items || [];
  const purchases = draft.purchase_recommendations || [];
  const blocked = draft.blocked_items || [];
  const actions = draft.action_list || [];

  // Group purchases by supplier
  const purchasesBySupplier = purchases.reduce((acc, p) => {
    const k = p.supplier || "Unknown Supplier";
    if (!acc[k]) acc[k] = [];
    acc[k].push(p);
    return acc;
  }, {});

  // Group scheduled by date
  const scheduledByDate = scheduled.reduce((acc, s) => {
    const k = s.scheduled_date || `Day +${s.day_offset || 0}`;
    if (!acc[k]) acc[k] = [];
    acc[k].push(s);
    return acc;
  }, {});

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30">
              AI Draft Schedule
            </Badge>
            <Badge variant="outline" className={
              draft.status === "approved" ? "bg-green-500/10 text-green-400 border-green-500/30"
              : draft.status === "rejected" ? "bg-red-500/10 text-red-400 border-red-500/30"
              : "bg-zinc-700 text-zinc-300"
            }>
              {draft.status?.toUpperCase()}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">{draft.title}</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Generated {draft.generated_at ? format(new Date(draft.generated_at), "PPp") : "—"}
            {draft.generated_by ? ` by ${draft.generated_by}` : ""}
            {" · "}Horizon: {draft.horizon_days || 10} business days
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
          <Link to="/AIAssistant">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Assistant
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary */}
      {draft.summary && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-zinc-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-orange-400" /> Executive Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{draft.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox label="Scheduled Runs" value={scheduled.length} color="text-green-400" />
        <StatBox label="Materials to Order" value={purchases.length} color="text-orange-400" />
        <StatBox label="Blocked SKUs" value={blocked.length} color="text-red-400" />
        <StatBox label="Action Items" value={actions.length} color="text-blue-400" />
      </div>

      {/* Action List */}
      {actions.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-zinc-200 flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-blue-400" /> Action List
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {actions.map((a, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="text-zinc-500 font-mono w-6 shrink-0">{a.step || i + 1}.</span>
                  <div className="flex-1">
                    <div className="text-zinc-200">{a.action}</div>
                    <div className="text-xs text-zinc-500 mt-0.5 flex gap-3 flex-wrap">
                      {a.owner && <span>Owner: {a.owner}</span>}
                      {a.due && <span>Due: {a.due}</span>}
                      {a.category && <span className="capitalize">{a.category.replace("_", " ")}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Production Schedule */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-zinc-200 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-green-400" /> Production Schedule (BOM-Verified)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {scheduled.length === 0 ? (
            <p className="text-sm text-zinc-500">No production runs scheduled.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(scheduledByDate).map(([date, items]) => (
                <div key={date}>
                  <div className="text-xs font-semibold text-zinc-400 uppercase mb-2">{date}</div>
                  <div className="space-y-2">
                    {items.map((item, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-zinc-100">{item.product_name}</span>
                            <span className="text-xs text-zinc-500 font-mono">{item.sku}</span>
                            {item.priority && (
                              <Badge variant="outline" className={PRIORITY_STYLE[item.priority] || PRIORITY_STYLE.low}>
                                {item.priority.toUpperCase()}
                              </Badge>
                            )}
                            {item.bom_status && (
                              <Badge variant="outline" className={BOM_STYLE[item.bom_status] || BOM_STYLE.data_gap}>
                                {item.bom_status === "can_make" ? "✅ BOM OK" : item.bom_status === "partial" ? "⚠️ PARTIAL" : item.bom_status === "blocked" ? "❌ BLOCKED" : "DATA GAP"}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-zinc-400 mt-1 flex gap-3 flex-wrap">
                            {item.production_line && <span>Line: {item.production_line}</span>}
                            {item.batches != null && <span>{item.batches} batch{item.batches !== 1 ? "es" : ""} × {item.batch_size || "?"} = {item.total_units || "?"} units</span>}
                            {item.estimated_run_hours != null && <span>~{item.estimated_run_hours}h run</span>}
                            {item.ship_ready_date && <span>Ship-ready: {item.ship_ready_date}</span>}
                          </div>
                          {item.notes && <p className="text-xs text-zinc-500 mt-1 italic">{item.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Purchase Orders */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-zinc-200 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-orange-400" /> Raw Material Order Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {purchases.length === 0 ? (
            <p className="text-sm text-zinc-500">No purchase orders recommended — materials sufficient.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(purchasesBySupplier).map(([supplier, items]) => (
                <div key={supplier}>
                  <div className="text-xs font-semibold text-zinc-400 uppercase mb-2">{supplier}</div>
                  <div className="space-y-2">
                    {items.map((p, i) => (
                      <div key={i} className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-medium text-zinc-100">{p.material_name}</span>
                          {p.material_sku && <span className="text-xs text-zinc-500 font-mono">{p.material_sku}</span>}
                          <Badge variant="outline" className={p.priority === "rush" ? "bg-red-500/20 text-red-300 border-red-500/40" : "bg-amber-500/20 text-amber-300 border-amber-500/40"}>
                            {p.priority === "rush" ? "🔴 RUSH" : "🟡 STANDARD"}
                          </Badge>
                          {p.lead_time_days != null && <span className="text-xs text-zinc-400">Lead: {p.lead_time_days}d</span>}
                        </div>
                        <div className="text-sm text-zinc-300">
                          Order <span className="font-semibold text-orange-400">{p.shortfall_qty} {p.unit || ""}</span>
                          {p.on_hand != null && p.needed != null && (
                            <span className="text-xs text-zinc-500 ml-2">(need {p.needed}, on hand {p.on_hand})</span>
                          )}
                        </div>
                        {p.math && <p className="text-xs text-zinc-500 mt-1 font-mono">{p.math}</p>}
                        {p.blocks_skus && p.blocks_skus.length > 0 && (
                          <p className="text-xs text-zinc-400 mt-1">Blocks: {p.blocks_skus.join(", ")}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Blocked Items */}
      {blocked.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-zinc-200 flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-red-400" /> Blocked — Awaiting Materials
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {blocked.map((b, i) => (
                <div key={i} className="p-3 bg-zinc-800/50 rounded-lg border border-red-500/20">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-zinc-100">{b.product_name}</span>
                    <span className="text-xs text-zinc-500 font-mono">{b.sku}</span>
                    {b.eta && <Badge variant="outline" className="bg-zinc-700 text-zinc-300">ETA: {b.eta}</Badge>}
                  </div>
                  <p className="text-sm text-zinc-400 mt-1">{b.reason}</p>
                  {b.missing_materials && b.missing_materials.length > 0 && (
                    <p className="text-xs text-zinc-500 mt-1">Missing: {b.missing_materials.join(", ")}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="text-xs text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}