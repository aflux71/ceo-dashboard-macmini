import React, { useState, useRef, useMemo } from "react";
import Papa from "papaparse";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Badge from "@/components/ui/Badge";
import { Upload, Printer, ClipboardList, X, AlertTriangle, FileDown } from "lucide-react";

/**
 * Pick & Pack panel — upload an order CSV, resolve SKUs to bin locations,
 * and print a pick list.
 *
 * Accepted CSV columns (case-insensitive, flexible):
 *  - SKU       (required) : sku | item_sku | code | product_sku
 *  - Quantity  (optional) : qty | quantity | units | count   (defaults to 1)
 *  - Name      (optional) : name | product | description     (used as fallback)
 */
export default function PickPackPanel({ inventory = [], bins = [] }) {
  const [orderName, setOrderName] = useState("");
  const [items, setItems] = useState([]); // [{sku, name, qty, location, found}]
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const binByName = useMemo(() => {
    const map = {};
    bins.forEach(b => { if (b.name) map[b.name.toLowerCase()] = b; });
    return map;
  }, [bins]);

  const skuIndex = useMemo(() => {
    const map = {};
    inventory.forEach(i => { if (i.sku) map[i.sku.toLowerCase()] = i; });
    return map;
  }, [inventory]);

  const findCol = (row, candidates) => {
    const keys = Object.keys(row);
    for (const c of candidates) {
      const k = keys.find(k => k.toLowerCase().trim() === c);
      if (k) return row[k];
    }
    return undefined;
  };

  const handleFile = (file) => {
    if (!file) return;
    setError("");
    setOrderName(file.name.replace(/\.csv$/i, ""));

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data?.length) {
          setError("CSV is empty or has no rows.");
          return;
        }
        const parsed = results.data.map((row) => {
          const sku = (findCol(row, ["sku", "item_sku", "code", "product_sku"]) || "").toString().trim();
          const qty = parseFloat(findCol(row, ["qty", "quantity", "units", "count"])) || 1;
          const csvName = (findCol(row, ["name", "product", "description"]) || "").toString().trim();
          const inv = sku ? skuIndex[sku.toLowerCase()] : null;
          return {
            sku,
            name: inv?.name || csvName || "(unknown)",
            qty,
            location: inv?.location || "",
            found: !!inv,
          };
        }).filter(r => r.sku);

        if (!parsed.length) {
          setError("No valid SKU rows found. Make sure your CSV has a 'sku' column.");
          return;
        }
        setItems(parsed);
      },
      error: (err) => setError(`Parse error: ${err.message}`),
    });
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    handleFile(file);
    e.target.value = "";
  };

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      // Items without locations go last
      if (!a.location && b.location) return 1;
      if (a.location && !b.location) return -1;
      return (a.location || "").localeCompare(b.location || "");
    });
  }, [items]);

  const stats = useMemo(() => ({
    total: items.length,
    found: items.filter(i => i.found && i.location).length,
    missingLoc: items.filter(i => i.found && !i.location).length,
    notFound: items.filter(i => !i.found).length,
    totalQty: items.reduce((s, i) => s + (i.qty || 0), 0),
  }), [items]);

  const clear = () => { setItems([]); setOrderName(""); setError(""); };

  const downloadTemplate = () => {
    const csv = "sku,quantity,name\nRM-001,2,Example Item\nRM-002,1,Another Item\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pick-pack-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (!sortedItems.length) return;
    const today = new Date().toLocaleString();
    const rows = sortedItems.map((it, idx) => {
      const bin = binByName[(it.location || "").toLowerCase()];
      const color = bin?.color || "#999";
      const locCell = it.location
        ? `<span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:2px;margin-right:6px;vertical-align:middle;"></span><strong>${it.location}</strong>`
        : `<span style="color:#c00;">⚠ no location</span>`;
      const skuCell = it.found
        ? `<span style="font-family:monospace;">${it.sku}</span>`
        : `<span style="font-family:monospace;color:#c00;">${it.sku} (not in inventory)</span>`;
      return `
        <tr>
          <td style="text-align:center;">${idx + 1}</td>
          <td style="text-align:center;"><input type="checkbox" style="width:18px;height:18px;"/></td>
          <td>${locCell}</td>
          <td>${skuCell}</td>
          <td>${it.name || ""}</td>
          <td style="text-align:center;font-weight:600;font-size:14px;">${it.qty}</td>
        </tr>
      `;
    }).join("");

    const html = `<!DOCTYPE html><html><head><title>Pick List - ${orderName}</title>
      <style>
        @page { size: letter; margin: 0.5in; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; padding: 16px; }
        h1 { font-size: 22px; margin: 0 0 4px; }
        .meta { color: #555; font-size: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; vertical-align: middle; }
        th { background: #f3f4f6; font-weight: 600; }
        tr:nth-child(even) td { background: #fafafa; }
        .signatures { margin-top: 32px; display: flex; gap: 60px; font-size: 12px; }
        .sig { flex: 1; }
        .sig-line { border-top: 1px solid #333; margin-top: 36px; padding-top: 4px; color: #555; }
      </style></head><body>
        <h1>Pick & Pack List${orderName ? `: ${orderName}` : ""}</h1>
        <div class="meta">
          <span><strong>Date:</strong> ${today}</span>
          <span><strong>Items:</strong> ${stats.total} · <strong>Total Units:</strong> ${stats.totalQty}</span>
        </div>
        <table>
          <thead><tr>
            <th style="width:30px;">#</th>
            <th style="width:30px;">✓</th>
            <th style="width:110px;">Bin / Rack</th>
            <th style="width:120px;">SKU</th>
            <th>Item</th>
            <th style="width:60px;">Qty</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="signatures">
          <div class="sig"><div class="sig-line">Picked By</div></div>
          <div class="sig"><div class="sig-line">Packed By</div></div>
          <div class="sig"><div class="sig-line">Date / Time</div></div>
        </div>
      </body></html>`;

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.onload = () => w.print();
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-orange-400" />
            Pick & Pack
          </h3>
          {items.length > 0 && (
            <button onClick={clear} className="text-zinc-500 hover:text-zinc-300" title="Clear">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <>
            <p className="text-xs text-zinc-500">
              Upload an order CSV — we'll resolve each SKU to its bin location and generate a printable pick list.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => fileRef.current?.click()}
                className="bg-orange-500 hover:bg-orange-600 flex-1"
              >
                <Upload className="w-4 h-4 mr-2" /> Upload Order CSV
              </Button>
              <Button
                onClick={downloadTemplate}
                variant="outline"
                className="border-zinc-700 text-zinc-300"
                title="Download CSV template"
              >
                <FileDown className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[11px] text-zinc-600">
              Required column: <span className="font-mono">sku</span>. Optional: <span className="font-mono">quantity</span>, <span className="font-mono">name</span>.
            </p>
            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 flex gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
              </div>
            )}
          </>
        ) : (
          <>
            <Input
              value={orderName}
              onChange={(e) => setOrderName(e.target.value)}
              placeholder="Order / reference name"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm"
            />

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-zinc-800 rounded p-2">
                <div className="text-zinc-500">Lines</div>
                <div className="text-zinc-100 font-semibold">{stats.total}</div>
              </div>
              <div className="bg-zinc-800 rounded p-2">
                <div className="text-zinc-500">Located</div>
                <div className="text-green-400 font-semibold">{stats.found}</div>
              </div>
              <div className="bg-zinc-800 rounded p-2">
                <div className="text-zinc-500">Issues</div>
                <div className="text-amber-400 font-semibold">{stats.missingLoc + stats.notFound}</div>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-1 border border-zinc-800 rounded p-1">
              {sortedItems.map((it, idx) => {
                const bin = binByName[(it.location || "").toLowerCase()];
                return (
                  <div key={idx} className="flex items-center gap-2 text-xs bg-zinc-800 rounded p-2">
                    {it.location ? (
                      <div className="flex items-center gap-1.5 min-w-[64px]">
                        <span
                          className="inline-block w-2 h-2 rounded-sm shrink-0"
                          style={{ backgroundColor: bin?.color || "#52525b" }}
                        />
                        <span className="font-mono text-zinc-200">{it.location}</span>
                      </div>
                    ) : (
                      <Badge variant={it.found ? "amber" : "red"} className="min-w-[64px] justify-center">
                        {it.found ? "no loc" : "not in inv"}
                      </Badge>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-200 truncate">{it.name}</p>
                      <p className="text-[10px] text-zinc-500 font-mono truncate">{it.sku}</p>
                    </div>
                    <span className="text-zinc-100 font-semibold">×{it.qty}</span>
                  </div>
                );
              })}
            </div>

            <Button onClick={handlePrint} className="w-full bg-orange-500 hover:bg-orange-600">
              <Printer className="w-4 h-4 mr-2" /> Print Pick List
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}