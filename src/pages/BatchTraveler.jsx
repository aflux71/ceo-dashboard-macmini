import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Printer, Search, ChevronDown, ChevronUp, Plus, Save, CheckCircle, Clock, FileText, Eye, History } from "lucide-react";
import BatchHistory from "@/pages/BatchHistory";

const STATUS_COLORS = {
  draft: "bg-zinc-700 text-zinc-300",
  started: "bg-blue-500/20 text-blue-400",
  on_hold: "bg-amber-500/20 text-amber-400",
  pending_qc: "bg-yellow-500/20 text-yellow-400",
  approved: "bg-green-500/20 text-green-400",
  in_review: "bg-purple-500/20 text-purple-400",
  added_to_inventory: "bg-teal-500/20 text-teal-400",
  rejected: "bg-red-500/20 text-red-400",
};

const PRODUCT_CODES = ["LS", "FS", "RO", "BB", "SB", "EO", "OTHER"];
const PRODUCT_CODE_LABELS = {
  LS: "Liquid Soap", FS: "Face Serum", RO: "Roll-on",
  BB: "Bath Bomb", SB: "Shampoo Bar", EO: "Essential Oil", OTHER: "Other"
};

function TravelerForm({ batch, onSave, onClose }) {
  const [form, setForm] = useState({
    batch_id: batch.batch_id || "",
    product_name: batch.product_name || "",
    product_code: batch.product_code || "",
    batch_prepped_by: batch.batch_prepped_by || "",
    operator: batch.operator || "",
    production_date: batch.production_date ? batch.production_date.split("T")[0] : "",
    total_theoretical_volume_weight: batch.total_theoretical_volume_weight || "",
    // Sanitization
    sanitization_vessel_cleaned: batch.sanitization_vessel_cleaned || false,
    sanitization_equipment_flushed: batch.sanitization_equipment_flushed || false,
    sanitization_utensils_wiped: batch.sanitization_utensils_wiped || false,
    sanitization_work_surface: batch.sanitization_work_surface || false,
    sanitization_hands_gloves: batch.sanitization_hands_gloves || false,
    sanitization_verified_by: batch.sanitization_verified_by || "",
    sanitization_time: batch.sanitization_time || "",
    sanitizer_used: batch.sanitizer_used || "",
    // QC
    qc_final_ph: batch.qc_final_ph || "",
    qc_final_ph_target: batch.qc_final_ph_target || "",
    qc_color_scent_pass: batch.qc_color_scent_pass ?? null,
    qc_viscosity_texture_pass: batch.qc_viscosity_texture_pass ?? null,
    // Filling
    filling_yield_data: batch.filling_yield_data?.length > 0 ? batch.filling_yield_data : [
      { container: "", size: "", expected_qty: "", actual_qty: "", waste_loss: "", yield_percent: "" },
      { container: "", size: "", expected_qty: "", actual_qty: "", waste_loss: "", yield_percent: "" },
      { container: "", size: "", expected_qty: "", actual_qty: "", waste_loss: "", yield_percent: "" },
    ],
    // Label
    label_batch_match: batch.label_batch_match || false,
    label_expiry_correct: batch.label_expiry_correct || false,
    label_straight_clean: batch.label_straight_clean || false,
    // Authorization
    production_manager: batch.production_manager || "",
    authorization_date: batch.authorization_date || "",
    // Inventory
    inventory_added_checkbox: batch.inventory_added_checkbox || false,
    inventory_added_by: batch.inventory_added_by || "",
    inventory_added_date: batch.inventory_added_date || "",
    // Notes
    traveler_notes: batch.traveler_notes || "",
  });

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const updateYieldRow = (idx, key, val) => {
    const rows = [...form.filling_yield_data];
    rows[idx] = { ...rows[idx], [key]: val };
    // Auto-calc yield %
    if (key === "actual_qty" || key === "expected_qty" || key === "waste_loss") {
      const expected = parseFloat(key === "expected_qty" ? val : rows[idx].expected_qty);
      const actual = parseFloat(key === "actual_qty" ? val : rows[idx].actual_qty);
      if (expected > 0 && actual >= 0) {
        rows[idx].yield_percent = ((actual / expected) * 100).toFixed(1);
      }
    }
    setForm(f => ({ ...f, filling_yield_data: rows }));
  };

  const addYieldRow = () => {
    setForm(f => ({
      ...f,
      filling_yield_data: [...f.filling_yield_data, { container: "", size: "", expected_qty: "", actual_qty: "", waste_loss: "", yield_percent: "" }]
    }));
  };

  const handleSave = () => onSave(form);

  return (
    <div className="space-y-6">
      {/* Section I */}
      <section className="border border-zinc-700 rounded-lg overflow-hidden">
        <div className="bg-[#1e3a5f] px-4 py-2.5 flex items-center justify-between">
          <h2 className="text-white font-bold text-sm uppercase tracking-wide">I. Batch Identification & Prep</h2>
          <span className="text-zinc-300 text-xs">Form: BF-TRV-001 | Rev: 1.0</span>
        </div>
        <div className="bg-zinc-800/50 px-4 py-2 text-xs text-zinc-400">
          <strong className="text-zinc-300">PRODUCT CODES:</strong> LS = Liquid Soap | FS = Face Serum | RO = Roll-on | BB = Bath Bomb | SB = Shampoo Bar | EO = Essential Oil
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Batch ID <span className="text-zinc-500">(Format: [PROD]-[Julian Date]-[QC])</span></label>
              <input value={form.batch_id} onChange={e => set("batch_id", e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Date</label>
              <input type="date" value={form.production_date} onChange={e => set("production_date", e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Product Code</label>
              <select value={form.product_code} onChange={e => set("product_code", e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none">
                <option value="">Select...</option>
                {PRODUCT_CODES.map(c => <option key={c} value={c}>{c} — {PRODUCT_CODE_LABELS[c]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Product Name</label>
              <input value={form.product_name} onChange={e => set("product_name", e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Batch Prepped By</label>
              <input value={form.batch_prepped_by} onChange={e => set("batch_prepped_by", e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
          <div className="w-full md:w-1/2">
            <label className="block text-xs text-zinc-400 mb-1">Total Theoretical Volume/Weight</label>
            <input value={form.total_theoretical_volume_weight} onChange={e => set("total_theoretical_volume_weight", e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
          </div>
        </div>
      </section>

      {/* Section II */}
      <section className="border border-zinc-700 rounded-lg overflow-hidden">
        <div className="bg-[#1e3a5f] px-4 py-2.5">
          <h2 className="text-white font-bold text-sm uppercase tracking-wide">II. Sanitization Report — Fill Stage</h2>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
            {[
              ["sanitization_vessel_cleaned", "Filling Vessel cleaned & sanitized"],
              ["sanitization_equipment_flushed", "Filling Equipment/Pumps flushed"],
              ["sanitization_utensils_wiped", "Utensils/Scales wiped (70% IPA)"],
              ["sanitization_work_surface", "Work surface cleared & sanitized"],
              ["sanitization_hands_gloves", "Operator hands/gloves sanitized"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={form[key]} onChange={e => set(key, e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-500 bg-zinc-900 text-blue-500 focus:ring-0 cursor-pointer" />
                <span className={`text-sm ${form[key] ? "text-green-400" : "text-zinc-300"}`}>{label}</span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Verified By</label>
              <input value={form.sanitization_verified_by} onChange={e => set("sanitization_verified_by", e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Time</label>
              <input type="time" value={form.sanitization_time} onChange={e => set("sanitization_time", e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Sanitizer Used</label>
              <input value={form.sanitizer_used} onChange={e => set("sanitizer_used", e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
        </div>
      </section>

      {/* Section III */}
      <section className="border border-zinc-700 rounded-lg overflow-hidden">
        <div className="bg-[#1e3a5f] px-4 py-2.5">
          <h2 className="text-white font-bold text-sm uppercase tracking-wide">III. Quality Control (QC)</h2>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Final pH</label>
                <input value={form.qc_final_ph} onChange={e => set("qc_final_ph", e.target.value)}
                  className="w-28 bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Target</label>
                <input value={form.qc_final_ph_target} onChange={e => set("qc_final_ph_target", e.target.value)}
                  className="w-28 bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
              </div>
            </div>
            <div className="space-y-3">
              {[
                ["qc_color_scent_pass", "Color/Scent Check"],
                ["qc_viscosity_texture_pass", "Viscosity/Texture"],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center gap-4">
                  <span className="text-sm text-zinc-300 w-40">{label}:</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name={key} checked={form[key] === true} onChange={() => set(key, true)}
                      className="text-green-500 focus:ring-0" />
                    <span className={`text-sm ${form[key] === true ? "text-green-400 font-semibold" : "text-zinc-400"}`}>Pass</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name={key} checked={form[key] === false} onChange={() => set(key, false)}
                      className="text-red-500 focus:ring-0" />
                    <span className={`text-sm ${form[key] === false ? "text-red-400 font-semibold" : "text-zinc-400"}`}>Fail</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Section IV */}
      <section className="border border-zinc-700 rounded-lg overflow-hidden">
        <div className="bg-[#1e3a5f] px-4 py-2.5">
          <h2 className="text-white font-bold text-sm uppercase tracking-wide">IV. Filling & Yield Calculation</h2>
        </div>
        <div className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-700/50">
                  {["Container", "Size", "Expected (QTY)", "Actual", "Waste/Loss", "Yield %"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-zinc-300 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {form.filling_yield_data.map((row, idx) => (
                  <tr key={idx} className="border-t border-zinc-700">
                    {["container", "size", "expected_qty", "actual_qty", "waste_loss"].map(col => (
                      <td key={col} className="px-2 py-1">
                        <input
                          value={row[col] || ""}
                          onChange={e => updateYieldRow(idx, col, e.target.value)}
                          type={["expected_qty", "actual_qty", "waste_loss"].includes(col) ? "number" : "text"}
                          className="w-full bg-zinc-900 border border-zinc-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
                      </td>
                    ))}
                    <td className="px-2 py-1">
                      <div className={`w-full rounded px-2 py-1.5 text-sm text-center font-semibold border ${
                        row.yield_percent >= 95 ? "bg-green-500/20 text-green-400 border-green-500/30" :
                        row.yield_percent >= 80 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                        row.yield_percent > 0 ? "bg-red-500/20 text-red-400 border-red-500/30" :
                        "bg-zinc-800 text-zinc-500 border-zinc-700"
                      }`}>
                        {row.yield_percent ? `${row.yield_percent}%` : "—"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addYieldRow} className="mt-2 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
            <Plus className="w-3 h-3" /> Add Row
          </button>
        </div>
      </section>

      {/* Section V */}
      <section className="border border-zinc-700 rounded-lg overflow-hidden">
        <div className="bg-[#1e3a5f] px-4 py-2.5">
          <h2 className="text-white font-bold text-sm uppercase tracking-wide">V. Label Verification</h2>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            {[
              ["label_batch_match", "Batch Number on label matches this Traveller"],
              ["label_expiry_correct", "Expiry Date / PAO is correct"],
              ["label_straight_clean", "Label is straight and free of air bubbles"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form[key]} onChange={e => set(key, e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-500 bg-zinc-900 text-blue-500 focus:ring-0 cursor-pointer" />
                <span className={`text-sm ${form[key] ? "text-green-400" : "text-zinc-300"}`}>{label}</span>
              </label>
            ))}
          </div>
          <div className="border-2 border-dashed border-zinc-600 rounded-lg p-4 flex flex-col items-center justify-center min-h-[100px] text-zinc-500 text-xs italic">
            AFFIX SAMPLE LABEL HERE OR BACK
          </div>
        </div>
      </section>

      {/* Section VI */}
      <section className="border border-zinc-700 rounded-lg overflow-hidden">
        <div className="bg-[#1e3a5f] px-4 py-2.5">
          <h2 className="text-white font-bold text-sm uppercase tracking-wide">VI. Final Authorization</h2>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Production Manager</label>
              <input value={form.production_manager} onChange={e => set("production_manager", e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Date</label>
              <input type="date" value={form.authorization_date} onChange={e => set("authorization_date", e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
          <p className="text-xs text-zinc-500 italic">Copy to Office for Filing & Inventory Management</p>
          <div className="bg-[#1e3a5f]/60 border border-blue-800/50 rounded-lg p-3">
            <p className="text-xs font-bold text-blue-300 uppercase mb-2">Office Use Only — Inventory Management</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.inventory_added_checkbox} onChange={e => set("inventory_added_checkbox", e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-500 bg-zinc-900 text-blue-500 focus:ring-0" />
                <span className={`text-sm ${form.inventory_added_checkbox ? "text-green-400" : "text-zinc-300"}`}>Added to Inventory</span>
              </label>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">By</label>
                <input value={form.inventory_added_by} onChange={e => set("inventory_added_by", e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Date</label>
                <input type="date" value={form.inventory_added_date} onChange={e => set("inventory_added_date", e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section VII */}
      <section className="border border-zinc-700 rounded-lg overflow-hidden">
        <div className="bg-[#1e3a5f] px-4 py-2.5 flex justify-between items-center">
          <h2 className="text-white font-bold text-sm uppercase tracking-wide">VII. Notes</h2>
          <span className="text-zinc-400 text-xs italic">Batch Formulation Protected — Not Included on Traveller</span>
        </div>
        <div className="p-4">
          <textarea value={form.traveler_notes} onChange={e => set("traveler_notes", e.target.value)} rows={4}
            className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none resize-none" />
        </div>
      </section>

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">Cancel</button>
        <button onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Save className="w-4 h-4" /> Save Traveller
        </button>
      </div>
    </div>
  );
}

function PrintableTraveler({ batch }) {
  return (
    <div className="print-traveler bg-white text-black p-8 max-w-[900px] mx-auto font-sans text-sm">
      {/* Header */}
      <div className="bg-[#1e3a5f] text-white p-4 rounded-t-lg flex justify-between items-center mb-1">
        <div>
          <div className="text-2xl font-black tracking-wide">BUBBLE FACTORY</div>
          <div className="text-sm">Manufacturing Traveller</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold">High Priority Document</div>
        </div>
        <div className="text-right text-xs">
          <div>Form: BF-TRV-001</div>
          <div>Rev: 1.0</div>
        </div>
      </div>

      {/* Section I */}
      <div className="border border-gray-300 mb-2">
        <div className="bg-[#1e3a5f] text-white px-3 py-1.5 text-xs font-bold uppercase">I. Batch Identification & Prep</div>
        <div className="bg-gray-100 px-3 py-1 text-xs text-gray-600">
          <strong>PRODUCT CODES:</strong> LS = Liquid Soap | FS = Face Serum | RO = Roll-on | BB = Bath Bomb | SB = Shampoo Bar | EO = Essential Oil
        </div>
        <div className="p-3 space-y-2">
          <div className="flex gap-6 text-xs">
            <div><span className="font-semibold">Format:</span> [PROD]-[Julian Date]-[QC]</div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center gap-2"><span className="font-bold text-xs">Batch ID:</span><div className="flex-1 border-b border-gray-400 min-h-[20px] px-1">{batch.batch_id}</div></div>
            <div className="flex items-center gap-2"><span className="font-bold text-xs">Date:</span><div className="flex-1 border-b border-gray-400 min-h-[20px] px-1">{batch.production_date ? format(new Date(batch.production_date), "yyyy-MM-dd") : ""}</div></div>
            <div className="flex items-center gap-2"><span className="font-bold text-xs">Product Code:</span><div className="flex-1 border-b border-gray-400 min-h-[20px] px-1">{batch.product_code || ""}</div></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2"><span className="font-bold text-xs">Product Name:</span><div className="flex-1 border-b border-gray-400 min-h-[20px] px-1">{batch.product_name}</div></div>
            <div className="flex items-center gap-2"><span className="font-bold text-xs">Batch Prepped By:</span><div className="flex-1 border-b border-gray-400 min-h-[20px] px-1">{batch.batch_prepped_by || ""}</div></div>
          </div>
          <div className="flex items-center gap-2"><span className="font-bold text-xs">Total Theoretical Volume/Weight:</span><div className="w-48 border-b border-gray-400 min-h-[20px] px-1">{batch.total_theoretical_volume_weight || ""}</div></div>
        </div>
      </div>

      {/* Section II */}
      <div className="border border-gray-300 mb-2">
        <div className="bg-[#1e3a5f] text-white px-3 py-1.5 text-xs font-bold uppercase">II. Sanitization Report — Fill Stage</div>
        <div className="p-3">
          <div className="grid grid-cols-2 gap-1 mb-3 text-xs">
            {[
              ["sanitization_vessel_cleaned", "Filling Vessel cleaned & sanitized"],
              ["sanitization_work_surface", "Work surface cleared & sanitized"],
              ["sanitization_equipment_flushed", "Filling Equipment/Pumps flushed"],
              ["sanitization_hands_gloves", "Operator hands/gloves sanitized"],
              ["sanitization_utensils_wiped", "Utensils/Scales wiped (70% IPA)"],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <div className={`w-3.5 h-3.5 border border-gray-500 flex items-center justify-center text-xs ${batch[key] ? "bg-blue-600 text-white" : ""}`}>{batch[key] ? "✓" : ""}</div>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div className="flex items-center gap-2"><span className="font-bold">Verified By:</span><div className="flex-1 border-b border-gray-400 min-h-[18px] px-1">{batch.sanitization_verified_by || ""}</div></div>
            <div className="flex items-center gap-2"><span className="font-bold">Time:</span><div className="flex-1 border-b border-gray-400 min-h-[18px] px-1">{batch.sanitization_time || ""}</div></div>
            <div className="flex items-center gap-2"><span className="font-bold">Sanitizer Used:</span><div className="flex-1 border-b border-gray-400 min-h-[18px] px-1">{batch.sanitizer_used || ""}</div></div>
          </div>
        </div>
      </div>

      {/* Section III */}
      <div className="border border-gray-300 mb-2">
        <div className="bg-[#1e3a5f] text-white px-3 py-1.5 text-xs font-bold uppercase">III. Quality Control (QC)</div>
        <div className="p-3 grid grid-cols-2 gap-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2"><span className="font-bold">Final pH:</span><div className="w-16 border-b border-gray-400 min-h-[18px] px-1">{batch.qc_final_ph || ""}</div></div>
            <div className="flex items-center gap-2"><span className="font-bold">Target:</span><div className="w-16 border-b border-gray-400 min-h-[18px] px-1">{batch.qc_final_ph_target || ""}</div></div>
          </div>
          <div className="space-y-1">
            {[["qc_color_scent_pass", "Color/Scent Check:"], ["qc_viscosity_texture_pass", "Viscosity/Texture:"]].map(([key, label]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="font-bold w-36">{label}</span>
                <div className={`w-4 h-4 border border-gray-500 flex items-center justify-center text-xs ${batch[key] === true ? "bg-green-500 text-white" : ""}`}>{batch[key] === true ? "✓" : ""}</div><span>Pass</span>
                <div className={`w-4 h-4 border border-gray-500 flex items-center justify-center text-xs ${batch[key] === false ? "bg-red-500 text-white" : ""}`}>{batch[key] === false ? "✓" : ""}</div><span>Fail</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section IV */}
      <div className="border border-gray-300 mb-2">
        <div className="bg-[#1e3a5f] text-white px-3 py-1.5 text-xs font-bold uppercase">IV. Filling & Yield Calculation</div>
        <table className="w-full text-xs">
          <thead><tr className="bg-[#1e3a5f] text-white">{["Container", "Size", "Expected (QTY)", "Actual", "Waste/Loss", "Yield %"].map(h => <th key={h} className="px-3 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {(batch.filling_yield_data || [{}, {}, {}]).map((row, i) => (
              <tr key={i} className="border-t border-gray-300">
                {["container", "size", "expected_qty", "actual_qty", "waste_loss", "yield_percent"].map(col => (
                  <td key={col} className="px-3 py-2 border-r border-gray-200 min-h-[28px]">{row[col] || ""}{col === "yield_percent" && row[col] ? "%" : ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section V */}
      <div className="border border-gray-300 mb-2">
        <div className="bg-[#1e3a5f] text-white px-3 py-1.5 text-xs font-bold uppercase">V. Label Verification</div>
        <div className="p-3 grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            {[["label_batch_match", "Batch Number on label matches this Traveller"], ["label_expiry_correct", "Expiry Date / PAO is correct"], ["label_straight_clean", "Label is straight and free of air bubbles"]].map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <div className={`w-3.5 h-3.5 border border-gray-500 flex items-center justify-center text-xs ${batch[key] ? "bg-blue-600 text-white" : ""}`}>{batch[key] ? "✓" : ""}</div>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="border-2 border-dashed border-gray-400 min-h-[80px] flex items-center justify-center text-gray-400 italic text-xs">AFFIX SAMPLE LABEL HERE OR BACK</div>
        </div>
      </div>

      {/* Section VI */}
      <div className="border border-gray-300 mb-2">
        <div className="bg-[#1e3a5f] text-white px-3 py-1.5 text-xs font-bold uppercase">VI. Final Authorization</div>
        <div className="p-3 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2"><span className="font-bold">Production Manager:</span><div className="flex-1 border-b border-gray-400 min-h-[18px] px-1">{batch.production_manager || ""}</div></div>
            <div className="flex items-center gap-2"><span className="font-bold">Date:</span><div className="flex-1 border-b border-gray-400 min-h-[18px] px-1">{batch.authorization_date || ""}</div></div>
          </div>
          <p className="text-gray-500 italic">Copy to Office for Filing & Inventory Management</p>
          <div className="bg-blue-50 border border-blue-200 rounded p-2">
            <p className="font-bold text-blue-800 uppercase text-xs mb-1">Office Use Only — Inventory Management</p>
            <div className="grid grid-cols-3 gap-3 items-center">
              <div className="flex items-center gap-2">
                <div className={`w-3.5 h-3.5 border border-gray-500 flex items-center justify-center text-xs ${batch.inventory_added_checkbox ? "bg-blue-600 text-white" : ""}`}>{batch.inventory_added_checkbox ? "✓" : ""}</div>
                <span>Added to Inventory</span>
              </div>
              <div className="flex items-center gap-2"><span className="font-bold">By:</span><div className="flex-1 border-b border-gray-400 min-h-[18px] px-1">{batch.inventory_added_by || ""}</div></div>
              <div className="flex items-center gap-2"><span className="font-bold">Date:</span><div className="flex-1 border-b border-gray-400 min-h-[18px] px-1">{batch.inventory_added_date || ""}</div></div>
            </div>
          </div>
        </div>
      </div>

      {/* Section VII */}
      <div className="border border-gray-300">
        <div className="bg-[#1e3a5f] text-white px-3 py-1.5 text-xs font-bold uppercase flex justify-between">
          <span>VII. Notes</span>
          <span className="font-normal italic">Batch Formulation Protected — Not Included on Traveller</span>
        </div>
        <div className="p-3 min-h-[80px] text-xs border-t border-gray-200">{batch.traveler_notes || ""}</div>
      </div>
    </div>
  );
}

export default function BatchTraveler() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("travellers"); // "travellers" | "history"
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [mode, setMode] = useState(null); // "edit" | "print" | "view"
  const printRef = useRef(null);

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["batches-traveler"],
    queryFn: () => base44.entities.Batch.list("-production_date", 200),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Batch.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches-traveler"] });
      setMode(null);
      setSelectedBatch(null);
    },
  });

  const filtered = batches.filter(b => {
    const matchSearch = !search || b.batch_id?.toLowerCase().includes(search.toLowerCase()) || b.product_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handlePrint = (batch) => {
    setSelectedBatch(batch);
    setMode("print");
    setTimeout(() => {
      const printWindow = window.open("", "_blank", "width=900,height=1200");
      printWindow.document.write(`
        <html><head><title>Batch Traveller - ${batch.batch_id}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 20px; color: #000; }
          * { box-sizing: border-box; }
          .bg-\\[\\#1e3a5f\\] { background-color: #1e3a5f !important; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 4px 8px; border: 1px solid #ccc; }
          @media print { body { margin: 0; } }
        </style>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
        </head><body>${printRef.current?.innerHTML || ""}</body></html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    }, 200);
  };

  const inProgress = filtered.filter(b => ["draft", "started", "on_hold", "pending_qc", "in_review"].includes(b.status));
  const completed = filtered.filter(b => ["approved", "added_to_inventory", "rejected"].includes(b.status));

  const BatchCard = ({ b }) => (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 hover:border-zinc-500 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-orange-400 font-semibold text-sm">{b.batch_id}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[b.status] || "bg-zinc-700 text-zinc-300"}`}>{b.status?.replace(/_/g, " ")}</span>
            {b.product_code && <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded border border-blue-500/30">{b.product_code}</span>}
          </div>
          <div className="text-white font-medium mt-1 text-sm truncate">{b.product_name}</div>
          <div className="text-zinc-400 text-xs mt-1 flex gap-4 flex-wrap">
            {b.operator && <span>Operator: {b.operator}</span>}
            {b.production_date && <span>{format(new Date(b.production_date), "MMM d, yyyy")}</span>}
            {b.quantity && <span>Qty: {b.quantity}</span>}
          </div>
          {/* Mini status indicators */}
          <div className="flex gap-3 mt-2">
            {b.sanitization_vessel_cleaned && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Sanitized</span>}
            {b.qc_final_ph && <span className="text-xs text-blue-400">pH: {b.qc_final_ph}</span>}
            {b.filling_yield_data?.some(r => r.yield_percent) && <span className="text-xs text-amber-400">Yield recorded</span>}
            {b.production_manager && <span className="text-xs text-purple-400">Authorized</span>}
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <button onClick={() => { setSelectedBatch(b); setMode("edit"); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/40 rounded text-xs transition-colors">
            <FileText className="w-3 h-3" /> Edit
          </button>
          <button onClick={() => { setSelectedBatch(b); setMode("view"); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700/50 border border-zinc-600 text-zinc-300 hover:bg-zinc-700 rounded text-xs transition-colors">
            <Eye className="w-3 h-3" /> View
          </button>
          <button onClick={() => handlePrint(b)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 border border-zinc-600 text-zinc-300 hover:bg-zinc-600 rounded text-xs transition-colors">
            <Printer className="w-3 h-3" /> Print
          </button>
        </div>
      </div>
    </div>
  );

  const BatchGroup = ({ title, items, defaultOpen = true }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
      <div className="mb-6">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-2 mb-3 text-zinc-300 hover:text-white transition-colors w-full text-left">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          <span className="font-semibold text-sm uppercase tracking-wide">{title}</span>
          <span className="text-zinc-500 text-xs ml-1">({items.length})</span>
        </button>
        {open && (
          <div className="space-y-3">
            {items.length === 0 ? (
              <div className="text-zinc-500 text-sm py-4 text-center border border-zinc-700 rounded-lg">No batches found</div>
            ) : items.map(b => <BatchCard key={b.id} b={b} />)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Hidden print target */}
      <div ref={printRef} className="hidden">
        {selectedBatch && <PrintableTraveler batch={selectedBatch} />}
      </div>

      {mode === "view" && selectedBatch ? (
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Manufacturing Traveller</h1>
              <p className="text-zinc-400 text-sm mt-1 font-mono">{selectedBatch.batch_id} — {selectedBatch.product_name}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setMode("edit"); }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/40 text-sm rounded-lg transition-colors">
                <FileText className="w-4 h-4" /> Edit
              </button>
              <button onClick={() => handlePrint(selectedBatch)}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded-lg transition-colors">
                <Printer className="w-4 h-4" /> Print
              </button>
              <button onClick={() => { setMode(null); setSelectedBatch(null); }}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors">
                ← Back
              </button>
            </div>
          </div>
          <div className="bg-white rounded-lg overflow-hidden shadow-xl">
            <PrintableTraveler batch={selectedBatch} />
          </div>
        </div>
      ) : mode === "edit" && selectedBatch ? (
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Manufacturing Traveller</h1>
              <p className="text-zinc-400 text-sm mt-1 font-mono">{selectedBatch.batch_id} — {selectedBatch.product_name}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handlePrint(selectedBatch)}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded-lg transition-colors">
                <Printer className="w-4 h-4" /> Print
              </button>
            </div>
          </div>
          <TravelerForm
            batch={selectedBatch}
            onSave={(formData) => updateMutation.mutate({ id: selectedBatch.id, data: formData })}
            onClose={() => { setMode(null); setSelectedBatch(null); }}
          />
        </div>
      ) : (
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-1">
              <FileText className="w-6 h-6 text-orange-400" />
              <h1 className="text-2xl font-bold text-white">Batch Travellers</h1>
            </div>
            <p className="text-zinc-400 text-sm">Manufacturing Traveller — Form BF-TRV-001 | Edit online or print for floor use</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-zinc-800 mb-6">
            <button
              onClick={() => setActiveTab("travellers")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === "travellers"
                  ? "border-orange-500 text-orange-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <FileText className="w-4 h-4" />
              Travellers
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === "history"
                  ? "border-orange-500 text-orange-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <History className="w-4 h-4" />
              Batch History
            </button>
          </div>

          {activeTab === "history" ? (
            <BatchHistory />
          ) : (
          <>
          {/* Filters */}
          <div className="flex gap-3 mb-6 flex-wrap">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search batch ID or product..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none">
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="started">Started</option>
              <option value="on_hold">On Hold</option>
              <option value="pending_qc">Pending QC</option>
              <option value="in_review">In Review</option>
              <option value="approved">Approved</option>
              <option value="added_to_inventory">Added to Inventory</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-zinc-500">
              <Clock className="w-5 h-5 mr-2 animate-spin" /> Loading batches...
            </div>
          ) : (
            <>
              <BatchGroup title="In Progress" items={inProgress} defaultOpen={true} />
              <BatchGroup title="Completed" items={completed} defaultOpen={false} />
            </>
          )}
          </>
          )}
        </div>
      )}
    </div>
  );
}