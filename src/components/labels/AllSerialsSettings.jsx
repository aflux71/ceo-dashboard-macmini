import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/Badge";
import { Search, Hash, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { formatSerial, formatSerialRange } from "./serialUtils";

// Settings-tab view: flat list of every serial range ever received across every label.
// Useful for auditing the full serial number history in one place.
export default function AllSerialsSettings() {
  const [search, setSearch] = useState("");

  const { data: labels = [], isLoading } = useQuery({
    queryKey: ["labels"],
    queryFn: () => base44.entities.Label.list(),
  });

  // Flatten every serial_range across every label into a single sortable list.
  const rows = useMemo(() => {
    const all = [];
    for (const label of labels) {
      for (const r of label.serial_ranges || []) {
        all.push({
          label_id: label.id,
          label_name: label.name,
          label_sku: label.sku,
          product_name: label.product_name,
          ...r,
        });
      }
    }
    // newest first
    all.sort((a, b) => {
      const ad = a.received_date || "";
      const bd = b.received_date || "";
      return bd.localeCompare(ad);
    });
    return all;
  }, [labels]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.label_name?.toLowerCase().includes(q) ||
        r.label_sku?.toLowerCase().includes(q) ||
        r.product_name?.toLowerCase().includes(q) ||
        r.po_number?.toLowerCase().includes(q) ||
        r.serial_prefix?.toLowerCase().includes(q) ||
        formatSerial(r.serial_prefix, r.serial_start, r.serial_padding || 4)
          .toLowerCase()
          .includes(q) ||
        formatSerial(r.serial_prefix, r.serial_end, r.serial_padding || 4)
          .toLowerCase()
          .includes(q)
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    let total = 0;
    let used = 0;
    for (const r of rows) {
      total += Number(r.quantity || 0);
      used += Number(r.quantity_used || 0);
    }
    return { total, used, remaining: total - used };
  }, [rows]);

  const exportCSV = () => {
    const headers = [
      "Label",
      "SKU",
      "Product",
      "PO Number",
      "Prefix",
      "Start",
      "End",
      "Range",
      "Quantity",
      "Used",
      "Remaining",
      "Received Date",
    ];
    const lines = [headers.join(",")];
    for (const r of filtered) {
      const remaining = Number(r.quantity || 0) - Number(r.quantity_used || 0);
      lines.push(
        [
          r.label_name || "",
          r.label_sku || "",
          r.product_name || "",
          r.po_number || "",
          r.serial_prefix || "",
          r.serial_start ?? "",
          r.serial_end ?? "",
          formatSerialRange(r.serial_prefix, r.serial_start, r.serial_end, r.serial_padding || 4),
          r.quantity ?? 0,
          r.quantity_used ?? 0,
          remaining,
          r.received_date || "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `label-serials-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Hash className="w-5 h-5 text-orange-400" />
            All Serial Numbers
          </h2>
          <p className="text-zinc-500 text-sm mt-1">
            Complete history of every serial range received across all labels
          </p>
        </div>
        <Button
          variant="outline"
          onClick={exportCSV}
          disabled={filtered.length === 0}
          className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
        >
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-3">
            <p className="text-zinc-500 text-xs">Total Serials</p>
            <p className="text-lg font-bold text-white">{totals.total.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-3">
            <p className="text-zinc-500 text-xs">Used</p>
            <p className="text-lg font-bold text-amber-400">{totals.used.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-3">
            <p className="text-zinc-500 text-xs">Remaining</p>
            <p className="text-lg font-bold text-green-400">{totals.remaining.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          placeholder="Search by label, SKU, PO, prefix, or serial number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-zinc-900 border-zinc-700"
        />
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Received</TableHead>
                <TableHead className="text-zinc-400">Label</TableHead>
                <TableHead className="text-zinc-400">PO</TableHead>
                <TableHead className="text-zinc-400">Serial Range</TableHead>
                <TableHead className="text-zinc-400 text-right">Qty</TableHead>
                <TableHead className="text-zinc-400 text-right">Used</TableHead>
                <TableHead className="text-zinc-400 text-right">Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-zinc-500 py-8">Loading...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-zinc-500 py-8">
                    {rows.length === 0 ? "No serial ranges recorded yet" : "No matches"}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r, idx) => {
                  const used = Number(r.quantity_used || 0);
                  const remaining = Number(r.quantity || 0) - used;
                  return (
                    <TableRow key={`${r.label_id}-${idx}`} className="border-zinc-800">
                      <TableCell className="text-zinc-400 text-xs">
                        {r.received_date ? format(new Date(r.received_date), "MMM d, yyyy") : "-"}
                      </TableCell>
                      <TableCell>
                        <p className="text-white text-sm">{r.label_name}</p>
                        <p className="text-xs text-zinc-500">{r.label_sku}</p>
                      </TableCell>
                      <TableCell className="text-zinc-300 text-sm">{r.po_number || "-"}</TableCell>
                      <TableCell className="text-zinc-300 text-sm font-mono">
                        {formatSerialRange(r.serial_prefix, r.serial_start, r.serial_end, r.serial_padding || 4)}
                      </TableCell>
                      <TableCell className="text-right text-white">{r.quantity}</TableCell>
                      <TableCell className="text-right text-amber-400">{used}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={remaining === 0 ? "red" : remaining < r.quantity * 0.2 ? "amber" : "green"}>
                          {remaining}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}