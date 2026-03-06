import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  Search, Printer, Loader2, FileText, CheckSquare, Square
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import Badge from "@/components/ui/Badge";

const PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  #recipe-print-area, #recipe-print-area * { visibility: visible !important; }
  #recipe-print-area {
    position: absolute !important; left: 0 !important; top: 0 !important;
    width: 100% !important; background: white !important; color: black !important;
    font-size: 11pt !important; line-height: 1.4 !important;
  }
  .recipe-sheet-page { page-break-after: always; padding: 0.5in !important; }
  .recipe-sheet-page:last-child { page-break-after: auto; }
  .no-print { display: none !important; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #333; padding: 6px 8px; text-align: left; font-size: 10pt; }
  th { background: #e5e5e5 !important; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1 { font-size: 16pt; margin-bottom: 4px; }
  h2 { font-size: 13pt; margin-top: 16px; margin-bottom: 6px; border-bottom: 2px solid #333; padding-bottom: 3px; }
}
`;

const cellStyle = { border: "1px solid #333", padding: "6px 8px" };
const headerStyle = { ...cellStyle, background: "#e5e5e5" };
const sectionTitle = { fontSize: "13pt", fontWeight: 700, borderBottom: "2px solid #333", paddingBottom: "3px", marginBottom: "6px", color: "#111" };
const checkBox = { display: "inline-block", width: "14px", height: "14px", border: "2px solid #333", verticalAlign: "middle" };
const signLine = { borderBottom: "1px solid #333", display: "inline-block", minWidth: "200px" };

function PrintableSheet({ recipe, customBatch, origBatch, scaleQty, scalePackaging, todayStr }) {
  return (
    <div className="recipe-sheet-page" style={{ color: "black", background: "white", padding: "24px", fontFamily: "Arial, Helvetica, sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: "3px solid #333", paddingBottom: "8px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: "18pt", fontWeight: 700, margin: 0, color: "#111" }}>{recipe.name}</h1>
            <div style={{ fontSize: "10pt", color: "#555", marginTop: "4px" }}>
              SKU: <strong>{recipe.sku}</strong>
              {recipe.category && <span> &nbsp;|&nbsp; {recipe.category}</span>}
              {recipe.version > 1 && <span> &nbsp;|&nbsp; v{recipe.version}</span>}
              {recipe.production_line && <span> &nbsp;|&nbsp; Line {recipe.production_line}</span>}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: "10pt", color: "#555" }}><div>Printed: {todayStr}</div></div>
        </div>
      </div>

      {/* Batch info */}
      <div style={{ display: "flex", gap: "24px", marginBottom: "16px", fontSize: "11pt" }}>
        <div><strong>Batch ID:</strong> <span style={{ ...signLine, minWidth: "180px" }}>&nbsp;</span></div>
        <div>
          <strong>Batch Size:</strong> {customBatch.toLocaleString()} units
          {customBatch !== origBatch && <span style={{ fontSize: "9pt", color: "#888" }}> (recipe default: {origBatch})</span>}
        </div>
        <div><strong>Date:</strong> <span style={{ ...signLine, minWidth: "120px" }}>&nbsp;</span></div>
      </div>

      {/* Ingredients */}
      {recipe.ingredients?.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <h2 style={sectionTitle}>Ingredients</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt" }}>
            <thead>
              <tr style={{ background: "#e5e5e5" }}>
                <th style={{ ...headerStyle, width: "5%" }}>#</th>
                <th style={{ ...headerStyle, width: "30%" }}>Material</th>
                <th style={{ ...headerStyle, width: "15%" }}>SKU</th>
                <th style={{ ...headerStyle, width: "15%", textAlign: "right" }}>Qty (per batch)</th>
                <th style={{ ...headerStyle, width: "10%" }}>Unit</th>
                <th style={{ ...headerStyle, width: "25%", textAlign: "center" }}>Weighed / Checked</th>
              </tr>
            </thead>
            <tbody>
              {recipe.ingredients.map((ing, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                  <td style={cellStyle}>{i + 1}</td>
                  <td style={{ ...cellStyle, fontWeight: 500 }}>{ing.material}</td>
                  <td style={{ ...cellStyle, fontFamily: "monospace", fontSize: "9pt" }}>{ing.sku || "—"}</td>
                  <td style={{ ...cellStyle, textAlign: "right", fontWeight: 600 }}>{scaleQty(ing.qty, origBatch, customBatch)}</td>
                  <td style={cellStyle}>{ing.unit}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}><span style={checkBox}></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Packaging */}
      {recipe.packaging?.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <h2 style={sectionTitle}>Packaging Requirements</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt" }}>
            <thead>
              <tr style={{ background: "#e5e5e5" }}>
                <th style={headerStyle}>Item</th>
                <th style={headerStyle}>SKU</th>
                <th style={{ ...headerStyle, textAlign: "right" }}>Per Unit</th>
                <th style={{ ...headerStyle, textAlign: "right" }}>Per Batch</th>
                <th style={{ ...headerStyle, textAlign: "center" }}>Checked</th>
              </tr>
            </thead>
            <tbody>
              {recipe.packaging.map((pkg, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                  <td style={{ ...cellStyle, fontWeight: 500 }}>{pkg.name}</td>
                  <td style={{ ...cellStyle, fontFamily: "monospace", fontSize: "9pt" }}>{pkg.sku || "—"}</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>{pkg.qty_per_unit || 1}</td>
                  <td style={{ ...cellStyle, textAlign: "right", fontWeight: 600 }}>{scalePackaging(pkg.qty_per_batch, origBatch, customBatch)}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}><span style={checkBox}></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Procedures */}
      {recipe.procedures?.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <h2 style={sectionTitle}>Production Procedures</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt" }}>
            <thead>
              <tr style={{ background: "#e5e5e5" }}>
                <th style={{ ...headerStyle, width: "6%" }}>Step</th>
                <th style={headerStyle}>Description</th>
                <th style={{ ...headerStyle, textAlign: "right", width: "10%" }}>Time</th>
                <th style={{ ...headerStyle, width: "20%" }}>Notes</th>
                <th style={{ ...headerStyle, textAlign: "center", width: "8%" }}>Done</th>
              </tr>
            </thead>
            <tbody>
              {recipe.procedures.map((proc, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                  <td style={{ ...cellStyle, fontWeight: 600 }}>{proc.step || i + 1}</td>
                  <td style={cellStyle}>{proc.description}</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>{proc.duration_minutes ? `${proc.duration_minutes} min` : "—"}</td>
                  <td style={{ ...cellStyle, fontSize: "9pt", color: "#555" }}>{proc.notes || ""}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}><span style={checkBox}></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* QC Checks */}
      {recipe.qc_checks?.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <h2 style={sectionTitle}>QC Checkpoints</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt" }}>
            <thead>
              <tr style={{ background: "#e5e5e5" }}>
                <th style={headerStyle}>Checkpoint</th>
                <th style={headerStyle}>Criteria</th>
                <th style={headerStyle}>Method</th>
                <th style={{ ...headerStyle, textAlign: "center", width: "10%" }}>Pass</th>
                <th style={{ ...headerStyle, textAlign: "center", width: "10%" }}>Fail</th>
              </tr>
            </thead>
            <tbody>
              {recipe.qc_checks.map((qc, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                  <td style={{ ...cellStyle, fontWeight: 500 }}>{qc.checkpoint}</td>
                  <td style={cellStyle}>{qc.criteria}</td>
                  <td style={cellStyle}>{qc.method || "—"}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}><span style={checkBox}></span></td>
                  <td style={{ ...cellStyle, textAlign: "center" }}><span style={checkBox}></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sign-off */}
      <div style={{ marginTop: "24px", borderTop: "2px solid #333", paddingTop: "16px" }}>
        <h2 style={{ fontSize: "13pt", fontWeight: 700, marginBottom: "12px", color: "#111" }}>Sign-off</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", fontSize: "10pt" }}>
          <div>
            <div style={{ marginBottom: "16px" }}><strong>Operator Name:</strong> <span style={signLine}>&nbsp;</span></div>
            <div><strong>Operator Signature:</strong> <span style={signLine}>&nbsp;</span></div>
          </div>
          <div>
            <div style={{ marginBottom: "16px" }}><strong>QC Name:</strong> <span style={signLine}>&nbsp;</span></div>
            <div><strong>QC Signature:</strong> <span style={signLine}>&nbsp;</span></div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "40px", marginTop: "16px", fontSize: "10pt" }}>
          <div><strong>Date:</strong> <span style={{ ...signLine, minWidth: "150px" }}>&nbsp;</span></div>
          <div><strong>Batch Number:</strong> <span style={{ ...signLine, minWidth: "180px" }}>&nbsp;</span></div>
        </div>
      </div>
    </div>
  );
}

export default function RecipeSheetsTab() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [printRecipes, setPrintRecipes] = useState(null);
  const [batchSizes, setBatchSizes] = useState({});

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ["planning_recipes"],
    queryFn: () => base44.entities.Recipe.list("-created_date", 500),
  });

  const activeRecipes = useMemo(() => recipes.filter((r) => r.active !== false), [recipes]);

  const filtered = useMemo(() => {
    if (!search.trim()) return activeRecipes;
    const q = search.toLowerCase();
    return activeRecipes.filter(
      (r) => r.name?.toLowerCase().includes(q) || r.sku?.toLowerCase().includes(q) || r.category?.toLowerCase().includes(q)
    );
  }, [activeRecipes, search]);

  const toggleSelect = (id) => {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  };

  const openPrint = (recipe) => {
    setBatchSizes((prev) => ({ ...prev, [recipe.id]: recipe.batch_size || 1 }));
    setPrintRecipes([recipe]);
  };

  const openBulkPrint = () => {
    const toPrint = filtered.filter((r) => selected.has(r.id));
    if (toPrint.length === 0) { toast.error("No recipes selected"); return; }
    const sizes = { ...batchSizes };
    toPrint.forEach((r) => { if (!sizes[r.id]) sizes[r.id] = r.batch_size || 1; });
    setBatchSizes(sizes);
    setPrintRecipes(toPrint);
  };

  const updateBatchSize = (recipeId, val) => {
    setBatchSizes((prev) => ({ ...prev, [recipeId]: Math.max(1, Number(val) || 1) }));
  };

  const scaleQty = (originalQty, recipeBatchSize, customBatchSize) => {
    if (!recipeBatchSize || !customBatchSize) return originalQty || 0;
    return Math.round(((originalQty || 0) * customBatchSize / recipeBatchSize) * 1000) / 1000;
  };

  const scalePackaging = (qtyPerBatch, recipeBatchSize, customBatchSize) => {
    if (!recipeBatchSize || !customBatchSize || !qtyPerBatch) return qtyPerBatch || 0;
    return Math.ceil((qtyPerBatch || 0) * customBatchSize / recipeBatchSize);
  };

  const todayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  useEffect(() => {
    const id = "recipe-print-styles";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = PRINT_STYLES;
      document.head.appendChild(style);
    }
    return () => { const el = document.getElementById(id); if (el) el.remove(); };
  }, []);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search recipes by name, SKU, or category…" className="pl-9 bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={toggleSelectAll} className="border-zinc-700 text-zinc-300 text-xs">
            {selected.size === filtered.length && filtered.length > 0 ? <CheckSquare className="w-3.5 h-3.5 mr-1.5 text-orange-400" /> : <Square className="w-3.5 h-3.5 mr-1.5" />}
            {selected.size === filtered.length && filtered.length > 0 ? "Deselect All" : "Select All"}
          </Button>
          {selected.size > 0 && (
            <Button size="sm" onClick={openBulkPrint} className="bg-red-600 hover:bg-red-700 text-white text-xs">
              <Printer className="w-3.5 h-3.5 mr-1.5" /> Print Selected ({selected.size})
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-zinc-500">{filtered.length} recipe{filtered.length !== 1 ? "s" : ""} found{search && ` matching "${search}"`}</p>

      {isLoading ? (
        <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-12 flex items-center justify-center"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /></CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-8 text-center"><FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2" /><p className="text-zinc-500 text-sm">No recipes found</p></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((recipe) => {
            const isSelected = selected.has(recipe.id);
            return (
              <Card key={recipe.id} className={`bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer ${isSelected ? "border-orange-500/40 bg-orange-500/5" : ""}`} onClick={() => toggleSelect(recipe.id)}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {isSelected ? <CheckSquare className="w-4 h-4 text-orange-400 shrink-0" /> : <Square className="w-4 h-4 text-zinc-600 shrink-0" />}
                        <h4 className="text-sm font-medium text-zinc-100 truncate">{recipe.name}</h4>
                      </div>
                      <div className="flex items-center gap-2 mt-1 ml-6">
                        <span className="text-xs font-mono text-zinc-500">{recipe.sku}</span>
                        {recipe.category && <Badge variant="zinc">{recipe.category}</Badge>}
                        {recipe.version > 1 && <span className="text-xs text-zinc-600">v{recipe.version}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 ml-6">
                    <div className="text-center p-1.5 rounded bg-zinc-800/50"><p className="text-xs text-zinc-500">Batch</p><p className="text-sm font-medium text-zinc-200">{recipe.batch_size || "—"}</p></div>
                    <div className="text-center p-1.5 rounded bg-zinc-800/50"><p className="text-xs text-zinc-500">Ingredients</p><p className="text-sm font-medium text-zinc-200">{recipe.ingredients?.length || 0}</p></div>
                    <div className="text-center p-1.5 rounded bg-zinc-800/50"><p className="text-xs text-zinc-500">Steps</p><p className="text-sm font-medium text-zinc-200">{recipe.procedures?.length || 0}</p></div>
                  </div>
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openPrint(recipe); }} className="w-full text-xs ml-0 border-red-500/30 text-red-400 hover:bg-red-500/10">
                    <Printer className="w-3 h-3 mr-1.5" /> Print Sheet
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Print Dialog */}
      <Dialog open={!!printRecipes} onOpenChange={(open) => { if (!open) setPrintRecipes(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-4xl max-h-[90vh] overflow-y-auto">
          {printRecipes && (
            <>
              <DialogHeader className="no-print">
                <DialogTitle>{printRecipes.length === 1 ? `Recipe Sheet — ${printRecipes[0].name}` : `Print ${printRecipes.length} Recipe Sheets`}</DialogTitle>
              </DialogHeader>
              <div className="no-print space-y-3 py-2 border-b border-zinc-800">
                <p className="text-xs text-zinc-500">Adjust batch sizes below. Ingredient quantities will scale automatically.</p>
                <div className="flex flex-wrap gap-3">
                  {printRecipes.map((r) => (
                    <div key={r.id} className="flex items-center gap-2">
                      <Label className="text-zinc-400 text-xs whitespace-nowrap">{printRecipes.length > 1 ? `${r.name}:` : "Batch Size:"}</Label>
                      <Input type="number" min={1} value={batchSizes[r.id] || r.batch_size || 1} onChange={(e) => updateBatchSize(r.id, e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm w-24" />
                      {(batchSizes[r.id] || r.batch_size) !== r.batch_size && <span className="text-xs text-amber-400">(default: {r.batch_size})</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div id="recipe-print-area">
                {printRecipes.map((recipe) => (
                  <PrintableSheet
                    key={recipe.id}
                    recipe={recipe}
                    customBatch={batchSizes[recipe.id] || recipe.batch_size || 1}
                    origBatch={recipe.batch_size || 1}
                    scaleQty={scaleQty}
                    scalePackaging={scalePackaging}
                    todayStr={todayStr}
                  />
                ))}
              </div>
              <DialogFooter className="no-print">
                <Button variant="outline" onClick={() => setPrintRecipes(null)} className="border-zinc-700">Close</Button>
                <Button onClick={() => window.print()} className="bg-red-600 hover:bg-red-700 text-white"><Printer className="w-4 h-4 mr-2" /> Print</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}