import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2 } from "lucide-react";

const STATUS_BADGE = {
  pending_review: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  approved: "bg-green-500/20 text-green-400 border-green-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
};

const STATUS_LABEL = {
  pending_review: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
};

function formatDt(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-CA", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AliasTable({ records, onApprove, onReject, isUpdating }) {
  if (records.length === 0) {
    return <div className="text-center py-12 text-zinc-500 text-sm">No alias records found.</div>;
  }

  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="text-zinc-500 text-xs font-medium">Status</TableHead>
            <TableHead className="text-zinc-500 text-xs font-medium">Primary SKU</TableHead>
            <TableHead className="text-zinc-500 text-xs font-medium">Alias SKU</TableHead>
            <TableHead className="text-zinc-500 text-xs font-medium">Product Name</TableHead>
            <TableHead className="text-zinc-500 text-xs font-medium">Reason</TableHead>
            <TableHead className="text-zinc-500 text-xs font-medium">Reviewed By</TableHead>
            <TableHead className="text-zinc-500 text-xs font-medium">Reviewed At</TableHead>
            <TableHead className="text-zinc-500 text-xs font-medium text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((r) => (
            <TableRow key={r.id} className="border-zinc-800 hover:bg-zinc-800/40">
              <TableCell>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE[r.status] || ""}`}>
                  {STATUS_LABEL[r.status] || r.status}
                </span>
              </TableCell>
              <TableCell className="font-mono text-sm text-zinc-200">{r.primary_sku}</TableCell>
              <TableCell className="font-mono text-sm text-zinc-200">{r.alias_sku}</TableCell>
              <TableCell className="text-sm text-zinc-300">{r.product_name}</TableCell>
              <TableCell className="text-sm text-zinc-400">{r.reason || "—"}</TableCell>
              <TableCell className="text-sm text-zinc-400">{r.reviewed_by || "—"}</TableCell>
              <TableCell className="text-sm text-zinc-400">{formatDt(r.reviewed_at)}</TableCell>
              <TableCell className="text-right">
                {r.status === "pending_review" && (
                  <div className="flex items-center justify-end gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => onApprove(r)} disabled={isUpdating} className="border-green-500/30 text-green-400 hover:bg-green-500/10 h-7 text-xs">
                      {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onReject(r)} disabled={isUpdating} className="border-red-500/30 text-red-400 hover:bg-red-500/10 h-7 text-xs">
                      {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3 mr-1" />}Reject
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}