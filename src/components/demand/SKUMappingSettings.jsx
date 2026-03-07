import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowRight, Check, X, Plus, Loader2, Trash2, AlertTriangle, Link2
} from "lucide-react";
import { toast } from "sonner";

export default function SKUMappingSettings() {
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newMapping, setNewMapping] = useState({ old_sku: "", new_sku: "", product_name: "", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadMappings();
  }, []);

  const loadMappings = async () => {
    setLoading(true);
    const data = await base44.entities.SKUMapping.list("-created_date", 100);
    setMappings(data);
    setLoading(false);
  };

  const pendingCount = mappings.filter(m => m.status === "pending").length;

  const handleAdd = async () => {
    if (!newMapping.old_sku.trim() || !newMapping.new_sku.trim()) {
      toast.error("Both old and new SKU are required");
      return;
    }
    setSaving(true);
    await base44.entities.SKUMapping.create({
      ...newMapping,
      status: "pending",
      detected_by: "manual",
    });
    toast.success("SKU mapping added — awaiting approval");
    setNewMapping({ old_sku: "", new_sku: "", product_name: "", notes: "" });
    setShowAdd(false);
    setSaving(false);
    loadMappings();
  };

  const handleApprove = async (mapping) => {
    const user = await base44.auth.me();
    await base44.entities.SKUMapping.update(mapping.id, {
      status: "approved",
      approved_by: user?.email || "unknown",
      approved_date: new Date().toISOString(),
    });
    toast.success(`Mapping approved: ${mapping.old_sku} → ${mapping.new_sku}`);
    loadMappings();
  };

  const handleReject = async (mapping) => {
    await base44.entities.SKUMapping.update(mapping.id, { status: "rejected" });
    toast.success("Mapping rejected");
    loadMappings();
  };

  const handleDelete = async (mapping) => {
    await base44.entities.SKUMapping.delete(mapping.id);
    toast.success("Mapping deleted");
    loadMappings();
  };

  const statusColor = {
    pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    approved: "bg-green-500/20 text-green-400 border-green-500/30",
    rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  return (
    <div className="space-y-4">
      {/* Pending Alert */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-300">
              {pendingCount} SKU mapping{pendingCount !== 1 ? "s" : ""} pending approval
            </p>
            <p className="text-[10px] text-amber-400/70">
              Approve mappings to prevent duplicate inventory records during Shopify sync.
            </p>
          </div>
        </div>
      )}

      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-orange-400" />
              SKU / UPC Mappings
              <span className="text-xs text-zinc-500 font-normal">
                ({mappings.length} total)
              </span>
            </h3>
            <Button
              size="sm"
              onClick={() => setShowAdd(true)}
              className="h-7 text-xs bg-orange-600 hover:bg-orange-500 text-white"
            >
              <Plus className="w-3 h-3 mr-1" /> Add Mapping
            </Button>
          </div>

          <p className="text-[10px] text-zinc-500 mb-4">
            When a product's UPC or SKU changes in Shopify, add a mapping here so the sync doesn't create duplicates. 
            Only <span className="text-green-400">approved</span> mappings are used by the inventory sync.
          </p>

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
            </div>
          ) : mappings.length === 0 ? (
            <p className="text-xs text-zinc-500 py-4 text-center">
              No SKU mappings yet. Add one when a product's UPC/SKU changes in Shopify.
            </p>
          ) : (
            <div className="space-y-2">
              {mappings.map((m) => (
                <div
                  key={m.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    m.status === "pending"
                      ? "bg-amber-500/5 border-amber-500/20"
                      : "bg-zinc-800/50 border-zinc-800"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-zinc-400">{m.old_sku}</span>
                      <ArrowRight className="w-3 h-3 text-zinc-600" />
                      <span className="font-mono text-xs text-zinc-200">{m.new_sku}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${statusColor[m.status]}`}>
                        {m.status}
                      </span>
                      {m.detected_by === "auto" && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded-full">auto</span>
                      )}
                    </div>
                    {m.product_name && (
                      <p className="text-[10px] text-zinc-500 mt-1">{m.product_name}</p>
                    )}
                    {m.notes && (
                      <p className="text-[10px] text-zinc-600 mt-0.5 italic">{m.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    {m.status === "pending" && (
                      <>
                        <button
                          onClick={() => handleApprove(m)}
                          className="p-1.5 text-green-400 hover:bg-green-500/10 rounded"
                          title="Approve"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleReject(m)}
                          className="p-1.5 text-red-400 hover:bg-red-500/10 rounded"
                          title="Reject"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDelete(m)}
                      className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-700 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Mapping Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-orange-400" />
              Add SKU Mapping
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase mb-1">Old SKU / UPC</label>
              <Input
                placeholder="e.g. 628451285953"
                value={newMapping.old_sku}
                onChange={(e) => setNewMapping(p => ({ ...p, old_sku: e.target.value }))}
                className="h-8 bg-zinc-800 border-zinc-700 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase mb-1">New SKU / UPC</label>
              <Input
                placeholder="e.g. 628451999999"
                value={newMapping.new_sku}
                onChange={(e) => setNewMapping(p => ({ ...p, new_sku: e.target.value }))}
                className="h-8 bg-zinc-800 border-zinc-700 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase mb-1">Product Name (optional)</label>
              <Input
                placeholder="e.g. Lavender Pillow Spray 50ml"
                value={newMapping.product_name}
                onChange={(e) => setNewMapping(p => ({ ...p, product_name: e.target.value }))}
                className="h-8 bg-zinc-800 border-zinc-700 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase mb-1">Notes (optional)</label>
              <Input
                placeholder="Reason for change..."
                value={newMapping.notes}
                onChange={(e) => setNewMapping(p => ({ ...p, notes: e.target.value }))}
                className="h-8 bg-zinc-800 border-zinc-700 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} className="border-zinc-700">
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={saving}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add (Pending Approval)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}