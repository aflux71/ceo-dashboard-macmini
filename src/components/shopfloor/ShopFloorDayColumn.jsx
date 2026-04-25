import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import {
  ArrowRight, ArrowLeft, MapPin, Package, User, Wrench, Clock,
  CheckCircle2, Loader2, ChevronDown, ChevronUp, Plus, Printer,
  FileText, Edit3, X, Check
} from "lucide-react";
import Badge from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const STAGE_CONFIG = {
  batching:     { label: "Batching",     variant: "blue",   bg: "bg-blue-500/10",   border: "border-blue-500/20",   text: "text-blue-400" },
  qc_hold:      { label: "QC Hold",      variant: "amber",  bg: "bg-amber-500/10",  border: "border-amber-500/20",  text: "text-amber-400" },
  filling:      { label: "Filling",      variant: "green",  bg: "bg-green-500/10",  border: "border-green-500/20",  text: "text-green-400" },
  review_queue: { label: "Review Queue", variant: "purple", bg: "bg-purple-500/10", border: "border-purple-500/20", text: "text-purple-400" },
  complete:     { label: "Complete",     variant: "default",bg: "bg-zinc-800/40",   border: "border-zinc-700/30",   text: "text-zinc-400" },
};

const TASK_TYPE_CONFIG = {
  cleaning:      { label: "Cleaning",      variant: "blue" },
  setup:         { label: "Setup",          variant: "orange" },
  maintenance:   { label: "Maintenance",    variant: "amber" },
  break:         { label: "Break",          variant: "default" },
  training:      { label: "Training",       variant: "purple" },
  administrative:{ label: "Administrative", variant: "cyan" },
  other:         { label: "Other",          variant: "default" },
};

function batchStage(b) {
  const s = b.status;
  if (s === "added_to_inventory") return "complete";
  if (s === "in_review") return "review_queue";
  if (s === "approved") return "filling";
  if (s === "pending_qc" || s === "on_hold") return "qc_hold";
  return "batching";
}

function parseBatchLine(b) {
  const l = b.production_line;
  if (l === 1) return "Line 1"; if (l === 2) return "Line 2";
  if (l === 3) return "Melter 1"; if (l === 4) return "Melter 2";
  return l ? `Line ${l}` : "—";
}

// ── Traveller Print Helper ───────────────────────────────────────────────────
function printTraveller(batch, recipe) {
  const ingredients = recipe?.ingredients || [];
  const packaging = recipe?.packaging || [];
  const procedures = recipe?.procedures || [];

  const html = `<!DOCTYPE html><html><head><title>Batch Traveller — ${batch.batch_id}</title>
  <style>
    @page { margin: 0.5in; size: letter; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 0; }
    h1 { font-size: 16px; margin: 0 0 4px; }
    h2 { font-size: 12px; margin: 12px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
    th { background: #f3f3f3; font-weight: bold; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
    .field { margin-bottom: 4px; }
    .label { font-weight: bold; font-size: 10px; color: #555; }
    .value { font-size: 12px; }
    .sign { border-top: 1px solid #999; width: 180px; margin-top: 30px; font-size: 10px; color: #666; }
  </style></head><body>
  <h1>Manufacturing Traveller</h1>
  <p style="color:#666;font-size:10px;margin:0 0 10px;">Batch ID: ${batch.batch_id} &nbsp;|&nbsp; Printed: ${new Date().toLocaleString()}</p>
  <div class="grid2">
    <div>
      <div class="field"><div class="label">Product</div><div class="value">${batch.product_name}</div></div>
      <div class="field"><div class="label">SKU</div><div class="value">${batch.sku}</div></div>
      <div class="field"><div class="label">Planned Qty</div><div class="value">${batch.quantity?.toLocaleString()} units</div></div>
    </div>
    <div>
      <div class="field"><div class="label">Operator</div><div class="value">${batch.operator || "—"}</div></div>
      <div class="field"><div class="label">Line</div><div class="value">${parseBatchLine(batch)}</div></div>
      <div class="field"><div class="label">Status</div><div class="value">${batch.status}</div></div>
    </div>
  </div>
  ${ingredients.length > 0 ? `<h2>Ingredients</h2>
  <table><thead><tr><th>Material</th><th>SKU</th><th>Qty</th><th>Unit</th><th>Actual Used</th><th>Initials</th></tr></thead>
  <tbody>${ingredients.map(i => `<tr><td>${i.material || ""}</td><td>${i.sku || ""}</td><td>${i.qty || ""}</td><td>${i.unit || ""}</td><td></td><td></td></tr>`).join("")}</tbody></table>` : ""}
  ${packaging.length > 0 ? `<h2>Packaging</h2>
  <table><thead><tr><th>Item</th><th>SKU</th><th>Qty/Unit</th><th>Total Qty</th><th>✓</th></tr></thead>
  <tbody>${packaging.map(p => `<tr><td>${p.name || ""}</td><td>${p.sku || ""}</td><td>${p.qty_per_unit || ""}</td><td>${(p.qty_per_unit || 0) * (batch.quantity || 0)}</td><td></td></tr>`).join("")}</tbody></table>` : ""}
  ${procedures.length > 0 ? `<h2>Procedures</h2>
  <table><thead><tr><th>#</th><th>Step</th><th>Duration</th><th>Done</th></tr></thead>
  <tbody>${procedures.map(p => `<tr><td>${p.step}</td><td>${p.description || ""}</td><td>${p.duration_minutes ? p.duration_minutes + " min" : ""}</td><td style="width:40px"></td></tr>`).join("")}</tbody></table>` : ""}
  <h2>Yield &amp; Sign-Off</h2>
  <div class="grid2">
    <div class="field"><div class="label">Actual Units Produced</div><div style="border-bottom:1px solid #999;height:24px;margin-top:4px"></div></div>
    <div class="field"><div class="label">Notes / Deviations</div><div style="border-bottom:1px solid #999;height:24px;margin-top:4px"></div></div>
  </div>
  <div class="grid2" style="margin-top:20px">
    <div class="sign">Operator Signature</div>
    <div class="sign">QC Approval</div>
  </div>
  </body></html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

// ── Qty Dialog ───────────────────────────────────────────────────────────────
function QtyDialog({ open, batch, onClose, onSave }) {
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setQty(batch?.actual_yield_units != null ? String(batch.actual_yield_units) : "");
      setNotes(batch?.deviation_notes || "");
    }
  }, [open, batch]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
        <DialogHeader>
          <DialogTitle>Log QTY Produced</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="text-sm text-zinc-400">
            <span className="text-zinc-200 font-medium">{batch?.product_name}</span>
            <span className="text-zinc-600 mx-2">·</span>
            <span className="font-mono text-zinc-500">{batch?.batch_id}</span>
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Planned: {batch?.quantity?.toLocaleString()} units</Label>
            <Input
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Actual units produced"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9"
              autoFocus
            />
            {qty && batch?.quantity && (
              <p className={`text-xs font-medium ${Number(qty) >= batch.quantity ? "text-green-400" : "text-amber-400"}`}>
                Yield: {Math.round((Number(qty) / batch.quantity) * 100)}%
                {Number(qty) < batch.quantity && ` (${(batch.quantity - Number(qty)).toLocaleString()} under)`}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Deviation / Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any deviations or notes..."
              className="bg-zinc-800 border-zinc-700 text-zinc-100 resize-none text-sm"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-zinc-700">Cancel</Button>
          <Button
            onClick={() => onSave({ actual_yield_units: Number(qty) || 0, deviation_notes: notes })}
            disabled={!qty}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Check className="w-4 h-4 mr-1" /> Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Traveller View/Edit Dialog ───────────────────────────────────────────────
function TravellerDialog({ open, batch, recipe, onClose, onSave }) {
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => {
    if (open && batch) {
      setForm({
        operator: batch.operator || "",
        notes: batch.notes || "",
        traveler_notes: batch.traveler_notes || "",
        actual_yield_units: batch.actual_yield_units ?? "",
        deviation_notes: batch.deviation_notes || "",
      });
      setEditMode(false);
    }
  }, [open, batch]);

  const ingredients = recipe?.ingredients || [];
  const packaging = recipe?.packaging || [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Batch Traveller — {batch?.batch_id}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => recipe !== undefined && printTraveller(batch, recipe)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
              <button
                onClick={() => setEditMode((e) => !e)}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md transition-colors ${editMode ? "bg-orange-500/20 text-orange-400" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"}`}
              >
                <Edit3 className="w-3.5 h-3.5" /> {editMode ? "Editing" : "Edit"}
              </button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ["Product", batch?.product_name],
              ["SKU", batch?.sku],
              ["Planned Qty", `${batch?.quantity?.toLocaleString()} units`],
              ["Line", parseBatchLine(batch || {})],
              ["Status", batch?.status],
              ["Batch Date", batch?.production_date ? new Date(batch.production_date).toLocaleDateString() : "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-xs text-zinc-500">{label}</div>
                <div className="text-zinc-200 font-medium">{value || "—"}</div>
              </div>
            ))}
          </div>

          {/* Operator (editable) */}
          <div className="space-y-1">
            <div className="text-xs text-zinc-500">Operator</div>
            {editMode ? (
              <Input value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm" />
            ) : (
              <div className="text-zinc-200">{batch?.operator || "—"}</div>
            )}
          </div>

          {/* Ingredients */}
          {ingredients.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Ingredients</div>
              <div className="rounded-lg border border-zinc-800 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-800/50">
                      <th className="text-left px-3 py-2 text-zinc-400">Material</th>
                      <th className="text-left px-3 py-2 text-zinc-400">SKU</th>
                      <th className="text-right px-3 py-2 text-zinc-400">Qty</th>
                      <th className="text-left px-3 py-2 text-zinc-400">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingredients.map((ing, i) => (
                      <tr key={i} className="border-b border-zinc-800/50">
                        <td className="px-3 py-1.5 text-zinc-200">{ing.material}</td>
                        <td className="px-3 py-1.5 font-mono text-zinc-500">{ing.sku}</td>
                        <td className="px-3 py-1.5 text-zinc-200 text-right">{ing.qty}</td>
                        <td className="px-3 py-1.5 text-zinc-500">{ing.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Packaging */}
          {packaging.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Packaging</div>
              <div className="rounded-lg border border-zinc-800 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-800/50">
                      <th className="text-left px-3 py-2 text-zinc-400">Item</th>
                      <th className="text-right px-3 py-2 text-zinc-400">Qty/Unit</th>
                      <th className="text-right px-3 py-2 text-zinc-400">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packaging.map((pkg, i) => (
                      <tr key={i} className="border-b border-zinc-800/50">
                        <td className="px-3 py-1.5 text-zinc-200">{pkg.name}</td>
                        <td className="px-3 py-1.5 text-zinc-300 text-right">{pkg.qty_per_unit}</td>
                        <td className="px-3 py-1.5 text-zinc-300 text-right">{(pkg.qty_per_unit || 0) * (batch?.quantity || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Yield & Notes (editable) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-xs text-zinc-500">Actual Units Produced</div>
              {editMode ? (
                <Input type="number" value={form.actual_yield_units}
                  onChange={(e) => setForm({ ...form, actual_yield_units: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm" />
              ) : (
                <div className={`font-medium ${batch?.actual_yield_units != null ? (batch.actual_yield_units >= batch.quantity ? "text-green-400" : "text-amber-400") : "text-zinc-600"}`}>
                  {batch?.actual_yield_units != null ? `${batch.actual_yield_units?.toLocaleString()} units` : "Not recorded"}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <div className="text-xs text-zinc-500">Deviation Notes</div>
              {editMode ? (
                <Input value={form.deviation_notes}
                  onChange={(e) => setForm({ ...form, deviation_notes: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm" />
              ) : (
                <div className="text-zinc-300 text-sm">{batch?.deviation_notes || "—"}</div>
              )}
            </div>
          </div>

          {/* Traveller notes (editable) */}
          <div className="space-y-1">
            <div className="text-xs text-zinc-500">Traveller Notes</div>
            {editMode ? (
              <Textarea value={form.traveler_notes}
                onChange={(e) => setForm({ ...form, traveler_notes: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 resize-none text-sm"
                rows={3} placeholder="Additional notes..." />
            ) : (
              <div className="text-zinc-300 text-sm">{batch?.traveler_notes || "—"}</div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-zinc-700">Close</Button>
          {editMode && (
            <Button onClick={() => onSave(form)} className="bg-orange-500 hover:bg-orange-600 text-white">
              <Check className="w-4 h-4 mr-1" /> Save Changes
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Batch Card ───────────────────────────────────────────────────────────────
function BatchCard({ batch, inventory, labels, dragHandleProps, draggableProps, innerRef }) {
  const [expanded, setExpanded] = useState(false);
  const [qtyDialog, setQtyDialog] = useState(false);
  const [travellerDialog, setTravellerDialog] = useState(false);
  const [recipe, setRecipe] = useState(undefined); // undefined = not loaded yet
  const queryClient = useQueryClient();

  const stage = batchStage(batch);
  const cfg = STAGE_CONFIG[stage] || STAGE_CONFIG.batching;
  const lineLabel = parseBatchLine(batch);

  const today = new Date().toISOString().split("T")[0];
  const batchDate = batch.production_date ? batch.production_date.split("T")[0] : null;
  const isOverdue = stage === "batching" && batchDate && batchDate < today;

  const ingredientBins = (batch._recipe?.ingredients || [])
    .map((ing) => {
      const inv = inventory.find((i) => i.sku?.toLowerCase() === ing.sku?.toLowerCase());
      return inv?.location ? { name: ing.material || ing.sku, bin: inv.location } : null;
    }).filter(Boolean);

  const labelBins = labels
    .filter((l) => l.product_sku === batch.sku && l.bin_location)
    .map((l) => ({ name: l.name, bin: l.bin_location }));

  const advanceMutation = useMutation({
    mutationFn: ({ id, newStatus, extra }) => base44.entities.Batch.update(id, { status: newStatus, ...extra }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["shopfloor_batches"] }); toast.success("Stage updated"); },
    onError: (err) => toast.error(`Failed: ${err?.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Batch.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["shopfloor_batches"] }); toast.success("Saved"); },
    onError: (err) => toast.error(`Failed: ${err?.message}`),
  });

  // Stage navigation
  const nextAction = () => {
    if (stage === "batching") return { label: "→ QC Hold", status: "pending_qc" };
    if (stage === "qc_hold") return { label: "→ Filling", status: "approved" };
    if (stage === "filling") return { label: "→ Review", status: "in_review" };
    return null;
  };
  const prevAction = () => {
    if (stage === "qc_hold") return { label: "← Batching", status: "started" };
    if (stage === "filling") return { label: "← QC Hold", status: "pending_qc" };
    if (stage === "review_queue") return { label: "← Filling", status: "approved" };
    return null;
  };

  const next = nextAction();
  const prev = prevAction();

  const loadRecipe = async () => {
    if (recipe !== undefined) return recipe;
    try {
      const results = await base44.entities.Recipe.filter({ sku: batch.sku });
      const r = results[0] || null;
      setRecipe(r);
      return r;
    } catch {
      setRecipe(null);
      return null;
    }
  };

  const handleOpenTraveller = async () => {
    await loadRecipe();
    setTravellerDialog(true);
  };

  return (
    <div ref={innerRef} {...draggableProps} className={`rounded-lg border ${cfg.border} ${isOverdue ? "border-red-500/40" : ""} bg-zinc-900 overflow-hidden`}>
      {/* Header — drag handle */}
      <div {...dragHandleProps} className={`px-3 py-2 ${cfg.bg} flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing`}>
        <span className={`text-xs font-mono truncate ${cfg.text}`}>{batch.batch_id}</span>
        <div className="flex items-center gap-1 shrink-0">
          {isOverdue && <Badge variant="red">Overdue</Badge>}
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2 space-y-2">
        <p className="text-sm font-medium text-zinc-100 leading-tight">{batch.product_name}</p>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <div className="flex items-center gap-1 text-zinc-500">
            <Package className="w-3 h-3" />
            <span className="text-zinc-300">{batch.quantity?.toLocaleString()} units</span>
          </div>
          <div className="text-zinc-500">{lineLabel}</div>
          <div className="flex items-center gap-1 text-zinc-500 col-span-2">
            <User className="w-3 h-3" />
            <span className="text-zinc-300">{batch.operator || "Unassigned"}</span>
          </div>
          {batch.actual_yield_units != null && (
            <div className="col-span-2 flex items-center gap-1 text-xs">
              <span className="text-zinc-500">Produced:</span>
              <span className={`font-medium ${batch.actual_yield_units >= batch.quantity ? "text-green-400" : "text-amber-400"}`}>
                {batch.actual_yield_units?.toLocaleString()} units
              </span>
            </div>
          )}
        </div>

        {/* Bin locations */}
        {(ingredientBins.length > 0 || labelBins.length > 0) && (
          <button onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-orange-400 transition-colors">
            <MapPin className="w-3 h-3" />
            Bin Locations
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
        {expanded && (
          <div className="space-y-1 pt-1 border-t border-zinc-800">
            {ingredientBins.map((b, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-zinc-500 truncate">{b.name}</span>
                <span className="text-orange-400 font-mono shrink-0 ml-2">{b.bin}</span>
              </div>
            ))}
            {labelBins.map((b, i) => (
              <div key={`lbl-${i}`} className="flex items-center justify-between text-xs">
                <span className="text-zinc-500 truncate">🏷 {b.name}</span>
                <span className="text-orange-400 font-mono shrink-0 ml-2">{b.bin}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-1.5 pt-1">
          {/* Forward + optional back */}
          <div className="flex gap-1">
            {prev && (
              <Button size="sm" variant="outline"
                onClick={() => advanceMutation.mutate({ id: batch.id, newStatus: prev.status })}
                disabled={advanceMutation.isPending}
                className="shrink-0 text-xs h-7 w-8 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300 text-zinc-500 px-0"
                title={prev.label}>
                <ArrowLeft className="w-3 h-3" />
              </Button>
            )}
            {next && stage !== "review_queue" && (
              <Button size="sm" variant="outline"
                onClick={() => advanceMutation.mutate({ id: batch.id, newStatus: next.status })}
                disabled={advanceMutation.isPending}
                className="flex-1 text-xs h-7 border-zinc-700 hover:border-orange-500/40 hover:text-orange-400 hover:bg-orange-500/5">
                {advanceMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                {next.label}
              </Button>
            )}
          </div>
          {/* QTY + Traveller */}
          <div className="flex gap-1">
            <Button size="sm" variant="ghost"
              onClick={() => setQtyDialog(true)}
              className="flex-1 text-xs h-7 text-zinc-400 hover:text-green-400 hover:bg-green-500/10 border border-zinc-800">
              <Plus className="w-3 h-3 mr-1" />Log QTY
            </Button>
            <Button size="sm" variant="ghost"
              onClick={handleOpenTraveller}
              className="flex-1 text-xs h-7 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 border border-zinc-800">
              <FileText className="w-3 h-3 mr-1" /> Traveller
            </Button>
          </div>
        </div>
      </div>

      {/* QTY Dialog */}
      <QtyDialog
        open={qtyDialog}
        batch={batch}
        onClose={() => setQtyDialog(false)}
        onSave={(data) => {
          updateMutation.mutate({ id: batch.id, data }, { onSuccess: () => setQtyDialog(false) });
        }}
      />

      {/* Traveller Dialog */}
      <TravellerDialog
        open={travellerDialog}
        batch={batch}
        recipe={recipe}
        onClose={() => setTravellerDialog(false)}
        onSave={(formData) => {
          const data = {
            operator: formData.operator,
            notes: formData.notes,
            traveler_notes: formData.traveler_notes,
            deviation_notes: formData.deviation_notes,
          };
          if (formData.actual_yield_units !== "") {
            data.actual_yield_units = Number(formData.actual_yield_units) || 0;
          }
          updateMutation.mutate({ id: batch.id, data }, { onSuccess: () => setTravellerDialog(false) });
        }}
      />
    </div>
  );
}

// ── Task Card ────────────────────────────────────────────────────────────────
function TaskCard({ task, onComplete }) {
  const tcfg = TASK_TYPE_CONFIG[task.task_type] || TASK_TYPE_CONFIG.other;
  const statusVariant = task.status === "completed" ? "green" : task.status === "in_progress" ? "blue" : "default";

  return (
    <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Wrench className="w-3 h-3 text-zinc-500" />
          <span className="text-xs font-medium text-zinc-300">{task.task_name}</span>
        </div>
        <Badge variant={tcfg.variant}>{tcfg.label}</Badge>
      </div>
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        {task.start_time && task.end_time && (
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{task.start_time}–{task.end_time}</span>
        )}
        {task.operator && (
          <span className="flex items-center gap-1"><User className="w-3 h-3" />{task.operator}</span>
        )}
      </div>
      <Badge variant={statusVariant}>{task.status}</Badge>
      {task.status !== "completed" && (
        <button onClick={() => onComplete(task)}
          className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors mt-1">
          <CheckCircle2 className="w-3 h-3" /> Mark Complete
        </button>
      )}
    </div>
  );
}

// ── Day Column ───────────────────────────────────────────────────────────────
export default function ShopFloorDayColumn({ date, dayLabel, isToday, batches, tasks, inventory, labels, onAddTask, onCompleteTask }) {
  return (
    <div className={`min-w-[260px] flex flex-col rounded-xl border ${isToday ? "border-orange-500/30 bg-orange-500/5" : "border-zinc-800 bg-zinc-900/30"}`}>
      <div className={`px-3 py-3 border-b ${isToday ? "border-orange-500/20" : "border-zinc-800"}`}>
        <div className={`text-sm font-bold ${isToday ? "text-orange-400" : "text-zinc-200"}`}>{dayLabel}</div>
        <div className="text-xs text-zinc-500 mt-0.5">
          {batches.length} batch{batches.length !== 1 ? "es" : ""} · {tasks.length} task{tasks.length !== 1 ? "s" : ""}
        </div>
        {isToday && <div className="text-xs text-orange-400/70 mt-0.5 font-medium">TODAY</div>}
      </div>

      <Droppable droppableId={date}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-280px)] transition-colors rounded-b-xl ${snapshot.isDraggingOver ? "bg-orange-500/5 border-orange-500/20" : ""}`}
          >
            {batches.map((batch, index) => (
              <Draggable key={batch.id} draggableId={batch.id} index={index}>
                {(dragProvided) => (
                  <BatchCard
                    batch={batch}
                    inventory={inventory}
                    labels={labels}
                    innerRef={dragProvided.innerRef}
                    draggableProps={dragProvided.draggableProps}
                    dragHandleProps={dragProvided.dragHandleProps}
                  />
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} onComplete={onCompleteTask} />
            ))}
            {batches.length === 0 && tasks.length === 0 && (
              <div className="text-center py-6 text-zinc-600 text-xs">No items</div>
            )}
            <button onClick={() => onAddTask(date)}
              className="w-full text-xs text-zinc-600 hover:text-zinc-400 border border-dashed border-zinc-800 hover:border-zinc-600 rounded-lg py-2 transition-colors">
              + Add Task
            </button>
          </div>
        )}
      </Droppable>
    </div>
  );
}