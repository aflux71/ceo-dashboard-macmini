import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Badge from "@/components/ui/Badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  Factory,
  Settings,
  Droplets,
  Package,
  Clock,
  Edit,
  Trash2,
  Save
} from "lucide-react";

const PRODUCT_TYPES = [
  "Bath Bombs",
  "Body Wash",
  "Hand Soap",
  "Shampoo",
  "Conditioner",
  "Scrubs",
  "Lotions",
  "Body Butters",
  "Candles",
  "Soaps",
  "Other"
];

export default function LineCapacity() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingLine, setEditingLine] = useState(null);

  const { data: lines = [], isLoading } = useQuery({
    queryKey: ["lineCapacity"],
    queryFn: () => base44.entities.ProductionLineCapacity.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ProductionLineCapacity.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lineCapacity"] });
      setShowDialog(false);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProductionLineCapacity.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lineCapacity"] });
      setEditingLine(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ProductionLineCapacity.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lineCapacity"] });
    }
  });

  const handleSave = (data) => {
    if (editingLine) {
      updateMutation.mutate({ id: editingLine.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Factory className="w-7 h-7 text-orange-400" />
            Production Line Capacity
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Configure capacity limits and capabilities for each production line
          </p>
        </div>
        <Button onClick={() => { setEditingLine(null); setShowDialog(true); }} className="bg-orange-600 hover:bg-orange-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Line
        </Button>
      </div>

      {/* Lines Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-zinc-500">Loading lines...</div>
      ) : lines.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-12 text-center">
            <Factory className="w-12 h-12 mx-auto text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-zinc-300">No production lines configured</h3>
            <p className="text-zinc-500 text-sm mt-1">Add your first production line to set capacity limits</p>
            <Button onClick={() => setShowDialog(true)} className="mt-4 bg-orange-600 hover:bg-orange-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Production Line
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {lines.map(line => (
            <Card key={line.id} className={`bg-zinc-900 border-zinc-800 ${!line.active ? 'opacity-60' : ''}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${line.active ? 'bg-orange-500/20' : 'bg-zinc-800'}`}>
                    <Factory className={`w-5 h-5 ${line.active ? 'text-orange-400' : 'text-zinc-500'}`} />
                  </div>
                  <div>
                    <CardTitle className="text-white text-lg">Line {line.line_number}</CardTitle>
                    <p className="text-sm text-zinc-400">{line.line_name}</p>
                  </div>
                </div>
                <Badge variant={line.active ? "green" : "default"}>
                  {line.active ? "Active" : "Inactive"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Product Types */}
                <div>
                  <div className="text-xs text-zinc-500 mb-2">Product Types</div>
                  <div className="flex flex-wrap gap-1">
                    {(line.product_types || []).map(type => (
                      <Badge key={type} variant="default" className="text-xs">
                        {type}
                      </Badge>
                    ))}
                    {(!line.product_types || line.product_types.length === 0) && (
                      <span className="text-zinc-500 text-sm">All types</span>
                    )}
                  </div>
                </div>

                {/* Capacity Stats */}
                <div className="grid grid-cols-2 gap-4">
                  {line.max_batch_size_liters > 0 && (
                    <div className="p-3 bg-zinc-800 rounded-lg">
                      <div className="flex items-center gap-2 text-blue-400 mb-1">
                        <Droplets className="w-4 h-4" />
                        <span className="text-xs">Max Batch (Liquid)</span>
                      </div>
                      <div className="text-xl font-bold text-white">{line.max_batch_size_liters}L</div>
                    </div>
                  )}
                  {line.max_batch_size_units > 0 && (
                    <div className="p-3 bg-zinc-800 rounded-lg">
                      <div className="flex items-center gap-2 text-purple-400 mb-1">
                        <Package className="w-4 h-4" />
                        <span className="text-xs">Max Batch (Solid)</span>
                      </div>
                      <div className="text-xl font-bold text-white">{line.max_batch_size_units}</div>
                    </div>
                  )}
                  {line.daily_capacity_liters > 0 && (
                    <div className="p-3 bg-zinc-800 rounded-lg">
                      <div className="flex items-center gap-2 text-cyan-400 mb-1">
                        <Droplets className="w-4 h-4" />
                        <span className="text-xs">Daily Capacity</span>
                      </div>
                      <div className="text-xl font-bold text-white">{line.daily_capacity_liters}L</div>
                    </div>
                  )}
                  {line.daily_capacity_units > 0 && (
                    <div className="p-3 bg-zinc-800 rounded-lg">
                      <div className="flex items-center gap-2 text-amber-400 mb-1">
                        <Package className="w-4 h-4" />
                        <span className="text-xs">Daily Capacity</span>
                      </div>
                      <div className="text-xl font-bold text-white">{line.daily_capacity_units}</div>
                    </div>
                  )}
                </div>

                {/* Operating Hours & Changeover */}
                <div className="flex gap-4 text-sm text-zinc-400">
                  {line.operating_hours_per_day && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {line.operating_hours_per_day}h/day
                    </span>
                  )}
                  {line.changeover_time_minutes > 0 && (
                    <span className="flex items-center gap-1">
                      <Settings className="w-4 h-4" />
                      {line.changeover_time_minutes}min changeover
                    </span>
                  )}
                  {line.filling_rate_units_per_hour > 0 && (
                    <span className="flex items-center gap-1">
                      <Droplets className="w-4 h-4" />
                      {line.filling_rate_units_per_hour} units/hr
                    </span>
                  )}
                </div>

                {/* Notes */}
                {line.notes && (
                  <p className="text-sm text-zinc-500 italic">{line.notes}</p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t border-zinc-800">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setEditingLine(line); setShowDialog(true); }}
                    className="flex-1 border-zinc-700"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(line.id)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <LineCapacityDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        line={editingLine}
        onSave={handleSave}
      />
    </div>
  );
}

function LineCapacityDialog({ open, onOpenChange, line, onSave }) {
  const [formData, setFormData] = useState({
    line_number: 1,
    line_name: "",
    product_types: [],
    max_batch_size_liters: 0,
    max_batch_size_units: 0,
    daily_capacity_liters: 0,
    daily_capacity_units: 0,
    filling_rate_units_per_hour: 0,
    changeover_time_minutes: 30,
    operating_hours_per_day: 8,
    active: true,
    notes: ""
  });

  React.useEffect(() => {
    if (line) {
      setFormData(line);
    } else {
      setFormData({
        line_number: 1,
        line_name: "",
        product_types: [],
        max_batch_size_liters: 0,
        max_batch_size_units: 0,
        daily_capacity_liters: 0,
        daily_capacity_units: 0,
        filling_rate_units_per_hour: 0,
        changeover_time_minutes: 30,
        operating_hours_per_day: 8,
        active: true,
        notes: ""
      });
    }
  }, [line, open]);

  const toggleProductType = (type) => {
    const types = formData.product_types || [];
    if (types.includes(type)) {
      setFormData({ ...formData, product_types: types.filter(t => t !== type) });
    } else {
      setFormData({ ...formData, product_types: [...types, type] });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Factory className="w-5 h-5 text-orange-400" />
            {line ? "Edit Production Line" : "Add Production Line"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Line Number</label>
              <Input
                type="number"
                value={formData.line_number}
                onChange={(e) => setFormData({ ...formData, line_number: Number(e.target.value) })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Line Name</label>
              <Input
                placeholder="e.g., Main Mixing Line"
                value={formData.line_name}
                onChange={(e) => setFormData({ ...formData, line_name: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Product Types</label>
            <div className="grid grid-cols-2 gap-2">
              {PRODUCT_TYPES.map(type => (
                <label key={type} className="flex items-center gap-2 p-2 bg-zinc-800 rounded cursor-pointer hover:bg-zinc-700">
                  <Checkbox
                    checked={(formData.product_types || []).includes(type)}
                    onCheckedChange={() => toggleProductType(type)}
                  />
                  <span className="text-sm text-zinc-300">{type}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Max Batch Size (Liters)</label>
              <Input
                type="number"
                value={formData.max_batch_size_liters}
                onChange={(e) => setFormData({ ...formData, max_batch_size_liters: Number(e.target.value) })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Max Batch Size (Units)</label>
              <Input
                type="number"
                value={formData.max_batch_size_units}
                onChange={(e) => setFormData({ ...formData, max_batch_size_units: Number(e.target.value) })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Daily Capacity (Liters)</label>
              <Input
                type="number"
                value={formData.daily_capacity_liters}
                onChange={(e) => setFormData({ ...formData, daily_capacity_liters: Number(e.target.value) })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Daily Capacity (Units)</label>
              <Input
                type="number"
                value={formData.daily_capacity_units}
                onChange={(e) => setFormData({ ...formData, daily_capacity_units: Number(e.target.value) })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Filling Rate (units/hr)</label>
              <Input
                type="number"
                value={formData.filling_rate_units_per_hour}
                onChange={(e) => setFormData({ ...formData, filling_rate_units_per_hour: Number(e.target.value) })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Changeover (min)</label>
              <Input
                type="number"
                value={formData.changeover_time_minutes}
                onChange={(e) => setFormData({ ...formData, changeover_time_minutes: Number(e.target.value) })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Hours/Day</label>
              <Input
                type="number"
                value={formData.operating_hours_per_day}
                onChange={(e) => setFormData({ ...formData, operating_hours_per_day: Number(e.target.value) })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Notes</label>
            <Input
              placeholder="Any additional notes..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={formData.active}
              onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
            />
            <span className="text-sm text-zinc-300">Line is active</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700">
            Cancel
          </Button>
          <Button onClick={() => onSave(formData)} className="bg-orange-600 hover:bg-orange-700">
            <Save className="w-4 h-4 mr-2" />
            {line ? "Save Changes" : "Create Line"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}