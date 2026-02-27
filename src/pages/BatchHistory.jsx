import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Search,
  Filter,
  Eye,
  Check,
  X,
  Download,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle
} from "lucide-react";
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