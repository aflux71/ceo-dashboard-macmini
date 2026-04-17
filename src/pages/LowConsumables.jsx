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
import Badge from "@/components/ui/Badge";
import {
  Package,
  Plus,
  Check,
  Clock,
  CheckCircle,
  AlertTriangle,
  Pencil,
  Trash2,
  X,
  Save
} from "lucide-react";
import { useFloorPin } from "@/components/auth/FloorPinContext";

const CONSUMABLE_ITEMS = [
  "Gloves (S)",
  "Gloves (M)",
  "Gloves (L)",
  "Gloves (XL)",
  "Tissue Paper",
  "Sponges",
  "Paper Towels",
  "Cleaning Spray",
  "Sanitizer",
  "Masks",
  "Hair Nets",
  "Aprons",
  "Other"
];

const STATUS_CONFIG = {
  pending: { label: "Pending", variant: "amber", icon: Clock },
  acknowledged: { label: "Acknowledged", variant: "blue", icon: Check },
  restocked: { label: "Restocked", variant: "green", icon: CheckCircle },
};

export default function LowConsumables() {
  const { floorUser } = useFloorPin();
  const queryClient = useQueryClient();
  const [selectedItem, setSelectedItem] = useState("");
  const [customItem, setCustomItem] = useState("");
  const [notes, setNotes] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ item_name: "", notes: "" });

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["consumable-reports"],
    queryFn: () => base44.entities.ConsumableReport.list("-created_date", 50),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ConsumableReport.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consumable-reports"] });
      setSelectedItem("");
      setCustomItem("");
      setNotes("");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ConsumableReport.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["consumable-reports"] }),
  });

  const handleSubmit = () => {
    const itemName = selectedItem === "Other" ? customItem : selectedItem;
    if (!itemName) return;

    createMutation.mutate({
      item_name: itemName,
      reported_by: floorUser?.name || "Unknown",
      status: "pending",
      notes,
    });
  };

  const handleAcknowledge = (report) => {
    updateMutation.mutate({
      id: report.id,
      data: {
        status: "acknowledged",
        acknowledged_by: floorUser?.name || "Unknown",
        acknowledged_date: new Date().toISOString(),
      },
    });
  };

  const handleRestock = (report) => {
    updateMutation.mutate({
      id: report.id,
      data: { status: "restocked" },
    });
  };

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ConsumableReport.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["consumable-reports"] }),
  });

  const startEdit = (report) => {
    setEditingId(report.id);
    setEditForm({ item_name: report.item_name, notes: report.notes || "" });
  };

  const saveEdit = (report) => {
    updateMutation.mutate({
      id: report.id,
      data: { item_name: editForm.item_name, notes: editForm.notes },
    });
    setEditingId(null);
  };

  const pendingReports = reports.filter(r => r.status === "pending");
  const acknowledgedReports = reports.filter(r => r.status === "acknowledged");
  const restockedReports = reports.filter(r => r.status === "restocked");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Package className="w-7 h-7 text-orange-400" />
          Low Consumables
        </h1>
      </div>

      {/* Report Form */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Report Low Item
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Select Item</label>
              <Select value={selectedItem} onValueChange={setSelectedItem}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue placeholder="Choose an item..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {CONSUMABLE_ITEMS.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedItem === "Other" && (
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Custom Item Name</label>
                <Input
                  placeholder="Enter item name..."
                  value={customItem}
                  onChange={(e) => setCustomItem(e.target.value)}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            )}
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Notes (Optional)</label>
            <Textarea
              placeholder="Any additional details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!selectedItem || (selectedItem === "Other" && !customItem) || createMutation.isPending}
            className="bg-orange-500 hover:bg-orange-600 w-full md:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            Report Low Item
          </Button>
          {showSuccess && (
            <div className="p-3 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Report submitted successfully!
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Reports */}
      {pendingReports.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              Pending Reports ({pendingReports.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingReports.map((report) => (
                <div
                  key={report.id}
                  className="p-3 bg-zinc-800 rounded-lg border border-amber-500/20"
                >
                  {editingId === report.id ? (
                    <div className="space-y-2">
                      <Input
                        value={editForm.item_name}
                        onChange={(e) => setEditForm(f => ({ ...f, item_name: e.target.value }))}
                        className="bg-zinc-700 border-zinc-600 text-white"
                      />
                      <Textarea
                        value={editForm.notes}
                        onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Notes..."
                        className="bg-zinc-700 border-zinc-600 text-white text-sm min-h-[60px]"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(report)} className="bg-green-600 hover:bg-green-700 gap-1">
                          <Save className="w-3.5 h-3.5" /> Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="text-zinc-400">
                          <X className="w-3.5 h-3.5" /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-white font-medium">{report.item_name}</span>
                        <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                          <span>By: {report.reported_by}</span>
                          <span>{new Date(report.created_date).toLocaleString()}</span>
                        </div>
                        {report.notes && <p className="text-sm text-zinc-400 mt-1">{report.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => startEdit(report)} className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteMutation.mutate(report.id)} className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <Button size="sm" onClick={() => handleAcknowledge(report)} className="bg-blue-500 hover:bg-blue-600">
                          <Check className="w-4 h-4 mr-1" /> Acknowledge
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Acknowledged Reports */}
      {acknowledgedReports.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Check className="w-5 h-5 text-blue-400" />
              Acknowledged ({acknowledgedReports.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {acknowledgedReports.map((report) => (
                <div
                  key={report.id}
                  className="flex items-start justify-between gap-3 p-3 bg-zinc-800 rounded-lg border border-blue-500/20"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-white font-medium">{report.item_name}</span>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                      <span>Ack by: {report.acknowledged_by}</span>
                      <span>{new Date(report.acknowledged_date).toLocaleString()}</span>
                    </div>
                    {report.notes && <p className="text-sm text-zinc-400 mt-1">{report.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => deleteMutation.mutate(report.id)} className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <Button size="sm" onClick={() => handleRestock(report)} className="bg-green-500 hover:bg-green-600">
                      <CheckCircle className="w-4 h-4 mr-1" /> Mark Restocked
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Restocked */}
      {restockedReports.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg text-zinc-400">Recently Restocked</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {restockedReports.slice(0, 10).map((report) => (
                <div
                  key={report.id}
                  className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg"
                >
                  <div>
                    <span className="text-zinc-300">{report.item_name}</span>
                    <div className="text-xs text-zinc-600 mt-1">
                      {new Date(report.created_date).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => deleteMutation.mutate(report.id)} className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <Badge variant="green">Restocked</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="text-center text-zinc-500 py-8">Loading...</div>
      )}
    </div>
  );
}