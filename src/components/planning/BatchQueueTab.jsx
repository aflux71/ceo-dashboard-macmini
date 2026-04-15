import React, { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  Factory, FlaskConical, Layers, CalendarDays, Package, Loader2,
  Check, X, AlertTriangle, ChevronDown, Calculator, Clock,
  FileText, Plus, Minus, ArrowLeft, Pencil, Trash2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/Badge";

function addDays(dateStr, days) { if (!dateStr) return ""; const d = new Date(dateStr); d.setDate(d.getDate() + days); return d.toISOString().split("T")[0]; }
function formatDate(dateStr) { if (!dateStr) return "—"; return new Date(dateStr + "T00:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }); }
const defaultSchedule = { batch_date: new Date().toISOString().split("T")[0], operator: "", production_line: "1", batch_size: "", qc_override: false, qc_date_override: "", qc_notes: "", fill_date: "", fill_operator: "", fill_line: "1" };
const urgencyConfig = { critical: { variant: "red", label: "Critical" }, soon: { variant: "amber", label: "Soon" }, ok: { variant: "green", label: "OK" } };
const emptyForm = { product_name: "", sku: "", quantity: "", reason: "", urgency: "ok" };

export default function BatchQueueTab() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState(null);
  const [schedules, setSchedules] = useState({});
  const [calcTarget, setCalcTarget] = useState({});
  const [bqEditDialogOpen, setBqEditDialogOpen] = useState(false);
  const [bqEditingId, setBqEditingId] = useState(null);
  const [bqEditForm, setBqEditForm] = useState(emptyForm);
  const [bqDeleteConfirmId, setBqDeleteConfirmId] = useState(null);

  const { data: bqForecasts = [], isLoading: loadingBqF } = useQuery({
    queryKey: ["planning_batch_queue_forecasts"],
    queryFn: () => base44.entities.ForecastSuggestion.filter({ status: "approved", production_type: "make" }, "-created_date"),
  });
  const { data: bqManual = [], isLoading: loadingBqM } = useQuery({
    queryKey: ["planning_batch_queue_manual"],
    queryFn: async () => {
      try { return await base44.entities.ProductionRequest.filter({ status: "approved", production_type: "make" }, "-created_date"); } catch { return []; }
    },
  });
  const { data: recipes = [] } = useQuery({ queryKey: ["planning_recipes"], queryFn: () => base44.entities.Recipe.list() });
  const { data: batches = [] } = useQuery({ queryKey: ["planning_batches"], queryFn: () => base44.entities.Batch.list("-created_date", 500) });
  const { data: skuAliases = [] } = useQuery({ queryKey: ["planning_sku_aliases"], queryFn: () => base44.entities.SKUAlias.filter({ status: "approved" }) });

  const scheduleForecastMutation = useMutation({
    mutationFn: async ({ item, batchData }) => { const batch = await base44.entities.Batch.create(batchData); await base44.entities.ForecastSuggestion.update(item.id, { status: "in_production", scheduled_batch_id: batch.id }); return batch; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["planning_batch_queue_forecasts"] }); queryClient.invalidateQueries({ queryKey: ["planning_batches"] }); toast.success("Batch scheduled"); },
    onError: () => toast.error("Failed to schedule batch"),
  });
  const scheduleManualMutation = useMutation({
    mutationFn: async ({ item, batchData }) => { const batch = await base44.entities.Batch.create(batchData); await base44.entities.ProductionRequest.update(item.id, { status: "in_production", batch_id: batch.id }); return batch; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["planning_batch_queue_manual"] }); queryClient.invalidateQueries({ queryKey: ["planning_batches"] }); toast.success("Batch scheduled"); },
    onError: () => toast.error("Failed to schedule batch"),
  });
  const bqUpdateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProductionRequest.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["planning_batch_queue_manual"] }); toast.success("Request updated"); setBqEditDialogOpen(false); setBqEditForm(emptyForm); setBqEditingId(null); },
    onError: (err) => toast.error(`Failed to update: ${err?.message || String(err)}`),
  });
  const bqDeleteMutation = useMutation({
    mutationFn: async (item) => { const rel = batches.filter((b) => b.sku === item.sku && b.product_name === item.product_name && ["pending", "draft"].includes(b.status)); await Promise.all(rel.map((b) => base44.entities.Batch.delete(b.id).catch(() => {}))); await base44.entities.ProductionRequest.delete(item.id); },
    onSuccess: () => { ["planning_batch_queue_manual","planning_batches","planning_production_requests"].forEach(k => queryClient.invalidateQueries({ queryKey: [k] })); toast.success("Request and batches deleted"); setBqDeleteConfirmId(null); },
    onError: (err) => toast.error(`Failed to delete: ${err?.message || String(err)}`),
  });

  const findRecipe = useCallback((sku) => {
    if (!sku) return null;
    // Direct match first
    const direct = recipes.find((r) => r.sku?.toLowerCase() === sku.toLowerCase() && r.active !== false);
    if (direct) return direct;
    // Fall back to primary SKU via alias
    const alias = skuAliases.find((a) => a.alias_sku?.toLowerCase() === sku.toLowerCase());
    if (alias?.primary_sku) return recipes.find((r) => r.sku?.toLowerCase() === alias.primary_sku.toLowerCase() && r.active !== false) || null;
    return null;
  }, [recipes, skuAliases]);
  const generateBatchId = useCallback((sku) => { const prefix = sku?.substring(0, 3)?.toUpperCase() || "BAT"; const date = new Date().toISOString().slice(2, 10).replace(/-/g, ""); return `${prefix}-${date}-${batches.filter((b) => b.batch_id?.startsWith(`${prefix}-${date}`)).length + 1}`; }, [batches]);

  const allItems = useMemo(() => {
    const forecast = bqForecasts.map((item) => ({ id: item.id, type: "forecast", sku: item.sku, product_name: item.product_name, quantity: item.order_qty || item.forecast_qty || item.suggested_qty || 0, urgency: item.urgency === "event" ? "soon" : item.urgency || "ok", source: "Forecast", _raw: item }));
    const manual = bqManual.map((item) => ({ id: item.id, type: "manual", sku: item.sku, product_name: item.product_name, quantity: item.quantity_needed || item.quantity || 0, urgency: item.urgency || "ok", source: "Manual", _raw: item }));
    return [...forecast, ...manual];
  }, [bqForecasts, bqManual]);

  const isLoading = loadingBqF || loadingBqM;

  const toggleExpand = (item) => {
    const key = `${item.type}-${item.id}`;
    if (expandedId === key) { setExpandedId(null); return; }
    setExpandedId(key);
    if (!schedules[key]) {
      const recipe = findRecipe(item.sku);
      const batchSize = recipe?.batch_size || item.quantity;
      const qcDays = recipe?.qc_hold_time_days || 3;
      const batchDate = new Date().toISOString().split("T")[0];
      const qcDate = addDays(batchDate, qcDays);
      const fillDate = addDays(qcDate, 1);
      setSchedules((prev) => ({ ...prev, [key]: { ...defaultSchedule, batch_date: batchDate, batch_size: String(batchSize), qc_date_override: "", fill_date: fillDate, _qcDays: qcDays, _recipeBatchSize: recipe?.batch_size || null } }));
    }
  };

  const updateSchedule = (key, field, value) => {
    setSchedules((prev) => {
      const current = prev[key] || { ...defaultSchedule };
      const updated = { ...current, [field]: value };
      if (field === "batch_date" && !updated.qc_override) { const qcDays = updated._qcDays || 3; updated.fill_date = addDays(addDays(value, qcDays), 1); }
      return { ...prev, [key]: updated };
    });
  };

  const getQcDate = (key) => { const sched = schedules[key]; if (!sched) return ""; if (sched.qc_override && sched.qc_date_override) return sched.qc_date_override; return addDays(sched.batch_date, sched._qcDays || 3); };

  const handleSchedule = (item) => {
    const key = `${item.type}-${item.id}`;
    const sched = schedules[key];
    if (!sched) return;
    if (!sched.batch_date || !sched.operator) { toast.error("Batch date and operator are required"); return; }
    const recipe = findRecipe(item.sku);
    const qcDate = getQcDate(key);
    const batchData = {
      batch_id: generateBatchId(item.sku), recipe_id: recipe?.id || "", sku: item.sku, product_name: item.product_name,
      quantity: Number(sched.batch_size) || item.quantity, production_line: Number(sched.production_line) || 1,
      operator: sched.operator, production_date: new Date(sched.batch_date).toISOString(), status: "pending",
      notes: [`QC hold date: ${qcDate}`, sched.qc_notes ? `QC notes: ${sched.qc_notes}` : "", `Fill date: ${sched.fill_date}`, sched.fill_operator ? `Fill operator: ${sched.fill_operator}` : "", sched.fill_line ? `Fill line: ${sched.fill_line}` : ""].filter(Boolean).join(" | "),
    };
    if (item.type === "forecast") scheduleForecastMutation.mutate({ item: item._raw, batchData });
    else scheduleManualMutation.mutate({ item: item._raw, batchData });
  };

  const getScaledIngredients = (item, targetUnits) => {
    const recipe = findRecipe(item.sku);
    if (!recipe || !targetUnits) return null;
    const multiplier = targetUnits / (recipe.batch_size || 1);
    return (recipe.ingredients || []).map((ing) => ({ name: ing.material || ing.sku, unit: ing.unit || "", qty: Math.round((ing.qty || 0) * multiplier * 100) / 100 }));
  };

  const isScheduling = scheduleForecastMutation.isPending || scheduleManualMutation.isPending;

  return (
    <div className="space-y-3">
      {isLoading ? (
        <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-12 flex items-center justify-center"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /></CardContent></Card>
      ) : allItems.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-12"><div className="flex flex-col items-center text-center"><div className="p-3 rounded-xl bg-zinc-800 mb-4"><Layers className="w-8 h-8 text-zinc-600" /></div><p className="text-zinc-400 text-sm">No approved batches in queue. Approve items from Material Check to begin scheduling.</p></div></CardContent></Card>
      ) : (
        allItems.map((item) => {
          const key = `${item.type}-${item.id}`;
          const urg = urgencyConfig[item.urgency] || urgencyConfig.ok;
          const isExpanded = expandedId === key;
          const sched = schedules[key] || defaultSchedule;
          const recipe = findRecipe(item.sku);
          const qcDate = getQcDate(key);
          const calcKey = key;
          const calcUnits = calcTarget[calcKey] || "";
          const scaledIngredients = getScaledIngredients(item, Number(calcUnits));

          return (
            <Card key={key} className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-0">
                <div className="flex items-center p-4">
                  <button onClick={() => toggleExpand(item)} className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-zinc-500">{item.sku}</span>
                      <Badge variant={urg.variant}>{urg.label}</Badge>
                      <Badge variant={item.type === "forecast" ? "blue" : "purple"}>{item.source}</Badge>
                    </div>
                    <span className="text-sm font-medium text-zinc-100 truncate">{item.product_name}</span>
                    <span className="text-xs text-zinc-500 shrink-0">{item.quantity?.toLocaleString()} units</span>
                  </button>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {item.type === "manual" && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => { setBqEditingId(item.id); setBqEditForm({ product_name: item.product_name || "", sku: item.sku || "", quantity: String(item.quantity || ""), reason: item._raw?.reason || "", urgency: item.urgency || "ok" }); setBqEditDialogOpen(true); }} className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setBqDeleteConfirmId(item)} className="h-8 w-8 p-0 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </>
                    )}
                    <button onClick={() => toggleExpand(item)}><ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} /></button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-5 space-y-5 border-t border-zinc-800">
                    {recipe ? (
                      <div className="flex items-center gap-2 mt-4 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs">
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        Recipe: {recipe.name} — batch size {recipe.batch_size || "N/A"}
                        {recipe.batch_size && <span className="text-zinc-500 ml-1">({Math.ceil(item.quantity / recipe.batch_size)} batch{Math.ceil(item.quantity / recipe.batch_size) !== 1 ? "es" : ""} needed)</span>}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-4 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />No recipe found — enter batch size manually.
                      </div>
                    )}

                    <div>
                      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Factory className="w-3.5 h-3.5" />Batching</h4>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1.5"><Label className="text-zinc-400 text-xs">Batch Date *</Label><Input type="date" value={sched.batch_date} onChange={(e) => updateSchedule(key, "batch_date", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm" /></div>
                        <div className="space-y-1.5"><Label className="text-zinc-400 text-xs">Operator *</Label><Input placeholder="Operator name" value={sched.operator} onChange={(e) => updateSchedule(key, "operator", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm" /></div>
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Production Line</Label>
                          <Select value={sched.production_line} onValueChange={(val) => updateSchedule(key, "production_line", val)}>
                            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="1">Line 1</SelectItem><SelectItem value="2">Line 2</SelectItem><SelectItem value="3">Melter 1</SelectItem><SelectItem value="4">Melter 2</SelectItem></SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Batch Size{sched._recipeBatchSize && <span className="text-zinc-600 ml-1">(recipe: {sched._recipeBatchSize})</span>}</Label>
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="icon" className="h-9 w-9 border-zinc-700 shrink-0" onClick={() => updateSchedule(key, "batch_size", String(Math.max(1, (Number(sched.batch_size) || 0) - (sched._recipeBatchSize || 10))))}><Minus className="w-3 h-3" /></Button>
                            <Input type="number" value={sched.batch_size} onChange={(e) => updateSchedule(key, "batch_size", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm text-center" />
                            <Button variant="outline" size="icon" className="h-9 w-9 border-zinc-700 shrink-0" onClick={() => updateSchedule(key, "batch_size", String((Number(sched.batch_size) || 0) + (sched._recipeBatchSize || 10)))}><Plus className="w-3 h-3" /></Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />QC Hold</h4>
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">QC Date <span className="text-zinc-600">(batch + {sched._qcDays || 3}d)</span></Label>
                          <div className="flex items-center gap-2">
                            <Input type="date" value={sched.qc_override ? sched.qc_date_override : qcDate} disabled={!sched.qc_override} onChange={(e) => updateSchedule(key, "qc_date_override", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm disabled:opacity-60" />
                            <Button variant="ghost" size="sm" onClick={() => { const willOverride = !sched.qc_override; updateSchedule(key, "qc_override", willOverride); if (willOverride) updateSchedule(key, "qc_date_override", qcDate); }} className={`text-xs shrink-0 ${sched.qc_override ? "text-orange-400" : "text-zinc-500"}`}>{sched.qc_override ? "Auto" : "Override"}</Button>
                          </div>
                        </div>
                        <div className="space-y-1.5 lg:col-span-2"><Label className="text-zinc-400 text-xs">QC Notes</Label><Input placeholder="QC hold notes..." value={sched.qc_notes} onChange={(e) => updateSchedule(key, "qc_notes", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm" /></div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Package className="w-3.5 h-3.5" />Filling</h4>
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        <div className="space-y-1.5"><Label className="text-zinc-400 text-xs">Fill Date <span className="text-zinc-600">(after QC)</span></Label><Input type="date" value={sched.fill_date} min={qcDate} onChange={(e) => updateSchedule(key, "fill_date", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm" /></div>
                        <div className="space-y-1.5"><Label className="text-zinc-400 text-xs">Fill Operator</Label><Input placeholder="Operator name" value={sched.fill_operator} onChange={(e) => updateSchedule(key, "fill_operator", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm" /></div>
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Fill Line</Label>
                          <Select value={sched.fill_line} onValueChange={(val) => updateSchedule(key, "fill_line", val)}>
                            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="1">Fill Line 1</SelectItem><SelectItem value="2">Fill Line 2</SelectItem></SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 text-xs text-zinc-400">
                      <CalendarDays className="w-4 h-4 text-zinc-500 shrink-0" />
                      <span>Batch <span className="text-zinc-200">{formatDate(sched.batch_date)}</span><span className="text-zinc-600 mx-2">→</span>QC Hold <span className="text-zinc-200">{formatDate(qcDate)}</span><span className="text-zinc-600 mx-2">→</span>Fill <span className="text-zinc-200">{formatDate(sched.fill_date)}</span></span>
                    </div>

                    {recipe && (
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Calculator className="w-3.5 h-3.5" />Batch Size Calculator</h4>
                        <div className="rounded-lg border border-zinc-800 p-3 space-y-3">
                          <div className="flex items-center gap-2">
                            <Label className="text-zinc-400 text-xs shrink-0">Target units:</Label>
                            <Input type="number" placeholder={String(item.quantity)} value={calcUnits} onChange={(e) => setCalcTarget((prev) => ({ ...prev, [calcKey]: e.target.value }))} className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm w-32" />
                            {calcUnits && recipe.batch_size && <span className="text-xs text-zinc-500">= {(Number(calcUnits) / recipe.batch_size).toFixed(1)} batches</span>}
                          </div>
                          {scaledIngredients && scaledIngredients.length > 0 && (
                            <div className="rounded-lg border border-zinc-800 overflow-hidden">
                              <Table>
                                <TableHeader><TableRow className="border-zinc-800 hover:bg-transparent"><TableHead className="text-zinc-500 text-xs">Ingredient</TableHead><TableHead className="text-zinc-500 text-xs text-right">Scaled Qty</TableHead></TableRow></TableHeader>
                                <TableBody>{scaledIngredients.map((ing, i) => (<TableRow key={i} className="border-zinc-800"><TableCell className="text-sm text-zinc-200 py-1.5">{ing.name}</TableCell><TableCell className="text-sm text-zinc-300 text-right font-mono py-1.5">{ing.qty.toLocaleString()} {ing.unit}</TableCell></TableRow>))}</TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <Button onClick={() => handleSchedule(item)} disabled={isScheduling} className="bg-blue-600 hover:bg-blue-700 text-white">
                        {isScheduling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CalendarDays className="w-4 h-4 mr-2" />}Schedule Batch
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setExpandedId(null)} className="text-zinc-500 hover:text-zinc-300">Collapse</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      <Dialog open={bqEditDialogOpen} onOpenChange={(open) => { if (!open) { setBqEditDialogOpen(false); setBqEditForm(emptyForm); setBqEditingId(null); } }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader><DialogTitle>Edit Production Request</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-zinc-400">Product Name *</Label><Input value={bqEditForm.product_name} onChange={(e) => setBqEditForm({ ...bqEditForm, product_name: e.target.value })} className="bg-zinc-800 border-zinc-700 text-zinc-100" /></div>
              <div className="space-y-2"><Label className="text-zinc-400">SKU *</Label><Input value={bqEditForm.sku} onChange={(e) => setBqEditForm({ ...bqEditForm, sku: e.target.value })} className="bg-zinc-800 border-zinc-700 text-zinc-100" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-zinc-400">Quantity *</Label><Input type="number" value={bqEditForm.quantity} onChange={(e) => setBqEditForm({ ...bqEditForm, quantity: e.target.value })} className="bg-zinc-800 border-zinc-700 text-zinc-100" /></div>
              <div className="space-y-2"><Label className="text-zinc-400">Urgency</Label><Select value={bqEditForm.urgency} onValueChange={(val) => setBqEditForm({ ...bqEditForm, urgency: val })}><SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="critical">Critical</SelectItem><SelectItem value="soon">Soon</SelectItem><SelectItem value="ok">OK</SelectItem></SelectContent></Select></div>
            </div>
            <div className="space-y-2"><Label className="text-zinc-400">Reason</Label><Textarea value={bqEditForm.reason} onChange={(e) => setBqEditForm({ ...bqEditForm, reason: e.target.value })} className="bg-zinc-800 border-zinc-700 text-zinc-100 resize-none" rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBqEditDialogOpen(false); setBqEditForm(emptyForm); setBqEditingId(null); }} className="border-zinc-700">Cancel</Button>
            <Button onClick={() => { if (!bqEditForm.product_name || !bqEditForm.sku || !bqEditForm.quantity) { toast.error("Required fields missing"); return; } bqUpdateMutation.mutate({ id: bqEditingId, data: { product_name: bqEditForm.product_name, sku: bqEditForm.sku, quantity_needed: Number(bqEditForm.quantity), reason: bqEditForm.reason, urgency: bqEditForm.urgency } }); }} disabled={bqUpdateMutation.isPending} className="bg-orange-500 hover:bg-orange-600 text-white">
              {bqUpdateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bqDeleteConfirmId} onOpenChange={(open) => { if (!open) setBqDeleteConfirmId(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
          <DialogHeader><DialogTitle>Delete Request & Batches</DialogTitle></DialogHeader>
          <p className="text-sm text-zinc-400 py-2">This will delete the production request and any associated pending/draft batch entities.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBqDeleteConfirmId(null)} className="border-zinc-700">Cancel</Button>
            <Button onClick={() => bqDeleteMutation.mutate(bqDeleteConfirmId)} disabled={bqDeleteMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
              {bqDeleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}Delete All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}