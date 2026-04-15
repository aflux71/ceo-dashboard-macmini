import React, { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X, Loader2, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  const [linkDialog, setLinkDialog] = useState(null); // { record }
  const [recipeSearch, setRecipeSearch] = useState("");
  const [selectedRecipe, setSelectedRecipe] = useState(null);

  const activeRecipes = recipes.filter(r => r.active !== false);

  const filteredRecipes = activeRecipes.filter(r =>
    !recipeSearch ||
    r.name?.toLowerCase().includes(recipeSearch.toLowerCase()) ||
    r.sku?.toLowerCase().includes(recipeSearch.toLowerCase())
  );

  const openLinkDialog = (record) => {
    setLinkDialog(record);
    setRecipeSearch("");
    setSelectedRecipe(null);
  };

  const handleLinkRecipe = async () => {
    if (!linkDialog || !selectedRecipe) return;
    setLinkingId(linkDialog.id);
    try {
      const primaryRecipes = activeRecipes.filter(r => r.sku === linkDialog.primary_sku);

      if (primaryRecipes.length === 0) {
        // Remap the chosen recipe's SKU to the primary SKU
        await base44.entities.Recipe.update(selectedRecipe.id, { sku: linkDialog.primary_sku });
        toast.success(`Recipe "${selectedRecipe.name}" remapped to primary SKU ${linkDialog.primary_sku}`);
      } else {
        // Primary already has a recipe — deactivate the alias recipe
        await base44.entities.Recipe.update(selectedRecipe.id, { active: false });
        toast.success(`"${selectedRecipe.name}" linked and deactivated in favour of primary SKU recipe`);
      }

      if (onRecipeLinked) onRecipeLinked();
      setLinkDialog(null);
    } catch (err) {
      toast.error(`Link failed: ${err?.message || String(err)}`);
    } finally {
      setLinkingId(null);
    }
  };

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
                  {r.status === "approved" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openLinkDialog(r)}
                      disabled={linkingId === r.id}
                      className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 h-7 text-xs"
                      title="Manually link a recipe to the primary SKU"
                    >
                      {linkingId === r.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Link2 className="w-3 h-3 mr-1" />}
                      Link Recipe
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>

    {/* Link Recipe Dialog */}
    <Dialog open={!!linkDialog} onOpenChange={(open) => { if (!open) setLinkDialog(null); }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-400" />
            Link Recipe to Primary SKU
          </DialogTitle>
        </DialogHeader>
        {linkDialog && (
          <div className="space-y-4 py-1">
            <div className="p-3 bg-zinc-800 rounded-lg text-sm space-y-1">
              <p><span className="text-zinc-500">Primary SKU:</span> <span className="font-mono text-orange-400">{linkDialog.primary_sku}</span></p>
              <p><span className="text-zinc-500">Alias SKU:</span> <span className="font-mono text-zinc-300">{linkDialog.alias_sku}</span></p>
              <p className="text-xs text-zinc-500 mt-1">Select the recipe associated with the alias SKU. It will be remapped to the primary SKU.</p>
            </div>

            <Input
              placeholder="Search by recipe name or SKU..."
              value={recipeSearch}
              onChange={(e) => setRecipeSearch(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
              autoFocus
            />

            <div className="max-h-64 overflow-y-auto space-y-1">
              {filteredRecipes.length === 0 && (
                <p className="text-xs text-zinc-500 text-center py-4">No recipes found</p>
              )}
              {filteredRecipes.map(r => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRecipe(r)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedRecipe?.id === r.id
                      ? "bg-blue-500/20 border border-blue-500/40 text-blue-300"
                      : "hover:bg-zinc-800 text-zinc-300"
                  }`}
                >
                  <span className="font-mono text-xs text-orange-400 mr-2">{r.sku}</span>
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setLinkDialog(null)} className="border-zinc-700">Cancel</Button>
          <Button
            onClick={handleLinkRecipe}
            disabled={!selectedRecipe || linkingId === linkDialog?.id}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {linkingId ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
            Link Recipe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}