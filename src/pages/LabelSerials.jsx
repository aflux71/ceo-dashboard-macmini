import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/Badge";
import { Hash, Search, History, Plus } from "lucide-react";
import { format } from "date-fns";
import { formatSerialRange } from "@/components/labels/serialUtils";
import LogSerialUsageDialog from "@/components/labels/LogSerialUsageDialog";

export default function LabelSerials() {
  const [search, setSearch] = useState("");
  const [logLabel, setLogLabel] = useState(null);
  const [historyLabel, setHistoryLabel] = useState(null);
  const qc = useQueryClient();

  const { data: labels = [], isLoading } = useQuery({
    queryKey: ["labels"],
    queryFn: () => base44.entities.Label.list(),
  });

  const { data: usage = [] } = useQuery({
    queryKey: ["labelSerialUsage"],
    queryFn: () => base44.entities.LabelSerialUsage.list("-created_date"),
  });

  // Only show labels that have at least one serial range
  const labelsWithRanges = useMemo(() => {
    return labels
      .filter((l) => (l.serial_ranges || []).length > 0)
      .filter((l) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          l.name?.toLowerCase().includes(q) ||
          l.sku?.toLowerCase().includes(q) ||
          (l.serial_ranges || []).some(
            (r) =>
              r.po_number?.toLowerCase().includes(q) ||
              r.serial_prefix?.toLowerCase().includes(q)
          )
        );
      });
  }, [labels, search]);

  const usageByLabel = useMemo(() => {
    const m = new Map();
    for (const u of usage) {
      if (!m.has(u.label_id)) m.set(u.label_id, []);
      m.get(u.label_id).push(u);
    }
    return m;
  }, [usage]);

  const totals = useMemo(() => {
    let totalSerials = 0;
    let totalUsed = 0;
    for (const l of labels) {
      for (const r of l.serial_ranges || []) {
        totalSerials += Number(r.quantity || 0);
        totalUsed += Number(r.quantity_used || 0);
      }
    }
    return { totalSerials, totalUsed, totalRemaining: totalSerials - totalUsed };
  }, [labels]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Hash className="w-7 h-7 text-orange-400" />
            Label Serial Tracking
          </h1>
          <p className="text-zinc-400 mt-1">Track serial number ranges received and consumed</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-zinc-400 text-sm">Total Serials Received</p>
            <p className="text-xl font-bold text-white">{totals.totalSerials.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-zinc-400 text-sm">Used</p>
            <p className="text-xl font-bold text-amber-400">{totals.totalUsed.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-zinc-400 text-sm">Remaining</p>
            <p className="text-xl font-bold text-green-400">{totals.totalRemaining.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          placeholder="Search by label, SKU, PO number or prefix..."
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
                <TableHead className="text-zinc-400">Label</TableHead>
                <TableHead className="text-zinc-400">PO</TableHead>
                <TableHead className="text-zinc-400">Range</TableHead>
                <TableHead className="text-zinc-400 text-right">Total</TableHead>
                <TableHead className="text-zinc-400 text-right">Used</TableHead>
                <TableHead className="text-zinc-400 text-right">Remaining</TableHead>
                <TableHead className="text-zinc-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-zinc-500 py-8">Loading...</TableCell></TableRow>
              ) : labelsWithRanges.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-zinc-500 py-8">No serial ranges recorded yet</TableCell></TableRow>
              ) : (
                labelsWithRanges.flatMap((label) =>
                  (label.serial_ranges || []).map((r, idx) => {
                    const used = Number(r.quantity_used || 0);
                    const remaining = Number(r.quantity || 0) - used;
                    return (
                      <TableRow key={`${label.id}-${idx}`} className="border-zinc-800">
                        <TableCell>
                          <p className="text-white text-sm">{label.name}</p>
                          <p className="text-xs text-zinc-500">{label.sku}</p>
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
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setLogLabel(label)}
                              className="text-orange-400 hover:text-orange-300 h-7"
                            >
                              <Plus className="w-3 h-3 mr-1" /> Log
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setHistoryLabel(label)}
                              className="text-zinc-400 hover:text-white h-7"
                            >
                              <History className="w-3 h-3 mr-1" /> History
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <LogSerialUsageDialog
        open={!!logLabel}
        label={logLabel}
        onClose={() => setLogLabel(null)}
        onLogged={() => {
          qc.invalidateQueries({ queryKey: ["labels"] });
          qc.invalidateQueries({ queryKey: ["labelSerialUsage"] });
        }}
      />

      <UsageHistoryDialog
        label={historyLabel}
        usage={historyLabel ? usageByLabel.get(historyLabel.id) || [] : []}
        onClose={() => setHistoryLabel(null)}
      />
    </div>
  );
}

function UsageHistoryDialog({ label, usage, onClose }) {
  if (!label) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-zinc-800">
          <h2 className="text-white font-bold">Usage History — {label.name}</h2>
          <p className="text-xs text-zinc-500">{label.sku}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {usage.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-6">No usage recorded yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead className="text-zinc-400 text-xs">Date</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Range</TableHead>
                  <TableHead className="text-zinc-400 text-xs text-right">Qty</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Used For</TableHead>
                  <TableHead className="text-zinc-400 text-xs">By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.map((u) => (
                  <TableRow key={u.id} className="border-zinc-800">
                    <TableCell className="text-xs text-zinc-300">
                      {u.created_date ? format(new Date(u.created_date), "MMM d, yyyy") : "-"}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-300 font-mono">
                      {formatSerialRange(u.serial_prefix, u.serial_start, u.serial_end, u.serial_padding || 4)}
                    </TableCell>
                    <TableCell className="text-xs text-white text-right">{u.quantity}</TableCell>
                    <TableCell className="text-xs text-zinc-300">{u.used_for || "-"}</TableCell>
                    <TableCell className="text-xs text-zinc-500">{u.used_by || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <div className="p-4 border-t border-zinc-800 flex justify-end">
          <Button variant="outline" onClick={onClose} className="border-zinc-700">Close</Button>
        </div>
      </div>
    </div>
  );
}