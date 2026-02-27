import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Bug, AlertTriangle, CheckCircle, Clock } from "lucide-react";

const priorityConfig = {
  low: { bg: "bg-blue-500/20 text-blue-400", label: "Low" },
  medium: { bg: "bg-amber-500/20 text-amber-400", label: "Medium" },
  high: { bg: "bg-orange-500/20 text-orange-400", label: "High" },
  critical: { bg: "bg-red-500/20 text-red-400", label: "Critical" },
};

const statusConfig = {
  open: { bg: "bg-amber-500/20 text-amber-400", label: "Open" },
  in_progress: { bg: "bg-blue-500/20 text-blue-400", label: "In Progress" },
  resolved: { bg: "bg-green-500/20 text-green-400", label: "Resolved" },
  closed: { bg: "bg-zinc-500/20 text-zinc-400", label: "Closed" },
};

const defaultForm = {
  title: "",
  description: "",
  priority: "medium",
  category: "",
  status: "open",
  submitted_by: "",
  assigned_to: "",
  resolution_notes: "",
};

export default function BugReports() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingBug, setEditingBug] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const { data: bugs = [], isLoading } = useQuery({
    queryKey: ["bug_reports"],
    queryFn: () => base44.entities.BugReport.list("-created_date"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.BugReport.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bug_reports"] }); closeDialog(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BugReport.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bug_reports"] }); closeDialog(); },
  });

  const openCreate = () => { setEditingBug(null); setForm(defaultForm); setShowDialog(true); };
  const openEdit = (bug) => { setEditingBug(bug); setForm({ ...defaultForm, ...bug }); setShowDialog(true); };
  const closeDialog = () => { setShowDialog(false); setEditingBug(null); setForm(defaultForm); };

  const handleSubmit = () => {
    if (editingBug) {
      updateMutation.mutate({ id: editingBug.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const filtered = bugs.filter(b => {
    const matchesStatus = statusFilter === "all" || b.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || b.priority === priorityFilter;
    const matchesSearch = !searchTerm ||
      b.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.category?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesPriority && matchesSearch;
  });

  const openCount = bugs.filter(b => b.status === "open").length;
  const inProgressCount = bugs.filter(b => b.status === "in_progress").length;
  const resolvedCount = bugs.filter(b => b.status === "resolved").length;
  const criticalCount = bugs.filter(b => b.priority === "critical" && b.status !== "resolved" && b.status !== "closed").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Bug Reports</h1>
          <p className="text-zinc-500 text-sm mt-1">Track and manage reported issues</p>
        </div>
        <Button onClick={openCreate} className="bg-orange-500 hover:bg-orange-600">
          <Plus className="w-4 h-4 mr-2" />
          New Bug Report
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 rounded-lg"><Clock className="w-5 h-5 text-amber-400" /></div>
              <div><p className="text-2xl font-bold text-zinc-100">{openCount}</p><p className="text-xs text-zinc-500">Open</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg"><Bug className="w-5 h-5 text-blue-400" /></div>
              <div><p className="text-2xl font-bold text-zinc-100">{inProgressCount}</p><p className="text-xs text-zinc-500">In Progress</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg"><CheckCircle className="w-5 h-5 text-green-400" /></div>
              <div><p className="text-2xl font-bold text-zinc-100">{resolvedCount}</p><p className="text-xs text-zinc-500">Resolved</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-lg"><AlertTriangle className="w-5 h-5 text-red-400" /></div>
              <div><p className="text-2xl font-bold text-zinc-100">{criticalCount}</p><p className="text-xs text-zinc-500">Critical</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input placeholder="Search by title or category..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 bg-zinc-900 border-zinc-800" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 bg-zinc-900 border-zinc-800"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-36 bg-zinc-900 border-zinc-800"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-base">Bug Reports ({filtered.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-zinc-500 text-center py-8">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-zinc-500 text-center py-8">No bug reports found</p>
          ) : (
            <div className="space-y-3">
              {filtered.map((bug) => (
                <div key={bug.id} className="p-4 rounded-lg border bg-zinc-800/50 border-zinc-700 cursor-pointer hover:border-zinc-600 transition-colors" onClick={() => openEdit(bug)}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-zinc-200 font-medium">{bug.title}</span>
                        {bug.priority && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityConfig[bug.priority]?.bg}`}>{priorityConfig[bug.priority]?.label}</span>}
                        {bug.status && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusConfig[bug.status]?.bg}`}>{statusConfig[bug.status]?.label}</span>}
                        {bug.category && <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">{bug.category}</span>}
                      </div>
                      {bug.description && <p className="text-sm text-zinc-400 line-clamp-2">{bug.description}</p>}
                      <div className="flex items-center gap-4 text-xs text-zinc-500 mt-2">
                        {bug.submitted_by && <span>By: {bug.submitted_by}</span>}
                        {bug.assigned_to && <span>Assigned: {bug.assigned_to}</span>}
                        {bug.created_date && <span>{new Date(bug.created_date).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBug ? "Edit Bug Report" : "New Bug Report"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="Brief description of the bug" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="Detailed description..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="e.g. UI, Backend, Performance" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Submitted By</Label>
                <Input value={form.submitted_by} onChange={(e) => setForm({ ...form, submitted_by: e.target.value })} className="bg-zinc-800 border-zinc-700" />
              </div>
              <div className="space-y-2">
                <Label>Assigned To</Label>
                <Input value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className="bg-zinc-800 border-zinc-700" />
              </div>
            </div>
            {(form.status === "resolved" || form.status === "closed") && (
              <div className="space-y-2">
                <Label>Resolution Notes</Label>
                <Textarea value={form.resolution_notes} onChange={(e) => setForm({ ...form, resolution_notes: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="How was this resolved?" rows={2} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.title || createMutation.isPending || updateMutation.isPending} className="bg-orange-500 hover:bg-orange-600">
              {editingBug ? "Save Changes" : "Submit Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}