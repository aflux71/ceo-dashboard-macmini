import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Badge from "@/components/ui/Badge";
import {
  Wrench,
  Plus,
  AlertTriangle,
  Clock,
  CheckCircle,
  Package,
  PlayCircle,
  ChevronRight,
  Trash2,
  Upload,
  Image,
  Video,
  X,
  DollarSign,
  UserPlus,
  Loader2
} from "lucide-react";
import { useFloorPin } from "@/components/auth/FloorPinContext";

const STATUS_CONFIG = {
  new_submission: { label: "New Submission", color: "orange", icon: AlertTriangle },
  queued_for_repair: { label: "Queued for Repair", color: "blue", icon: Clock },
  parts_ordered_waiting: { label: "Parts Ordered/Waiting", color: "purple", icon: Package },
  in_progress: { label: "In Progress", color: "amber", icon: PlayCircle },
  completed: { label: "Completed", color: "green", icon: CheckCircle },
};

const URGENCY_CONFIG = {
  low: { label: "Low", color: "default" },
  medium: { label: "Medium", color: "amber" },
  high: { label: "High", color: "orange" },
  critical: { label: "Critical", color: "red" },
};

export default function EquipmentRepairs() {
  const queryClient = useQueryClient();
  const { floorUser } = useFloorPin();
  const [activeTab, setActiveTab] = useState("new_submission");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [selectedRepair, setSelectedRepair] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [formData, setFormData] = useState({
    equipment_type: "",
    location: "",
    description: "",
    urgency: "medium",
    media_urls: [],
  });
  const [uploading, setUploading] = useState(false);
  const [showReassignDialog, setShowReassignDialog] = useState(null);
  const [reassignData, setReassignData] = useState({ technician: "", reason: "" });
  const [showCostDialog, setShowCostDialog] = useState(null);
  const [costData, setCostData] = useState({
    estimated_parts_cost: 0,
    estimated_labor_hours: 0,
    labor_rate_per_hour: 50,
  });
  const [showPartsDialog, setShowPartsDialog] = useState(null);
  const [partsData, setPartsData] = useState({
    parts_notes: "",
    parts_ordered: [],
  });
  const [newPart, setNewPart] = useState({ part_name: "", quantity: 1, cost: 0, expected_arrival: "" });

  const { data: repairs = [], isLoading } = useQuery({
    queryKey: ["equipment_repairs"],
    queryFn: () => base44.entities.EquipmentRepair.list("-created_date"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.EquipmentRepair.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment_repairs"] });
      setShowNewDialog(false);
      setFormData({ equipment_type: "", location: "", description: "", urgency: "medium", media_urls: [] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EquipmentRepair.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment_repairs"] });
      setSelectedRepair(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.EquipmentRepair.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment_repairs"] });
      setDeleteConfirm(null);
    },
  });

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    setUploading(true);
    const uploadedUrls = [];
    
    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      uploadedUrls.push(file_url);
    }
    
    setFormData(prev => ({
      ...prev,
      media_urls: [...prev.media_urls, ...uploadedUrls]
    }));
    setUploading(false);
  };

  const removeMedia = (index) => {
    setFormData(prev => ({
      ...prev,
      media_urls: prev.media_urls.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = () => {
    createMutation.mutate({
      ...formData,
      status: "new_submission",
      submitted_by: floorUser?.name || "Unknown",
    });
  };

  const handleReassign = (repair) => {
    const history = repair.assignment_history || [];
    history.push({
      technician: repair.assigned_to,
      assigned_date: new Date().toISOString(),
      reassigned_by: floorUser?.name || "Unknown",
      reason: reassignData.reason
    });
    
    updateMutation.mutate({
      id: repair.id,
      data: {
        assigned_to: reassignData.technician,
        assignment_history: history
      }
    });
    setShowReassignDialog(null);
    setReassignData({ technician: "", reason: "" });
  };

  const handleCostEstimate = (repair) => {
    const totalCost = costData.estimated_parts_cost + (costData.estimated_labor_hours * costData.labor_rate_per_hour);
    updateMutation.mutate({
      id: repair.id,
      data: {
        ...costData,
        estimated_total_cost: totalCost
      }
    });
    setShowCostDialog(null);
    setCostData({ estimated_parts_cost: 0, estimated_labor_hours: 0, labor_rate_per_hour: 50 });
  };

  const handleAddPart = () => {
    if (!newPart.part_name) return;
    setPartsData(prev => ({
      ...prev,
      parts_ordered: [...prev.parts_ordered, { ...newPart, order_date: new Date().toISOString(), received: false }]
    }));
    setNewPart({ part_name: "", quantity: 1, cost: 0, expected_arrival: "" });
  };

  const handleSaveParts = (repair) => {
    updateMutation.mutate({
      id: repair.id,
      data: {
        parts_ordered: partsData.parts_ordered,
        parts_notes: partsData.parts_notes,
        status: "parts_ordered_waiting"
      }
    });
    setShowPartsDialog(null);
    setPartsData({ parts_notes: "", parts_ordered: [] });
  };

  const handleStatusChange = (repair, newStatus) => {
    const updateData = { status: newStatus };
    if (newStatus === "completed") {
      updateData.completed_date = new Date().toISOString();
    }
    updateMutation.mutate({ id: repair.id, data: updateData });
  };

  const getNextStatus = (currentStatus) => {
    const statusFlow = ["new_submission", "queued_for_repair", "parts_ordered_waiting", "in_progress", "completed"];
    const currentIndex = statusFlow.indexOf(currentStatus);
    if (currentIndex < statusFlow.length - 1) {
      return statusFlow[currentIndex + 1];
    }
    return null;
  };

  const tabs = [
    { id: "new_submission", label: "New Submissions", count: repairs.filter(r => r.status === "new_submission").length },
    { id: "queued_for_repair", label: "Queued", count: repairs.filter(r => r.status === "queued_for_repair").length },
    { id: "parts_ordered_waiting", label: "Parts Ordered", count: repairs.filter(r => r.status === "parts_ordered_waiting").length },
    { id: "in_progress", label: "In Progress", count: repairs.filter(r => r.status === "in_progress").length },
    { id: "completed", label: "Completed", count: repairs.filter(r => r.status === "completed").length },
  ];

  const filteredRepairs = repairs.filter(r => r.status === activeTab);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wrench className="w-6 h-6 text-orange-400" />
            Equipment Repairs
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Submit and track equipment repair requests</p>
        </div>
        <Button onClick={() => setShowNewDialog(true)} className="bg-orange-500 hover:bg-orange-600">
          <Plus className="w-4 h-4 mr-2" />
          New Repair Request
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const config = STATUS_CONFIG[tab.id];
          const Icon = config.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${activeTab === tab.id
                  ? `bg-${config.color}-500/20 text-${config.color}-400 border border-${config.color}-500/30`
                  : "bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                }
              `}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.count > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.id ? `bg-${config.color}-500/30` : "bg-zinc-700"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Repair List */}
      <div className="space-y-3">
        {isLoading ? (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-8 text-center text-zinc-500">Loading...</CardContent>
          </Card>
        ) : filteredRepairs.length === 0 ? (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-8 text-center text-zinc-500">
              No repairs in this category
            </CardContent>
          </Card>
        ) : (
          filteredRepairs.map((repair) => {
            const statusConfig = STATUS_CONFIG[repair.status];
            const urgencyConfig = URGENCY_CONFIG[repair.urgency];
            const nextStatus = getNextStatus(repair.status);
            const StatusIcon = statusConfig.icon;

            return (
              <Card key={repair.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <StatusIcon className={`w-4 h-4 text-${statusConfig.color}-400`} />
                        <span className="font-medium text-white">{repair.equipment_type}</span>
                        <Badge variant={urgencyConfig.color}>{urgencyConfig.label}</Badge>
                      </div>
                      <p className="text-sm text-zinc-400 truncate">{repair.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500 flex-wrap">
                        <span>Location: {repair.location}</span>
                        <span>By: {repair.submitted_by}</span>
                        {repair.assigned_to && <span>Assigned: {repair.assigned_to}</span>}
                        {repair.estimated_total_cost > 0 && (
                          <span className="text-green-400">Est: ${repair.estimated_total_cost.toFixed(2)}</span>
                        )}
                        {repair.media_urls?.length > 0 && (
                          <span className="flex items-center gap-1 text-blue-400">
                            <Image className="w-3 h-3" /> {repair.media_urls.length}
                          </span>
                        )}
                        {repair.parts_ordered?.length > 0 && (
                          <span className="text-purple-400">{repair.parts_ordered.length} parts</span>
                        )}
                        <span>{new Date(repair.created_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {repair.status === "queued_for_repair" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPartsData({
                              parts_notes: repair.parts_notes || "",
                              parts_ordered: repair.parts_ordered || []
                            });
                            setShowPartsDialog(repair);
                          }}
                          className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                        >
                          <Package className="w-4 h-4 mr-1" />
                          Order Parts
                        </Button>
                      )}
                      {repair.assigned_to && repair.status !== "completed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowReassignDialog(repair)}
                          className="border-zinc-700 hover:bg-zinc-800"
                        >
                          <UserPlus className="w-4 h-4 mr-1" />
                          Reassign
                        </Button>
                      )}
                      {repair.status !== "completed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setCostData({
                              estimated_parts_cost: repair.estimated_parts_cost || 0,
                              estimated_labor_hours: repair.estimated_labor_hours || 0,
                              labor_rate_per_hour: repair.labor_rate_per_hour || 50
                            });
                            setShowCostDialog(repair);
                          }}
                          className="border-green-500/30 text-green-400 hover:bg-green-500/10"
                        >
                          <DollarSign className="w-4 h-4 mr-1" />
                          Cost
                        </Button>
                      )}
                      {nextStatus && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusChange(repair, nextStatus)}
                          className="border-zinc-700 hover:bg-zinc-800"
                        >
                          <ChevronRight className="w-4 h-4 mr-1" />
                          {STATUS_CONFIG[nextStatus].label}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedRepair(repair)}
                        className="text-zinc-400 hover:text-white"
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteConfirm(repair)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* New Repair Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>New Equipment Repair Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Equipment Type</label>
              <Input
                placeholder="e.g., Mixer, Conveyor, Packaging Machine"
                value={formData.equipment_type}
                onChange={(e) => setFormData({ ...formData, equipment_type: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Location</label>
              <Input
                placeholder="e.g., Line 1, Warehouse, Lab"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Urgency</label>
              <Select value={formData.urgency} onValueChange={(v) => setFormData({ ...formData, urgency: v })}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Description of Issue</label>
              <Textarea
                placeholder="Describe the problem in detail..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-zinc-800 border-zinc-700 min-h-[100px]"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Photos/Videos of Issue</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.media_urls.map((url, index) => (
                  <div key={index} className="relative group">
                    {url.match(/\.(mp4|webm|mov)$/i) ? (
                      <div className="w-20 h-20 bg-zinc-800 rounded-lg flex items-center justify-center border border-zinc-700">
                        <Video className="w-8 h-8 text-zinc-500" />
                      </div>
                    ) : (
                      <img src={url} alt="Issue" className="w-20 h-20 object-cover rounded-lg border border-zinc-700" />
                    )}
                    <button
                      type="button"
                      onClick={() => removeMedia(index)}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
              <label className="cursor-pointer">
                <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 border-dashed rounded-lg hover:bg-zinc-700 transition-colors">
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  <span className="text-sm text-zinc-400">
                    {uploading ? "Uploading..." : "Upload photos or videos"}
                  </span>
                </div>
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)} className="border-zinc-700">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.equipment_type || !formData.location || !formData.description}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Repair Dialog */}
      <Dialog open={!!selectedRepair} onOpenChange={() => setSelectedRepair(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Edit Repair Request</DialogTitle>
          </DialogHeader>
          {selectedRepair && (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Status</label>
                <Select
                  value={selectedRepair.status}
                  onValueChange={(v) => setSelectedRepair({ ...selectedRepair, status: v })}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Assigned To</label>
                <Input
                  placeholder="Technician name"
                  value={selectedRepair.assigned_to || ""}
                  onChange={(e) => setSelectedRepair({ ...selectedRepair, assigned_to: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Notes</label>
                <Textarea
                  placeholder="Add notes or updates..."
                  value={selectedRepair.notes || ""}
                  onChange={(e) => setSelectedRepair({ ...selectedRepair, notes: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRepair(null)} className="border-zinc-700">
              Cancel
            </Button>
            <Button
              onClick={() => {
                const updateData = {
                  status: selectedRepair.status,
                  assigned_to: selectedRepair.assigned_to,
                  notes: selectedRepair.notes,
                };
                if (selectedRepair.status === "completed" && !selectedRepair.completed_date) {
                  updateData.completed_date = new Date().toISOString();
                }
                updateMutation.mutate({ id: selectedRepair.id, data: updateData });
              }}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Repair Request?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this repair request. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deleteConfirm.id)}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reassign Dialog */}
      <Dialog open={!!showReassignDialog} onOpenChange={() => setShowReassignDialog(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Reassign Repair Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Current Technician</label>
              <p className="text-white">{showReassignDialog?.assigned_to || "Unassigned"}</p>
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">New Technician</label>
              <Input
                placeholder="Enter technician name"
                value={reassignData.technician}
                onChange={(e) => setReassignData({ ...reassignData, technician: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Reason for Reassignment</label>
              <Textarea
                placeholder="Why is this being reassigned?"
                value={reassignData.reason}
                onChange={(e) => setReassignData({ ...reassignData, reason: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            {showReassignDialog?.assignment_history?.length > 0 && (
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Assignment History</label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {showReassignDialog.assignment_history.map((h, i) => (
                    <div key={i} className="text-xs text-zinc-500 bg-zinc-800 p-2 rounded">
                      <span className="text-zinc-300">{h.technician}</span> - {h.reason}
                      <div className="text-zinc-600">{new Date(h.assigned_date).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReassignDialog(null)} className="border-zinc-700">
              Cancel
            </Button>
            <Button
              onClick={() => handleReassign(showReassignDialog)}
              disabled={!reassignData.technician}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cost Estimation Dialog */}
      <Dialog open={!!showCostDialog} onOpenChange={() => setShowCostDialog(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Cost Estimation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Estimated Parts Cost ($)</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={costData.estimated_parts_cost}
                onChange={(e) => setCostData({ ...costData, estimated_parts_cost: parseFloat(e.target.value) || 0 })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Estimated Labor Hours</label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={costData.estimated_labor_hours}
                onChange={(e) => setCostData({ ...costData, estimated_labor_hours: parseFloat(e.target.value) || 0 })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Labor Rate ($/hour)</label>
              <Input
                type="number"
                min="0"
                step="1"
                value={costData.labor_rate_per_hour}
                onChange={(e) => setCostData({ ...costData, labor_rate_per_hour: parseFloat(e.target.value) || 0 })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="p-3 bg-zinc-800 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Parts:</span>
                <span>${costData.estimated_parts_cost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Labor ({costData.estimated_labor_hours}h × ${costData.labor_rate_per_hour}):</span>
                <span>${(costData.estimated_labor_hours * costData.labor_rate_per_hour).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold mt-2 pt-2 border-t border-zinc-700">
                <span>Total:</span>
                <span className="text-green-400">
                  ${(costData.estimated_parts_cost + (costData.estimated_labor_hours * costData.labor_rate_per_hour)).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCostDialog(null)} className="border-zinc-700">
              Cancel
            </Button>
            <Button
              onClick={() => handleCostEstimate(showCostDialog)}
              className="bg-green-500 hover:bg-green-600"
            >
              Save Estimate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Parts Ordered Dialog */}
      <Dialog open={!!showPartsDialog} onOpenChange={() => setShowPartsDialog(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-xl">
          <DialogHeader>
            <DialogTitle>Order Parts</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Parts Notes</label>
              <Textarea
                placeholder="Notes about parts needed..."
                value={partsData.parts_notes}
                onChange={(e) => setPartsData({ ...partsData, parts_notes: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-2 block">Add Part</label>
              <div className="grid grid-cols-4 gap-2">
                <Input
                  placeholder="Part name"
                  value={newPart.part_name}
                  onChange={(e) => setNewPart({ ...newPart, part_name: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 col-span-2"
                />
                <Input
                  type="number"
                  placeholder="Qty"
                  min="1"
                  value={newPart.quantity}
                  onChange={(e) => setNewPart({ ...newPart, quantity: parseInt(e.target.value) || 1 })}
                  className="bg-zinc-800 border-zinc-700"
                />
                <Input
                  type="number"
                  placeholder="Cost"
                  min="0"
                  step="0.01"
                  value={newPart.cost}
                  onChange={(e) => setNewPart({ ...newPart, cost: parseFloat(e.target.value) || 0 })}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <Input
                  type="date"
                  placeholder="Expected arrival"
                  value={newPart.expected_arrival}
                  onChange={(e) => setNewPart({ ...newPart, expected_arrival: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 flex-1"
                />
                <Button onClick={handleAddPart} disabled={!newPart.part_name} className="bg-purple-500 hover:bg-purple-600">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {partsData.parts_ordered.length > 0 && (
              <div>
                <label className="text-sm text-zinc-400 mb-2 block">Parts List</label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {partsData.parts_ordered.map((part, i) => (
                    <div key={i} className="flex items-center justify-between bg-zinc-800 p-2 rounded-lg">
                      <div>
                        <span className="text-white">{part.part_name}</span>
                        <span className="text-zinc-400 text-sm ml-2">x{part.quantity}</span>
                        {part.expected_arrival && (
                          <span className="text-zinc-500 text-xs ml-2">ETA: {part.expected_arrival}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-green-400">${part.cost.toFixed(2)}</span>
                        <button
                          onClick={() => setPartsData(prev => ({
                            ...prev,
                            parts_ordered: prev.parts_ordered.filter((_, idx) => idx !== i)
                          }))}
                          className="text-red-400 hover:text-red-300"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-right mt-2 text-sm">
                  <span className="text-zinc-400">Total: </span>
                  <span className="text-green-400 font-bold">
                    ${partsData.parts_ordered.reduce((sum, p) => sum + p.cost * p.quantity, 0).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPartsDialog(null)} className="border-zinc-700">
              Cancel
            </Button>
            <Button
              onClick={() => handleSaveParts(showPartsDialog)}
              className="bg-purple-500 hover:bg-purple-600"
            >
              Save & Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}