import React from "react";

export default function BatchTraveller({ batch, recipe }) {
  function fmt(dateStr) {
    if (!dateStr) return "___________";
    return new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00")
      .toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
  }
  function lineLabel(line) {
    if (line === 1) return "Line 1"; if (line === 2) return "Line 2";
    if (line === 3) return "Melter 1"; if (line === 4) return "Melter 2";
    return line ? `Line ${line}` : "___________";
  }

  const stages = [
    { label: "Batching",  dateKey: "batch_date",  operatorKey: "operator" },
    { label: "QC Hold",   dateKey: "qc_date",      operatorKey: null },
    { label: "Filling",   dateKey: "fill_date",    operatorKey: "fill_operator" },
  ];

  return (
    <div className="print-traveller bg-white text-black">
      <style>{`
        @media print {
          @page { margin: 0.4in; size: letter; }
          body * { visibility: hidden; }
          .print-traveller, .print-traveller * { visibility: visible; }
          .print-traveller { position: absolute; left: 0; top: 0; width: 100%; background: white !important; color: black !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        .print-traveller { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.5; }
        .trav-box { border: 2px solid #333; border-radius: 4px; padding: 12px 16px; margin-bottom: 12px; }
        .trav-label { font-size: 10px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; }
        .trav-val { font-weight: bold; font-size: 14px; border-bottom: 1px solid #d1d5db; min-height: 22px; padding-bottom: 2px; }
        .stage-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
        .stage-box { border: 1px solid #d1d5db; border-radius: 4px; padding: 10px; }
        .stage-title { font-weight: bold; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; margin-bottom: 8px; padding-bottom: 4px; }
        .sig-row { margin-top: 6px; }
        .sig-line { border-bottom: 1px solid #374151; display: inline-block; min-width: 120px; }
        .ingr-mini { width: 100%; border-collapse: collapse; font-size: 11px; }
        .ingr-mini th, .ingr-mini td { border: 1px solid #d1d5db; padding: 5px 8px; }
        .ingr-mini th { background: #f3f4f6; font-weight: bold; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "3px solid #111", paddingBottom: 10, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: "bold" }}>{batch?.product_name || recipe?.name}</div>
          <div style={{ color: "#6b7280", fontSize: 12 }}>SKU: {batch?.sku || recipe?.sku} &nbsp;|&nbsp; {recipe?.category || ""}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: "bold", fontSize: 13, letterSpacing: "0.05em" }}>BATCH TRAVELLER</div>
          <div style={{ color: "#6b7280", fontSize: 11 }}>{new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
        </div>
      </div>

      {/* Core info grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div>
          <div className="trav-label">Batch ID</div>
          <div className="trav-val">{batch?.batch_id || ""}</div>
        </div>
        <div>
          <div className="trav-label">Batch Size (units)</div>
          <div className="trav-val">{batch?.quantity?.toLocaleString() || recipe?.batch_size || ""}</div>
        </div>
        <div>
          <div className="trav-label">Production Line</div>
          <div className="trav-val">{lineLabel(batch?.production_line || recipe?.production_line)}</div>
        </div>
        <div>
          <div className="trav-label">Operator</div>
          <div className="trav-val">{batch?.operator || ""}</div>
        </div>
        <div>
          <div className="trav-label">Batch Date</div>
          <div className="trav-val">{fmt(batch?.production_date)}</div>
        </div>
        <div>
          <div className="trav-label">Expiry Date</div>
          <div className="trav-val">{fmt(batch?.expiry_date)}</div>
        </div>
      </div>

      {/* Lot number */}
      <div style={{ marginBottom: 14 }}>
        <div className="trav-label">Finished Product Lot #</div>
        <div className="trav-val" style={{ fontSize: 16 }}>{batch?.finished_product_lot_number || ""}</div>
      </div>

      {/* Ingredients mini-table */}
      {recipe?.ingredients?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: "bold", fontSize: 11, textTransform: "uppercase", marginBottom: 4, color: "#374151" }}>Ingredients</div>
          <table className="ingr-mini">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Material</th>
                <th style={{ textAlign: "right" }}>Target Qty</th>
                <th>Unit</th>
                <th>Lot #</th>
                <th>Actual Qty</th>
              </tr>
            </thead>
            <tbody>
              {recipe.ingredients.map((ing, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: "monospace" }}>{ing.sku}</td>
                  <td>{ing.material}</td>
                  <td style={{ textAlign: "right", fontWeight: "bold" }}>{ing.qty}</td>
                  <td>{ing.unit}</td>
                  <td style={{ minWidth: 70 }}></td>
                  <td style={{ minWidth: 70 }}></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stage sign-off boxes */}
      <div className="stage-row" style={{ marginBottom: 14 }}>
        {stages.map((s) => (
          <div className="stage-box" key={s.label}>
            <div className="stage-title">{s.label}</div>
            <div className="sig-row"><span className="trav-label">Date: </span><span className="sig-line">{s.dateKey && batch?.[s.dateKey] ? fmt(batch[s.dateKey]) : ""}</span></div>
            {s.operatorKey && <div className="sig-row" style={{ marginTop: 8 }}><span className="trav-label">By: </span><span className="sig-line">{batch?.[s.operatorKey] || ""}</span></div>}
            <div className="sig-row" style={{ marginTop: 8 }}><span className="trav-label">Initials: </span><span className="sig-line" style={{ minWidth: 80 }}></span></div>
          </div>
        ))}
      </div>

      {/* Final sign-off */}
      <div style={{ border: "2px solid #374151", borderRadius: 4, padding: "12px 16px", background: "#f9fafb", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          <div style={{ fontWeight: "bold", marginBottom: 8 }}>QC Approved By</div>
          <div className="sig-row">Name: <span className="sig-line"></span></div>
          <div className="sig-row" style={{ marginTop: 8 }}>Signature: <span className="sig-line"></span></div>
          <div className="sig-row" style={{ marginTop: 8 }}>Date: <span className="sig-line" style={{ minWidth: 100 }}></span></div>
        </div>
        <div>
          <div style={{ fontWeight: "bold", marginBottom: 8 }}>Notes / Deviations</div>
          <div style={{ borderBottom: "1px solid #d1d5db", marginBottom: 8, minHeight: 18 }}></div>
          <div style={{ borderBottom: "1px solid #d1d5db", marginBottom: 8, minHeight: 18 }}></div>
          <div style={{ borderBottom: "1px solid #d1d5db", minHeight: 18 }}></div>
        </div>
      </div>
    </div>
  );
}