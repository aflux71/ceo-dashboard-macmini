import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Search,
  Check,
  X,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  ClipboardEdit,
  Loader2,
  MinusCircle
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import Badge from "@/components/ui/Badge";
import BatchDocument from "@/components/batch/BatchDocument";

export default function BatchHistory() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [showDocModal, setShowDocModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditBatch, setAuditBatch] = useState(null);
  const [auditForm, setAuditForm] = useState({ notes: "", quantity_adjustment: "", adjustment_reason: "", new_status: "" });
  const [auditUser, setAuditUser] = useState(null);

  React.useEffect(() => { base44.auth.me().then(setAuditUser).catch(() => {}); }, []);

  const queryClient = useQueryClient();

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['batches'],
    queryFn: () => base44.entities.Batch.list('-created_date'),
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id }) => {
      const user = await base44.auth.me();
      return base44.entities.Batch.update(id, {
        status: 'approved',
        approved_by: user.full_name || user.email,
        approved_date: new Date().toISOString()
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['batches'] })
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => base44.entities.Batch.update(id, {
      status: 'rejected',
      rejection_reason: reason
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      setShowRejectModal(false);
      setRejectReason("");
    }
  });

  const filtered = batches.filter(batch => {
    const matchesSearch = !search || 
      batch.batch_id?.toLowerCase().includes(search.toLowerCase()) ||
      batch.product_name?.toLowerCase().includes(search.toLowerCase()) ||
      batch.sku?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || batch.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved':
        return <Badge variant="green"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'added_to_inventory':
        return <Badge variant="green"><CheckCircle className="w-3 h-3 mr-1" />Added to Inventory</Badge>;
      case 'in_progress':
        return <Badge variant="blue"><Clock className="w-3 h-3 mr-1" />In Progress</Badge>;
      case 'rejected':
        return <Badge variant="red"><AlertCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      case 'pending_qc':
        return <Badge variant="amber"><Clock className="w-3 h-3 mr-1" />Pending QC</Badge>;
      default:
        return <Badge variant="default"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const openRejectModal = (batch) => {
    setSelectedBatch(batch);
    setShowRejectModal(true);
  };

  const auditMutation = useMutation({
    mutationFn: async ({ batch, form }) => {
      const user = await base44.auth.me();
      const auditNote = `[AUDIT ${new Date().toLocaleString("en-CA")} by ${user.full_name || user.email}]`;
      const updates = {};

      if (form.new_status && form.new_status !== batch.status) updates.status = form.new_status;
      if (form.notes.trim()) updates.notes = [batch.notes, `${auditNote} ${form.notes.trim()}`].filter(Boolean).join("\n");

      if (form.quantity_adjustment && form.adjustment_reason) {
        const adj = Number(form.quantity_adjustment);
        const newQty = (batch.actual_yield_units ?? batch.quantity ?? 0) + adj;
        updates.actual_yield_units = newQty;
        updates.deviation_notes = [batch.deviation_notes, `${auditNote} Qty adjusted by ${adj > 0 ? "+" : ""}${adj}: ${form.adjustment_reason}`].filter(Boolean).join("\n");
        updates.qty_override_by = user.full_name || user.email;
        updates.qty_override_at = new Date().toISOString();

        // Create inventory deduction if negative adjustment
        if (adj < 0) {
          await base44.entities.Inventory.filter({ sku: batch.sku }).then(async (items) => {
            if (items.length > 0) {
              const inv = items[0];
              await base44.entities.Inventory.update(inv.id, { quantity: Math.max(0, (inv.quantity || 0) + adj) });
            }
          }).catch(() => {});
        }
      }

      if (Object.keys(updates).length > 0) await base44.entities.Batch.update(batch.id, updates);

      // Log to AuditLog
      await base44.entities.AuditLog.create({
        action: "batch_audit",
        category: "production",
        description: `Batch ${batch.batch_id} audited by ${user.full_name || user.email}. ${form.notes || ""}`.trim(),
        entity_type: "Batch",
        entity_id: batch.id,
        performed_by_name: user.full_name || user.email,
        performed_by_role: user.role,
      }).catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      setShowAuditModal(false);
      setAuditForm({ notes: "", quantity_adjustment: "", adjustment_reason: "", new_status: "" });
    },
  });

  const openAuditModal = (batch) => {
    setAuditBatch(batch);
    setAuditForm({ notes: "", quantity_adjustment: "", adjustment_reason: "", new_status: batch.status });
    setShowAuditModal(true);
  };

  const openDocModal = (batch) => {
    setSelectedBatch(batch);
    setShowDocModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Batch History</h1>
          <p className="text-zinc-500 text-sm mt-1">
            View and manage production batch records
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search by batch ID, product, or SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-zinc-800 border-zinc-700 text-zinc-100"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48 bg-zinc-800 border-zinc-700 text-zinc-100">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="pending_qc">Pending QC</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="added_to_inventory">Added to Inventory</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Batches Table */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-800/50">
                  <th className="text-left p-4 text-xs font-semibold text-zinc-400 uppercase">Batch ID</th>
                  <th className="text-left p-4 text-xs font-semibold text-zinc-400 uppercase">Product</th>
                  <th className="text-right p-4 text-xs font-semibold text-zinc-400 uppercase">Quantity</th>
                  <th className="text-left p-4 text-xs font-semibold text-zinc-400 uppercase">Operator</th>
                  <th className="text-left p-4 text-xs font-semibold text-zinc-400 uppercase">Date</th>
                  <th className="text-left p-4 text-xs font-semibold text-zinc-400 uppercase">Status</th>
                  <th className="text-right p-4 text-xs font-semibold text-zinc-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-zinc-500">Loading...</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-zinc-500">No batches found</td>
                  </tr>
                ) : (
                  filtered.map((batch) => (
                    <tr key={batch.id} className="border-b border-zinc-800 hover:bg-zinc-800/30">
                      <td className="p-4">
                        <span className="font-mono text-sm font-semibold text-orange-400">
                          {batch.batch_id}
                        </span>
                      </td>
                      <td className="p-4">
                        <div>
                          <p className="text-zinc-200">{batch.product_name}</p>
                          <p className="text-xs text-zinc-500">{batch.sku}</p>
                        </div>
                      </td>
                      <td className="p-4 text-right text-zinc-200 font-semibold">
                        {batch.quantity?.toLocaleString()} units
                      </td>
                      <td className="p-4 text-zinc-400">{batch.operator}</td>
                      <td className="p-4 text-zinc-400 text-sm">
                        {batch.production_date ? new Date(batch.production_date).toLocaleDateString() : 
                         new Date(batch.created_date).toLocaleDateString()}
                      </td>
                      <td className="p-4">{getStatusBadge(batch.status)}</td>
                      <td className="p-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openDocModal(batch)}
                            className="text-zinc-400 hover:text-zinc-100"
                            title="View Documents"
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                          {["admin", "qc", "owner", "production_lead"].includes(auditUser?.role) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openAuditModal(batch)}
                              className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                              title="Audit / Edit"
                            >
                              <ClipboardEdit className="w-4 h-4" />
                            </Button>
                          )}
                          {(batch.status === 'pending' || batch.status === 'pending_qc') && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => approveMutation.mutate({ id: batch.id })}
                                className="text-green-500 hover:text-green-400"
                                title="Approve"
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openRejectModal(batch)}
                                className="text-red-500 hover:text-red-400"
                                title="Reject"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Document Modal */}
      <Dialog open={showDocModal} onOpenChange={setShowDocModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Batch Documents - {selectedBatch?.batch_id}</DialogTitle>
          </DialogHeader>
          {selectedBatch && <BatchDocument batch={selectedBatch} />}
        </DialogContent>
      </Dialog>

      {/* Audit Modal */}
      <Dialog open={showAuditModal} onOpenChange={setShowAuditModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardEdit className="w-4 h-4 text-amber-400" />
              Audit Batch — <span className="font-mono text-orange-400">{auditBatch?.batch_id}</span>
            </DialogTitle>
          </DialogHeader>
          {auditBatch && (
            <div className="space-y-4 py-1">
              <div className="p-3 rounded-lg bg-zinc-800 text-sm text-zinc-300 space-y-1">
                <p><span className="text-zinc-500">Product:</span> {auditBatch.product_name}</p>
                <p><span className="text-zinc-500">Current Qty:</span> {(auditBatch.actual_yield_units ?? auditBatch.quantity)?.toLocaleString()} units</p>
                <p><span className="text-zinc-500">Status:</span> {auditBatch.status}</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Override Status</Label>
                <Select value={auditForm.new_status} onValueChange={(v) => setAuditForm(f => ({ ...f, new_status: v }))}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="started">Started</SelectItem>
                    <SelectItem value="pending_qc">Pending QC</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="added_to_inventory">Added to Inventory</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs flex items-center gap-1.5">
                  <MinusCircle className="w-3.5 h-3.5 text-red-400" />
                  Inventory Quantity Adjustment <span className="text-zinc-600">(negative = deduction)</span>
                </Label>
                <Input
                  type="number"
                  placeholder="e.g. -5 to remove 5 units"
                  value={auditForm.quantity_adjustment}
                  onChange={(e) => setAuditForm(f => ({ ...f, quantity_adjustment: e.target.value }))}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
                />
              </div>

              {auditForm.quantity_adjustment && (
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Reason for Adjustment *</Label>
                  <Input
                    placeholder="e.g. QC failure, damaged units..."
                    value={auditForm.adjustment_reason}
                    onChange={(e) => setAuditForm(f => ({ ...f, adjustment_reason: e.target.value }))}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9 text-sm"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Audit Notes</Label>
                <Textarea
                  placeholder="Add audit notes, observations, or corrections..."
                  value={auditForm.notes}
                  onChange={(e) => setAuditForm(f => ({ ...f, notes: e.target.value }))}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 resize-none"
                  rows={3}
                />
              </div>

              {auditForm.quantity_adjustment && Number(auditForm.quantity_adjustment) < 0 && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  This will deduct {Math.abs(Number(auditForm.quantity_adjustment))} units from the linked inventory SKU <span className="font-mono">{auditBatch.sku}</span>.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAuditModal(false)} className="border-zinc-700">Cancel</Button>
            <Button
              onClick={() => auditMutation.mutate({ batch: auditBatch, form: auditForm })}
              disabled={auditMutation.isPending || (!!auditForm.quantity_adjustment && !auditForm.adjustment_reason)}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {auditMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ClipboardEdit className="w-4 h-4 mr-2" />}
              Save Audit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-zinc-400">
              Please provide a reason for rejecting batch <span className="text-orange-400 font-mono">{selectedBatch?.batch_id}</span>
            </p>
            <Textarea
              placeholder="Enter rejection reason..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="bg-zinc-800 border-zinc-700 min-h-24"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectModal(false)}>Cancel</Button>
            <Button 
              className="bg-red-500 hover:bg-red-600"
              onClick={() => rejectMutation.mutate({ id: selectedBatch.id, reason: rejectReason })}
              disabled={!rejectReason.trim()}
            >
              Reject Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}