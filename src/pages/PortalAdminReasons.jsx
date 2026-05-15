import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Lock, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import AdjustmentReasonDialog from "@/components/portal-admin/AdjustmentReasonDialog";

export default function PortalAdminReasons() {
  const [currentUser, setCurrentUser] = useState(undefined);
  const [reasons, setReasons] = useState([]);
  const [usageCounts, setUsageCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBlocked, setDeleteBlocked] = useState(false);

  const load = async () => {
    setLoading(true);
    const [list, allAdjustments] = await Promise.all([
      base44.entities.InventoryAdjustmentReason.list("display_order", 200),
      base44.entities.InventoryAdjustment.list("-created_date", 5000)
    ]);
    const counts = {};
    (allAdjustments || []).forEach((a) => {
      if (a.adjustment_reason_id) {
        counts[a.adjustment_reason_id] = (counts[a.adjustment_reason_id] || 0) + 1;
      }
    });
    setReasons(list || []);
    setUsageCounts(counts);
    setLoading(false);
  };

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => setCurrentUser(null));
    load();
  }, []);

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.InventoryAdjustmentReason.update(editing.id, data);
    } else {
      await base44.entities.InventoryAdjustmentReason.create(data);
    }
    setEditing(null);
    await load();
  };

  const handleToggleActive = async (reason) => {
    await base44.entities.InventoryAdjustmentReason.update(reason.id, {
      is_active: !reason.is_active
    });
    await load();
  };

  const requestDelete = (reason) => {
    const count = usageCounts[reason.id] || 0;
    if (count > 0) {
      setDeleteBlocked(true);
      setDeleteTarget(reason);
    } else {
      setDeleteBlocked(false);
      setDeleteTarget(reason);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteBlocked) return;
    await base44.entities.InventoryAdjustmentReason.delete(deleteTarget.id);
    setDeleteTarget(null);
    await load();
  };

  if (currentUser === undefined) return null;
  if (currentUser?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <Lock className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Admin Access Required</h2>
          <p className="text-zinc-400 text-sm">Adjustment reasons are managed by ERP administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory Adjustment Reasons</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Manage reason options shown to stores when submitting inventory adjustments
          </p>
        </div>
        <Button
          onClick={() => { setEditing(null); setDialogOpen(true); }}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Plus className="w-4 h-4 mr-2" /> Add Reason
        </Button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/60 text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">Label</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-center">Active</th>
              <th className="px-3 py-2 text-right">Display Order</th>
              <th className="px-3 py-2 text-right">Usage</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="px-3 py-8 text-center text-zinc-500">Loading...</td></tr>
            ) : reasons.length === 0 ? (
              <tr><td colSpan="6" className="px-3 py-8 text-center text-zinc-500">No reasons defined yet</td></tr>
            ) : reasons.map((r) => {
              const usage = usageCounts[r.id] || 0;
              return (
                <tr key={r.id} className="border-t border-zinc-800 hover:bg-zinc-800/30">
                  <td className="px-3 py-2 text-white font-medium">{r.label}</td>
                  <td className="px-3 py-2 text-zinc-400">{r.description || "—"}</td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex justify-center">
                      <Switch
                        checked={!!r.is_active}
                        onCheckedChange={() => handleToggleActive(r)}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-300">{r.display_order ?? 0}</td>
                  <td className="px-3 py-2 text-right">
                    {usage > 0 ? (
                      <Badge className="bg-zinc-800 text-zinc-300 border border-zinc-700 text-[10px]">
                        {usage} record{usage === 1 ? "" : "s"}
                      </Badge>
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setEditing(r); setDialogOpen(true); }}
                        className="text-zinc-400 hover:text-white"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => requestDelete(r)}
                        className="text-zinc-400 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AdjustmentReasonDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}
        reason={editing}
        onSave={handleSave}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {deleteBlocked ? (
                <><AlertTriangle className="w-5 h-5 text-amber-400" /> Cannot Delete</>
              ) : (
                <>Delete Reason</>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-zinc-300 space-y-2">
            {deleteBlocked ? (
              <>
                <p>
                  This reason has existing adjustment records and cannot be deleted. You can deactivate it instead.
                </p>
                <p className="text-zinc-500 text-xs">
                  "{deleteTarget?.label}" is linked to {usageCounts[deleteTarget?.id] || 0} adjustment record{(usageCounts[deleteTarget?.id] || 0) === 1 ? "" : "s"}.
                </p>
              </>
            ) : (
              <p>Delete "{deleteTarget?.label}"? This cannot be undone.</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            >
              {deleteBlocked ? "Close" : "Cancel"}
            </Button>
            {!deleteBlocked && (
              <Button
                onClick={confirmDelete}
                className="bg-red-500 hover:bg-red-600 text-white"
              >
                Delete
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}