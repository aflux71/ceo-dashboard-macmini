import React, { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2, Link2, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

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

export default function AliasTable({ records, onApprove, onReject, isUpdating, skuNames = {}, recipes = [], onRecipeLinked }) {
  const [linkingId, setLinkingId] = useState(null);

  const handleLinkRecipe = async (record) => {
    setLinkingId(record.id);
    try {
      // Find recipe(s) using the alias SKU
      const aliasRecipes = recipes.filter(r => r.sku === record.alias_sku && r.active !== false);
      // Find recipe(s) already using the primary SKU
      const primaryRecipes = recipes.filter(r => r.sku === record.primary_sku && r.active !== false);

      if (aliasRecipes.length === 0) {
        toast.error(`No active recipe found for alias SKU ${record.alias_sku}`);
        return;
      }

      // Update the alias recipe's SKU to the primary SKU (link them)
      // If primary already has a recipe, we just add the alias SKU as a note
      for (const r of aliasRecipes) {
        if (primaryRecipes.length === 0) {
          // No primary recipe — remap the alias recipe to the primary SKU
          await base44.entities.Recipe.update(r.id, { sku: record.primary_sku });
          toast.success(`Recipe "${r.name}" remapped from ${record.alias_sku} → ${record.primary_sku}`);
        } else {
          // Primary already has a recipe — mark alias recipe inactive
          await base44.entities.Recipe.update(r.id, { active: false });
          toast.success(`Alias recipe linked: "${r.name}" deactivated in favour of primary SKU recipe`);
        }
      }

      if (onRecipeLinked) onRecipeLinked();
    } catch (err) {
      toast.error(`Link failed: ${err?.message || String(err)}`);
    } finally {
      setLinkingId(null);
    }
  };

  if (records.length === 0) {
    return <div className="text-center py-12 text-zinc-500 text-sm">No alias records found.</div>;
  }

  // Build a quick lookup: which alias SKUs have an active recipe?
  const aliasSkusWithRecipe = new Set(recipes.filter(r => r.active !== false).map(r => r.sku));

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
              <TableCell>
                <div className="font-mono text-sm text-zinc-200">{r.primary_sku}</div>
                {skuNames[r.primary_sku] && <div className="text-xs text-zinc-500 mt-0.5">{skuNames[r.primary_sku]}</div>}
              </TableCell>
              <TableCell>
                <div className="font-mono text-sm text-zinc-200">{r.alias_sku}</div>
                {skuNames[r.alias_sku] && <div className="text-xs text-zinc-500 mt-0.5">{skuNames[r.alias_sku]}</div>}
              </TableCell>
              <TableCell className="text-sm text-zinc-300">{r.product_name}</TableCell>
              <TableCell className="text-sm text-zinc-400">{r.reason || "—"}</TableCell>
              <TableCell className="text-sm text-zinc-400">{r.reviewed_by || "—"}</TableCell>
              <TableCell className="text-sm text-zinc-400">{formatDt(r.reviewed_at)}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  {r.status === "pending_review" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onApprove(r)} disabled={isUpdating} className="border-green-500/30 text-green-400 hover:bg-green-500/10 h-7 text-xs">
                        {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onReject(r)} disabled={isUpdating} className="border-red-500/30 text-red-400 hover:bg-red-500/10 h-7 text-xs">
                        {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3 mr-1" />}Reject
                      </Button>
                    </>
                  )}
                  {r.status === "approved" && aliasSkusWithRecipe.has(r.alias_sku) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleLinkRecipe(r)}
                      disabled={linkingId === r.id}
                      className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 h-7 text-xs"
                      title="Link alias recipe to primary SKU"
                    >
                      {linkingId === r.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Link2 className="w-3 h-3 mr-1" />}
                      Link Recipe
                    </Button>
                  )}
                  {r.status === "approved" && !aliasSkusWithRecipe.has(r.alias_sku) && (
                    <span className="flex items-center gap-1 text-xs text-green-500/60">
                      <CheckCircle2 className="w-3 h-3" /> Linked
                    </span>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}