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
import { generateQRDataURL } from "@/components/scanner/qrCodeUtils";
import LotConsumptionDialog from "@/components/production/LotConsumptionDialog";

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

// ── Traveller Print Helper (Bubble Factory format) ─────────────────────────
async function printTraveller(batch, recipe) {
  const ingredients = recipe?.ingredients || [];
  const packaging = recipe?.packaging || [];

  const qrData = await generateQRDataURL(batch.batch_id);
  const fmtDate = (d) => d ? new Date(d.includes?.("T") ? d : d + "T00:00:00").toLocaleDateString("en-CA") : "";
  const productCode = batch.product_code || "";
  const lineLabel = parseBatchLine(batch);

  const sectionBar = (num, title) => `
    <div class="section-bar"><span class="sec-num">${num}.</span> ${title}</div>`;

  const fieldLine = (label, value, width = "auto") => `
    <span class="field-line" style="${width !== "auto" ? `min-width:${width};` : ""}">
      <span class="field-label">${label}</span>
      <span class="field-value">${value || ""}</span>
    </span>`;

  const checkbox = (label) => `<span class="checkbox-row"><span class="cb"></span> ${label}</span>`;

  const html = `<!DOCTYPE html><html><head><title>Manufacturing Traveller — ${batch.batch_id}</title>
  <style>
    @page { margin: 0.4in; size: letter; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5px; color: #111; margin: 0; line-height: 1.4; }

    /* Brand header */
    .brand-header {
      background: #1e3a5f; color: #fff; padding: 14px 16px;
      display: flex; justify-content: space-between; align-items: center;
      border: 1px solid #1e3a5f;
    }
    .brand-name { font-size: 22px; font-weight: 900; letter-spacing: 0.5px; }
    .brand-sub { font-size: 10px; opacity: 0.85; margin-top: 2px; }
    .brand-center { font-size: 16px; font-weight: bold; text-align: center; flex: 1; }
    .brand-right { font-size: 10px; text-align: right; line-height: 1.5; }

    /* Section bars */
    .section-bar {
      background: #1e3a5f; color: #fff; font-size: 11px; font-weight: bold;
      padding: 5px 10px; letter-spacing: 0.3px; margin-top: 8px;
    }
    .section-bar .sec-num { font-weight: 900; margin-right: 4px; }
    .section-body {
      border: 1px solid #1e3a5f; border-top: 0; padding: 10px 12px;
    }

    /* Fields */
    .field-line {
      display: inline-block; margin-right: 18px; margin-bottom: 6px;
      white-space: nowrap;
    }
    .field-label { font-weight: bold; font-size: 10px; margin-right: 4px; }
    .field-value {
      display: inline-block; min-width: 130px;
      border-bottom: 1px solid #555; padding: 0 4px 1px;
      font-size: 11px;
    }
    .field-block { margin-bottom: 4px; }

    /* Checkboxes */
    .checkbox-row {
      display: inline-flex; align-items: center; gap: 6px;
      margin-right: 22px; margin-bottom: 6px; font-size: 10.5px;
    }
    .cb {
      display: inline-block; width: 11px; height: 11px;
      border: 1.5px solid #333; vertical-align: middle;
    }

    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }

    /* Tables */
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; }
    th { background: #e6ebf2; font-weight: bold; }

    /* Product codes line */
    .codes {
      font-size: 9.5px; color: #333; margin-bottom: 8px;
      font-style: italic;
    }

    /* QR */
    .qr-block { display: flex; align-items: flex-start; gap: 10px; }
    .qr-block img { width: 70px; height: 70px; }

    /* Label affix */
    .label-box {
      border: 2px dashed #999; min-height: 90px;
      display: flex; align-items: center; justify-content: center;
      color: #999; font-style: italic; font-size: 10px;
    }

    /* Office use */
    .office-box {
      background: #eaf0f9; border: 1px solid #1e3a5f;
      padding: 8px 10px; margin-top: 8px;
    }
    .office-title {
      font-size: 10px; font-weight: bold; color: #1e3a5f;
      letter-spacing: 0.5px; margin-bottom: 6px;
    }

    .notes-area { min-height: 60px; }

    .pass-fail { display: inline-flex; gap: 14px; align-items: center; margin-left: 8px; }
  </style></head><body>

  <!-- ═══ HEADER ═══ -->
  <div class="brand-header">
    <div>
      <div class="brand-name">BUBBLE FACTORY</div>
      <div class="brand-sub">Manufacturing Traveller</div>
    </div>
    <div class="brand-center">High Priority Document</div>
    <div class="brand-right">
      Form: BF-TRV-001<br/>
      Rev: 1.0
    </div>
  </div>

  <!-- ═══ I. BATCH IDENTIFICATION & PREP ═══ -->
  ${sectionBar("I", "BATCH IDENTIFICATION &amp; PREP")}
  <div class="section-body">
    <div class="codes">
      PRODUCT CODES: LS = Liquid Soap | FS = Face Serum | RO = Roll-on | BB = Bath Bomb | SB = Shampoo Bar | EO = Essential Oil
    </div>
    <div class="field-block" style="margin-bottom:6px;"><b>Format:</b> [PROD]-[Julian Date]-[QC]</div>

    <div class="qr-block">
      <div style="flex:1;">
        ${fieldLine("Batch ID:", batch.batch_id, "150px")}
        ${fieldLine("Date:", fmtDate(batch.production_date), "130px")}
        ${fieldLine("Product Code:", productCode, "100px")}
        <br/>
        ${fieldLine("Product Name:", batch.product_name, "200px")}
        ${fieldLine("Batch Prepped By:", batch.batch_prepped_by || batch.operator || "", "150px")}
        <br/>
        ${fieldLine("Total Theoretical Volume/Weight:", batch.total_theoretical_volume_weight || "", "200px")}
      </div>
      ${qrData ? `<div style="text-align:center;"><img src="${qrData}" alt="QR"/><div style="font-size:8px;font-family:monospace;color:#555;margin-top:2px;">${batch.batch_id}</div></div>` : ""}
    </div>
  </div>

  <!-- ═══ II. SANITIZATION REPORT ═══ -->
  ${sectionBar("II", "SANITIZATION REPORT — FILL STAGE")}
  <div class="section-body">
    <div class="two-col">
      <div>
        ${checkbox("Filling Vessel cleaned &amp; sanitized")}<br/>
        ${checkbox("Filling Equipment/Pumps flushed")}<br/>
        ${checkbox("Utensils/Scales wiped (70% IPA)")}
      </div>
      <div>
        ${checkbox("Work surface cleared &amp; sanitized")}<br/>
        ${checkbox("Operator hands/gloves sanitized")}
      </div>
    </div>
    <div style="margin-top:6px;">
      ${fieldLine("Verified By:", batch.sanitization_verified_by || "", "150px")}
      ${fieldLine("Time:", batch.sanitization_time || "", "120px")}
      ${fieldLine("Sanitizer Used:", batch.sanitizer_used || "", "150px")}
    </div>
  </div>

  <!-- ═══ III. QUALITY CONTROL (QC) ═══ -->
  ${sectionBar("III", "QUALITY CONTROL (QC)")}
  <div class="section-body">
    <div class="two-col">
      <div>
        ${fieldLine("Final pH:", batch.qc_final_ph || "", "80px")}
        ${fieldLine("Target:", batch.qc_final_ph_target || "", "80px")}
      </div>
      <div>
        <div style="margin-bottom:4px;"><b>Color/Scent Check:</b><span class="pass-fail"><span class="cb"></span> Pass <span class="cb"></span> Fail</span></div>
        <div><b>Viscosity/Texture:</b><span class="pass-fail"><span class="cb"></span> Pass <span class="cb"></span> Fail</span></div>
      </div>
    </div>
  </div>

  <!-- ═══ IV. FILLING & YIELD CALCULATION ═══ -->
  ${sectionBar("IV", "FILLING &amp; YIELD CALCULATION")}
  <div class="section-body" style="padding:0;">
    <table>
      <thead>
        <tr>
          <th style="width:18%;">Container</th>
          <th style="width:12%;">Size</th>
          <th style="width:18%;">Expected (QTY)</th>
          <th style="width:14%;">Actual</th>
          <th style="width:14%;">Waste/Loss</th>
          <th style="width:14%;">Yield %</th>
        </tr>
      </thead>
      <tbody>
        ${(packaging.length > 0 ? packaging : [{}, {}, {}]).map((p) => `
          <tr>
            <td style="height:24px;">${p.name || ""}</td>
            <td>${p.sku || ""}</td>
            <td>${p.qty_per_unit ? (p.qty_per_unit * (batch.quantity || 0)) : (batch.quantity || "")}</td>
            <td></td><td></td><td></td>
          </tr>`).join("")}
      </tbody>
    </table>
  </div>

  ${ingredients.length > 0 ? `
  <!-- ═══ INGREDIENTS / BOM ═══ -->
  ${sectionBar("IV·a", "INGREDIENTS / BILL OF MATERIALS")}
  <div class="section-body" style="padding:0;">
    <table>
      <thead>
        <tr>
          <th>SKU</th><th>Material</th>
          <th style="text-align:right;">Target Qty</th>
          <th>Unit</th><th>Lot #</th><th>Actual Qty</th><th style="width:50px;text-align:center;">✓</th>
        </tr>
      </thead>
      <tbody>
        ${ingredients.map((ing) => `
          <tr>
            <td style="font-family:monospace;">${ing.sku || ""}</td>
            <td>${ing.material || ""}</td>
            <td style="text-align:right;font-weight:bold;">${ing.qty || ""}</td>
            <td>${ing.unit || ""}</td>
            <td></td><td></td><td style="text-align:center;">□</td>
          </tr>`).join("")}
      </tbody>
    </table>
  </div>` : ""}

  <!-- ═══ V. LABEL VERIFICATION ═══ -->
  ${sectionBar("V", "LABEL VERIFICATION")}
  <div class="section-body">
    <div class="two-col">
      <div>
        ${checkbox("Batch Number on label matches this Traveller")}<br/>
        ${checkbox("Expiry Date / PAO is correct")}<br/>
        ${checkbox("Label is straight and free of air bubbles")}
      </div>
      <div class="label-box">AFFIX SAMPLE LABEL HERE OR BACK</div>
    </div>
  </div>

  <!-- ═══ VI. FINAL AUTHORIZATION ═══ -->
  ${sectionBar("VI", "FINAL AUTHORIZATION")}
  <div class="section-body">
    <div style="margin-bottom:6px;">
      ${fieldLine("Production Manager:", batch.production_manager || "", "200px")}
      ${fieldLine("Date:", fmtDate(batch.authorization_date), "150px")}
    </div>
    <div style="font-style:italic;font-size:9.5px;color:#555;">Copy to Office for Filing &amp; Inventory Management</div>

    <div class="office-box">
      <div class="office-title">OFFICE USE ONLY — INVENTORY MANAGEMENT</div>
      ${checkbox("Added to Inventory")}
      ${fieldLine("By:", batch.inventory_added_by || "", "150px")}
      ${fieldLine("Date:", fmtDate(batch.inventory_added_date), "130px")}
    </div>
  </div>

  <!-- ═══ VII. NOTES ═══ -->
  ${sectionBar("VII", "NOTES <span style='font-weight:normal;font-style:italic;float:right;font-size:10px;'>BATCH FORMULATION PROTECTED — NOT INCLUDED ON TRAVELLER</span>")}
  <div class="section-body">
    <div class="notes-area">${(batch.traveler_notes || batch.notes || "").replace(/\n/g, "<br/>")}</div>
  </div>

  </body></html>`;

  const win = window.open("", "_blank", "width=900,height=900");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

// ── Receipt Printer Mini Traveller (80mm / 3" wide) ─────────────────────────
async function printReceiptTraveller(batch) {
  const qrData = await generateQRDataURL(batch.batch_id);
  const fmtDate = (d) => d ? new Date(d.includes?.("T") ? d : d + "T00:00:00").toLocaleDateString("en-CA") : "—";
  const lineLabel = parseBatchLine(batch);

  const qtyDone = batch.actual_yield_units;
  const unlabeled = batch.unlabeled_qty;
  const labeled = batch.labeled_qty;

  const html = `<!DOCTYPE html><html><head><title>Receipt — ${batch.batch_id}</title>
  <style>
    @page { margin: 2mm; size: 80mm auto; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      width: 76mm; margin: 0; padding: 2mm;
      color: #000; font-size: 14px; line-height: 1.4;
      font-weight: bold;
    }
    .center { text-align: center; }
    .title { font-size: 18px; font-weight: 900; letter-spacing: 1px; }
    .sub { font-size: 12px; color: #000; margin-top: 1mm; font-weight: bold; }
    hr { border: 0; border-top: 2px dashed #000; margin: 2mm 0; }
    .qr { display: block; margin: 2mm auto; width: 44mm; height: 44mm; }
    .batch-id { font-size: 16px; font-weight: 900; font-family: monospace; }
    .row { display: flex; justify-content: space-between; gap: 3mm; margin: 1mm 0; }
    .row .lbl { color: #000; font-size: 12px; font-weight: bold; }
    .row .val { font-weight: 900; text-align: right; font-size: 14px; max-width: 60%; word-wrap: break-word; }
    .product { font-size: 15px; font-weight: 900; margin: 2mm 0; }
    .section-title { font-size: 13px; font-weight: 900; text-align: center; margin: 1mm 0; letter-spacing: 1px; }
    .signoff { margin: 3mm 0; }
    .signoff .line { border-bottom: 1.5px solid #000; height: 7mm; margin-top: 1mm; }
    .signoff .lbl-sm { font-size: 11px; font-weight: bold; }
    .qty-box {
      border: 2px solid #000; padding: 2mm; margin: 1mm 0;
      display: flex; justify-content: space-between; align-items: center;
    }
    .qty-box .qty-lbl { font-size: 13px; font-weight: 900; }
    .qty-box .qty-val { font-size: 16px; font-weight: 900; }
    .footer { font-size: 10px; color: #000; margin-top: 3mm; text-align: center; font-weight: bold; }
  </style></head><body>

  <div class="center">
    <div class="title">BUBBLE FACTORY</div>
    <div class="sub">Manufacturing Traveller</div>
  </div>

  <hr/>

  ${qrData ? `<img class="qr" src="${qrData}" alt="QR" />` : ""}
  <div class="center batch-id">${batch.batch_id}</div>

  <hr/>

  <div class="product center">${batch.product_name || ""}</div>

  <div class="row"><span class="lbl">SKU</span><span class="val">${batch.sku || "—"}</span></div>
  <div class="row"><span class="lbl">Line</span><span class="val">${lineLabel || "—"}</span></div>
  <div class="row"><span class="lbl">Batch Date</span><span class="val">${fmtDate(batch.production_date)}</span></div>
  <div class="row"><span class="lbl">Planned Qty</span><span class="val">${batch.quantity?.toLocaleString() || "—"} units</span></div>
  <div class="row"><span class="lbl">Operator</span><span class="val">${batch.operator || "—"}</span></div>
  <div class="row"><span class="lbl">Status</span><span class="val">${batch.status || "—"}</span></div>
  ${batch.finished_product_lot_number ? `<div class="row"><span class="lbl">Lot #</span><span class="val">${batch.finished_product_lot_number}</span></div>` : ""}
  ${batch.expiry_date ? `<div class="row"><span class="lbl">Expiry</span><span class="val">${fmtDate(batch.expiry_date)}</span></div>` : ""}

  <hr/>

  <div class="section-title">PRODUCTION QTY</div>
  <div class="qty-box">
    <span class="qty-lbl">QTY Done</span>
    <span class="qty-val">${qtyDone != null ? qtyDone.toLocaleString() + " u" : "________"}</span>
  </div>
  <div class="qty-box">
    <span class="qty-lbl">Unlabeled</span>
    <span class="qty-val">${unlabeled != null ? unlabeled.toLocaleString() + " u" : "________"}</span>
  </div>
  <div class="qty-box">
    <span class="qty-lbl">Labeled</span>
    <span class="qty-val">${labeled != null ? labeled.toLocaleString() + " u" : "________"}</span>
  </div>

  <hr/>

  <div class="section-title">QA SIGN-OFF</div>
  <div class="signoff">
    <div class="lbl-sm">QA Inspector Name:</div>
    <div class="line"></div>
  </div>
  <div class="signoff">
    <div class="lbl-sm">Signature:</div>
    <div class="line"></div>
  </div>
  <div class="signoff">
    <div class="lbl-sm">Date / Time:</div>
    <div class="line"></div>
  </div>
  <div class="row" style="margin-top:2mm">
    <span class="lbl">Pass / Fail</span>
    <span class="val">[ ] PASS &nbsp; [ ] FAIL</span>
  </div>

  <hr/>

  <div class="footer">Printed ${new Date().toLocaleString()}</div>

  </body></html>`;

  const win = window.open("", "_blank", "width=400,height=700");
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
  const [qrUrl, setQrUrl] = useState("");

  useEffect(() => {
    if (open && batch) {
      setForm({
        operator: batch.operator || "",
        notes: batch.notes || "",
        traveler_notes: batch.traveler_notes || "",
        actual_yield_units: batch.actual_yield_units ?? "",
        deviation_notes: batch.deviation_notes || "",
        unlabeled_qty: batch.unlabeled_qty ?? "",
        labeled_qty: batch.labeled_qty ?? "",
      });
      setEditMode(false);
      generateQRDataURL(batch.batch_id).then(setQrUrl);
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
                onClick={() => printReceiptTraveller(batch)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
                title="Print receipt-size label (80mm)"
              >
                <Printer className="w-3.5 h-3.5" /> Receipt
              </button>
              <button
                onClick={() => { if (recipe !== undefined) { printTraveller(batch, recipe); } }}
                className="flex items-center gap-1.5 px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
                title="Print full traveller (letter)"
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
          {/* Summary + QR */}
          <div className="flex gap-4 items-start">
            <div className="grid grid-cols-2 gap-3 text-sm flex-1">
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
            {qrUrl && (
              <div className="text-center shrink-0">
                <img src={qrUrl} alt="QR" className="w-24 h-24 bg-white p-1 rounded" />
                <div className="text-[10px] font-mono text-zinc-500 mt-1">{batch?.batch_id}</div>
              </div>
            )}
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

          {/* Labeled / Unlabeled */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-xs text-zinc-500">Unlabeled Units</div>
              {editMode ? (
                <Input type="number" value={form.unlabeled_qty}
                  onChange={(e) => setForm({ ...form, unlabeled_qty: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm" />
              ) : (
                <div className={`font-medium ${batch?.unlabeled_qty > 0 ? "text-amber-400" : "text-zinc-600"}`}>
                  {batch?.unlabeled_qty != null ? `${batch.unlabeled_qty?.toLocaleString()} units` : "—"}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <div className="text-xs text-zinc-500">Labeled Units</div>
              {editMode ? (
                <Input type="number" value={form.labeled_qty}
                  onChange={(e) => setForm({ ...form, labeled_qty: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm" />
              ) : (
                <div className={`font-medium ${batch?.labeled_qty > 0 ? "text-green-400" : "text-zinc-600"}`}>
                  {batch?.labeled_qty != null ? `${batch.labeled_qty?.toLocaleString()} units` : "—"}
                </div>
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
  const [lotDialog, setLotDialog] = useState(false);
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

  const invalidateAllBatchCaches = () => {
    ["shopfloor_batches", "planning_wip_inhouse_batches", "planning_schedule_batches", "planning_batches", "batches-traveler", "review_queue"]
      .forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  };

  // Keep ReviewQueue records in sync when arrows move a batch in or out of "in_review"
  const syncReviewQueue = async (batch, newStatus) => {
    try {
      if (newStatus === "in_review") {
        // Moving forward INTO review — create a ReviewQueue record if none exists
        const existing = await base44.entities.ReviewQueue.filter({ batch_entity_id: batch.id, status: "pending" });
        if (existing.length === 0) {
          await base44.entities.ReviewQueue.create({
            batch_id: batch.batch_id,
            batch_entity_id: batch.id,
            sku: batch.sku,
            product_name: batch.product_name,
            quantity: batch.actual_yield_units ?? batch.quantity ?? 0,
            planned_quantity: batch.quantity,
            status: "pending",
            submitted_at: new Date().toISOString(),
          });
        }
      } else if (batch.status === "in_review") {
        // Moving backward OUT of review — clean up any pending ReviewQueue records
        const existing = await base44.entities.ReviewQueue.filter({ batch_entity_id: batch.id, status: "pending" });
        await Promise.all(existing.map((r) => base44.entities.ReviewQueue.delete(r.id)));
      }
    } catch (err) {
      console.error("ReviewQueue sync failed", err);
    }
  };

  const advanceMutation = useMutation({
    mutationFn: async ({ id, newStatus, extra }) => {
      await syncReviewQueue(batch, newStatus);
      return base44.entities.Batch.update(id, { status: newStatus, ...extra });
    },
    onSuccess: () => { invalidateAllBatchCaches(); toast.success("Stage updated"); },
    onError: (err) => toast.error(`Failed: ${err?.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Batch.update(id, data),
    onSuccess: () => { invalidateAllBatchCaches(); toast.success("Saved"); },
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

  const handleOpenLotCapture = async () => {
    await loadRecipe();
    setLotDialog(true);
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
        <div>
          <select
            value={batch.production_line ?? ""}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : null;
              updateMutation.mutate({ id: batch.id, data: { production_line: val } });
            }}
            className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-1 py-0.5 text-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <option value="">No Line</option>
            <option value="1">Line 1</option>
            <option value="2">Line 2</option>
            <option value="3">Melter 1</option>
            <option value="4">Melter 2</option>
          </select>
        </div>
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
          {/* Lot Capture — only during batching */}
          {stage === "batching" && (
            <Button size="sm" variant="ghost"
              onClick={handleOpenLotCapture}
              className="w-full text-xs h-7 text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10 border border-zinc-800">
              <MapPin className="w-3 h-3 mr-1" /> Capture Lots
            </Button>
          )}
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

      {/* Lot Capture Dialog */}
      <LotConsumptionDialog
        open={lotDialog}
        batch={batch}
        recipe={recipe}
        inventory={inventory}
        onClose={() => setLotDialog(false)}
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
          if (formData.unlabeled_qty !== "") {
            data.unlabeled_qty = Number(formData.unlabeled_qty) || 0;
          }
          if (formData.labeled_qty !== "") {
            data.labeled_qty = Number(formData.labeled_qty) || 0;
          }
          updateMutation.mutate({ id: batch.id, data }, { onSuccess: () => setTravellerDialog(false) });
        }}
      />
    </div>
  );
}

// ── Task Card ────────────────────────────────────────────────────────────────
const TASK_STATUS_OPTIONS = [
  { value: "pending",     label: "Pending",     variant: "default" },
  { value: "in_progress", label: "In Progress", variant: "blue" },
  { value: "completed",   label: "Completed",   variant: "green" },
];

function TaskCard({ task, onStatusChange, dragHandleProps, draggableProps, innerRef }) {
  const tcfg = TASK_TYPE_CONFIG[task.task_type] || TASK_TYPE_CONFIG.other;
  const currentStatus = TASK_STATUS_OPTIONS.find((s) => s.value === task.status) || TASK_STATUS_OPTIONS[0];

  return (
    <div ref={innerRef} {...draggableProps} className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 px-3 py-2 space-y-1.5">
      <div {...dragHandleProps} className="flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing">
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
      <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
        <Badge variant={currentStatus.variant}>{currentStatus.label}</Badge>
        <select
          value={task.status || "pending"}
          onChange={(e) => onStatusChange(task, e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-zinc-500"
        >
          {TASK_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ── Day Column ───────────────────────────────────────────────────────────────
export default function ShopFloorDayColumn({ date, dayLabel, isToday, batches, tasks, inventory, labels, onAddTask, onTaskStatusChange }) {
  return (
    <div className={`min-w-[260px] flex flex-col rounded-xl border overflow-y-auto max-h-[calc(100vh-280px)] ${isToday ? "border-orange-500/30 bg-orange-500/5" : "border-zinc-800 bg-zinc-900/30"}`}>
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
            className={`flex-1 p-2 space-y-2 transition-colors rounded-b-xl ${snapshot.isDraggingOver ? "bg-orange-500/5" : ""}`}
          >
            {batches.map((batch, index) => (
              <Draggable key={String(batch.id)} draggableId={String(batch.id)} index={index}>
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
            {tasks.map((task, index) => (
              <Draggable key={`task-${task.id}`} draggableId={`task-${task.id}`} index={batches.length + index}>
                {(dragProvided) => (
                  <TaskCard
                    task={task}
                    onStatusChange={onTaskStatusChange}
                    innerRef={dragProvided.innerRef}
                    draggableProps={dragProvided.draggableProps}
                    dragHandleProps={dragProvided.dragHandleProps}
                  />
                )}
              </Draggable>
            ))}
            {provided.placeholder}
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