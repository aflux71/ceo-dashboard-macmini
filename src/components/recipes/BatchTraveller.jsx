import React from "react";

export default function BatchTraveller({ batch, recipe }) {
  function fmt(dateStr) {
    if (!dateStr) return "";
    try {
      return new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00")
        .toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
    } catch { return dateStr; }
  }

  function lineLabel(line) {
    if (line === 1) return "Line 1"; if (line === 2) return "Line 2";
    if (line === 3) return "Melter 1"; if (line === 4) return "Melter 2";
    return line ? `Line ${line}` : "";
  }

  const s = {
    page: { fontFamily: "Arial, sans-serif", fontSize: 12, lineHeight: 1.5, color: "#111", background: "#fff", padding: 0 },
    header: { borderBottom: "3px solid #111", paddingBottom: 10, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
    label: { fontSize: 9, textTransform: "uppercase", color: "#6b7280", letterSpacing: "0.06em", marginBottom: 2 },
    val: { fontWeight: "bold", fontSize: 13, borderBottom: "1px solid #9ca3af", minHeight: 22, paddingBottom: 2, marginBottom: 0 },
    grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 16px", marginBottom: 14 },
    sectionTitle: { fontWeight: "bold", fontSize: 10, textTransform: "uppercase", color: "#374151", background: "#f3f4f6", padding: "5px 8px", border: "1px solid #d1d5db", marginBottom: 0 },
    table: { width: "100%", borderCollapse: "collapse", marginBottom: 14, fontSize: 11 },
    th: { border: "1px solid #d1d5db", padding: "5px 8px", background: "#f3f4f6", fontWeight: "bold", textAlign: "left" },
    td: { border: "1px solid #d1d5db", padding: "5px 8px" },
    stageBox: { border: "1px solid #d1d5db", borderRadius: 4, padding: 10 },
    stageTitle: { fontWeight: "bold", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid #e5e7eb", paddingBottom: 4, marginBottom: 8 },
    sigRow: { marginBottom: 10 },
    sigLine: { borderBottom: "1px solid #374151", display: "inline-block", minWidth: 120 },
    approvalBox: { border: "2px solid #374151", borderRadius: 4, padding: "12px 16px", background: "#f9fafb" },
  };

  const ingredients = recipe?.ingredients || [];
  const packaging = recipe?.packaging || [];

  return (
    <div style={s.page}>
      <style>{`
        body { margin: 0; padding: 0; }
        * { box-sizing: border-box; }
      `}</style>

      <div className="print-traveller" style={s.page}>

        {/* Header */}
        <div style={s.header}>
          <div>
            <div style={{ fontSize: 20, fontWeight: "bold", marginBottom: 2 }}>{batch?.product_name || recipe?.name || "—"}</div>
            <div style={{ color: "#6b7280", fontSize: 11 }}>SKU: {batch?.sku || recipe?.sku || "—"}&nbsp; | &nbsp;{recipe?.category || ""}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: "bold", fontSize: 12, letterSpacing: "0.05em" }}>BATCH TRAVELLER</div>
            <div style={{ color: "#6b7280", fontSize: 11 }}>{new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
          </div>
        </div>

        {/* Core info */}
        <div style={s.grid3}>
          {[
            ["Batch ID", batch?.batch_id],
            ["Batch Size (units)", batch?.quantity?.toLocaleString() || recipe?.batch_size],
            ["Production Line", lineLabel(batch?.production_line || recipe?.production_line)],
            ["Operator", batch?.operator],
            ["Batch Date", fmt(batch?.production_date)],
            ["Expiry Date", fmt(batch?.expiry_date)],
          ].map(([lbl, val]) => (
            <div key={lbl}>
              <div style={s.label}>{lbl}</div>
              <div style={s.val}>{val || ""}</div>
            </div>
          ))}
        </div>

        {/* Lot number */}
        <div style={{ marginBottom: 16 }}>
          <div style={s.label}>Finished Product Lot #</div>
          <div style={{ ...s.val, fontSize: 15 }}>{batch?.finished_product_lot_number || ""}</div>
        </div>

        {/* Ingredients */}
        {ingredients.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={s.sectionTitle}>Ingredients / Bill of Materials</div>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>SKU</th>
                  <th style={s.th}>Material</th>
                  <th style={{ ...s.th, textAlign: "right" }}>Target Qty</th>
                  <th style={s.th}>Unit</th>
                  <th style={s.th}>Lot #</th>
                  <th style={s.th}>Actual Qty</th>
                  <th style={s.th}>Verified</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ing, i) => (
                  <tr key={i}>
                    <td style={{ ...s.td, fontFamily: "monospace" }}>{ing.sku}</td>
                    <td style={s.td}>{ing.material}</td>
                    <td style={{ ...s.td, textAlign: "right", fontWeight: "bold" }}>{ing.qty}</td>
                    <td style={s.td}>{ing.unit}</td>
                    <td style={{ ...s.td, minWidth: 70 }}></td>
                    <td style={{ ...s.td, minWidth: 70 }}></td>
                    <td style={{ ...s.td, minWidth: 60, textAlign: "center" }}>□</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Packaging */}
        {packaging.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={s.sectionTitle}>Packaging Components</div>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>SKU</th>
                  <th style={s.th}>Item</th>
                  <th style={{ ...s.th, textAlign: "right" }}>Qty / Unit</th>
                  <th style={{ ...s.th, textAlign: "right" }}>Qty / Batch</th>
                  <th style={s.th}>Verified</th>
                </tr>
              </thead>
              <tbody>
                {packaging.map((pkg, i) => (
                  <tr key={i}>
                    <td style={{ ...s.td, fontFamily: "monospace" }}>{pkg.sku}</td>
                    <td style={s.td}>{pkg.name}</td>
                    <td style={{ ...s.td, textAlign: "right", fontWeight: "bold" }}>{pkg.qty_per_unit}</td>
                    <td style={{ ...s.td, textAlign: "right", fontWeight: "bold" }}>{pkg.qty_per_batch ?? (pkg.qty_per_unit * (batch?.quantity || recipe?.batch_size || 0))}</td>
                    <td style={{ ...s.td, minWidth: 60, textAlign: "center" }}>□</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* No recipe warning */}
        {!recipe && (
          <div style={{ border: "1px dashed #d1d5db", borderRadius: 4, padding: 12, marginBottom: 14, color: "#6b7280", fontSize: 11 }}>
            No recipe linked — ingredients and packaging not available for this SKU.
          </div>
        )}

        {/* Stage sign-off boxes */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
          {[
            { label: "Batching", dateVal: fmt(batch?.production_date), byVal: batch?.operator },
            { label: "QC Hold",  dateVal: fmt(batch?.qc_date),         byVal: "" },
            { label: "Filling",  dateVal: fmt(batch?.fill_date),        byVal: batch?.fill_operator },
          ].map((st) => (
            <div key={st.label} style={s.stageBox}>
              <div style={s.stageTitle}>{st.label}</div>
              <div style={s.sigRow}>
                <span style={s.label}>Date: </span><br />
                <span style={{ ...s.sigLine, minWidth: 130 }}>{st.dateVal}</span>
              </div>
              <div style={s.sigRow}>
                <span style={s.label}>By: </span><br />
                <span style={{ ...s.sigLine, minWidth: 130 }}>{st.byVal}</span>
              </div>
              <div style={s.sigRow}>
                <span style={s.label}>Initials: </span><br />
                <span style={{ ...s.sigLine, minWidth: 80 }}></span>
              </div>
            </div>
          ))}
        </div>

        {/* Final sign-off */}
        <div style={s.approvalBox}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <div style={{ fontWeight: "bold", marginBottom: 10 }}>QC Approved By</div>
              {["Name", "Signature", "Date"].map((f) => (
                <div key={f} style={{ marginBottom: 10 }}>
                  <span style={s.label}>{f}: </span><br />
                  <span style={{ ...s.sigLine, minWidth: f === "Date" ? 100 : 160 }}></span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontWeight: "bold", marginBottom: 10 }}>Notes / Deviations</div>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ borderBottom: "1px solid #d1d5db", minHeight: 22, marginBottom: 8 }}></div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}