import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, Clock, Factory, Tag, AlertTriangle, Trash2, Search, Package } from "lucide-react";
import { format, addDays } from "date-fns";
import { useFloorPin } from "@/components/auth/FloorPinContext";
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

export default function ScheduleModal({ 
  open, 
  onOpenChange, 
  item, 
  recipes,
  productionSettings,
  productionTags,
  existingSchedules,
  onSave,
  onDelete
}) {
  const { floorUser } = useFloorPin();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Only admin and owner can delete
  const canDelete = floorUser?.role === 'admin' || floorUser?.role === 'owner';
  
  const [formData, setFormData] = useState({
    scheduled_start_date: "",
    assigned_production_line: 1,
    degassing_time_days: 0,
    qc_hold_time_days: 0,
    tags: [],
    notes: "",
    sku: "",
    product_name: "",
    suggested_qty: 1
  });
  const [conflicts, setConflicts] = useState([]);
  const [recipeSearch, setRecipeSearch] = useState("");

  const isNewItem = item?.status === 'new';
  const recipe = recipes?.find(r => r.sku === (isNewItem ? formData.sku : item?.sku));
  
  const filteredRecipes = recipes?.filter(r => 
    r.name?.toLowerCase().includes(recipeSearch.toLowerCase()) ||
    r.sku?.toLowerCase().includes(recipeSearch.toLowerCase())
  ) || [];

  useEffect(() => {
    if (item && open) {
      const recipeDefaults = recipe || {};
      const degassing = item.degassing_time_days ?? recipeDefaults.degassing_time_days ?? productionSettings?.degassingDays ?? 0;
      const qcHold = item.qc_hold_time_days ?? recipeDefaults.qc_hold_time_days ?? productionSettings?.qcHoldDays ?? 0;
      
      setFormData({
        scheduled_start_date: item.scheduled_start_date 
          ? format(new Date(item.scheduled_start_date), "yyyy-MM-dd'T'HH:mm")
          : format(new Date(), "yyyy-MM-dd'T'09:00"),
        assigned_production_line: item.assigned_production_line || item.production_line || 1,
        degassing_time_days: degassing,
        qc_hold_time_days: qcHold,
        tags: item.tags || [],
        notes: item.notes || "",
        sku: item.sku || "",
        product_name: item.product_name || "",
        suggested_qty: item.suggested_qty || 1
      });
      setRecipeSearch("");
    }
  }, [item, open, recipe, productionSettings]);

  useEffect(() => {
    // Check for conflicts
    if (!formData.scheduled_start_date || !existingSchedules) {
      setConflicts([]);
      return;
    }

    const startDate = new Date(formData.scheduled_start_date);
    const totalDays = 1 + formData.degassing_time_days + formData.qc_hold_time_days;
    const endDate = addDays(startDate, totalDays);

    const foundConflicts = existingSchedules.filter(schedule => {
      if (schedule.id === item?.id) return false;
      if (schedule.assigned_production_line !== formData.assigned_production_line) return false;
      
      const schedStart = new Date(schedule.scheduled_start_date);
      const schedEnd = schedule.scheduled_end_date 
        ? new Date(schedule.scheduled_end_date) 
        : addDays(schedStart, 1);

      return (startDate < schedEnd && endDate > schedStart);
    });

    setConflicts(foundConflicts);
  }, [formData.scheduled_start_date, formData.assigned_production_line, formData.degassing_time_days, formData.qc_hold_time_days, existingSchedules, item]);

  const calculateEndDate = () => {
    if (!formData.scheduled_start_date) return null;
    const startDate = new Date(formData.scheduled_start_date);
    const totalDays = 1 + formData.degassing_time_days + formData.qc_hold_time_days;
    return addDays(startDate, totalDays);
  };

  const handleTagToggle = (tagValue) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.includes(tagValue)
        ? prev.tags.filter(t => t !== tagValue)
        : [...prev.tags, tagValue]
    }));
  };

  const handleSelectRecipe = (selectedRecipe) => {
    const degassing = selectedRecipe.degassing_time_days ?? productionSettings?.degassingDays ?? 0;
    const qcHold = selectedRecipe.qc_hold_time_days ?? productionSettings?.qcHoldDays ?? 0;
    
    setFormData(prev => ({
      ...prev,
      sku: selectedRecipe.sku,
      product_name: selectedRecipe.name,
      suggested_qty: selectedRecipe.batch_size || 1,
      degassing_time_days: degassing,
      qc_hold_time_days: qcHold,
      assigned_production_line: selectedRecipe.production_line || prev.assigned_production_line
    }));
    setRecipeSearch("");
  };

  const handleSave = () => {
    const endDate = calculateEndDate();
    const saveData = {
      ...item,
      scheduled_start_date: new Date(formData.scheduled_start_date).toISOString(),
      scheduled_end_date: endDate?.toISOString(),
      assigned_production_line: formData.assigned_production_line,
      degassing_time_days: formData.degassing_time_days,
      qc_hold_time_days: formData.qc_hold_time_days,
      tags: formData.tags,
      notes: formData.notes,
      status: "scheduled"
    };
    
    if (isNewItem) {
      saveData.sku = formData.sku;
      saveData.product_name = formData.product_name;
      saveData.suggested_qty = formData.suggested_qty;
      delete saveData.id;
      delete saveData.status;
      saveData.status = 'scheduled';
    }
    
    onSave(saveData);
  };

  const handleDelete = () => {
    if (item?.id && onDelete) {
      onDelete(item.id);
      setShowDeleteConfirm(false);
    }
  };

  const endDate = calculateEndDate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-zinc-100 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-orange-400" />
            Schedule Production Run
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Item Info or Product Selection */}
          {isNewItem ? (
            <div className="space-y-3">
              <Label className="text-zinc-300 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Select Product
              </Label>
              {formData.sku ? (
                <div className="p-3 bg-zinc-800 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{formData.product_name}</p>
                    <p className="text-xs text-zinc-500">SKU: {formData.sku}</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setFormData(prev => ({ ...prev, sku: "", product_name: "" }))}
                    className="text-zinc-400 hover:text-zinc-200"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <Input
                      value={recipeSearch}
                      onChange={(e) => setRecipeSearch(e.target.value)}
                      placeholder="Search recipes by name or SKU..."
                      className="pl-9 bg-zinc-800 border-zinc-700"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-zinc-700 rounded-lg">
                    {filteredRecipes.length === 0 ? (
                      <p className="text-sm text-zinc-500 p-3 text-center">No recipes found</p>
                    ) : (
                      filteredRecipes.slice(0, 10).map(r => (
                        <button
                          key={r.id}
                          onClick={() => handleSelectRecipe(r)}
                          className="w-full p-3 text-left hover:bg-zinc-800 border-b border-zinc-800 last:border-b-0 transition-colors"
                        >
                          <p className="text-sm font-medium text-zinc-200">{r.name}</p>
                          <p className="text-xs text-zinc-500">{r.sku} • {r.category} • Batch: {r.batch_size}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
              
              {/* Quantity for new items */}
              {formData.sku && (
                <div className="space-y-2">
                  <Label className="text-zinc-300 text-sm">Quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.suggested_qty}
                    onChange={(e) => setFormData(prev => ({ ...prev, suggested_qty: parseInt(e.target.value) || 1 }))}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-zinc-800 rounded-lg">
              <p className="text-sm font-medium text-zinc-200">{item?.product_name}</p>
              <p className="text-xs text-zinc-500">SKU: {item?.sku} • Qty: {item?.suggested_qty} units</p>
            </div>
          )}

          {/* Conflicts Warning */}
          {conflicts.length > 0 && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-red-400">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">Scheduling Conflict Detected</span>
                </div>
                <span className="text-xs text-zinc-500">(can be overridden)</span>
              </div>
              <p className="text-xs text-red-300">
                Overlaps with {conflicts.length} run(s) on Line {formData.assigned_production_line}:
              </p>
              <ul className="text-xs text-red-300 mt-1">
                {conflicts.slice(0, 3).map(c => (
                  <li key={c.id}>• {c.product_name} ({format(new Date(c.scheduled_start_date), "MMM d")})</li>
                ))}
              </ul>
            </div>
          )}

          {/* Start Date/Time */}
          <div className="space-y-2">
            <Label className="text-zinc-300 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Start Date & Time
            </Label>
            <Input
              type="datetime-local"
              value={formData.scheduled_start_date}
              onChange={(e) => setFormData(prev => ({ ...prev, scheduled_start_date: e.target.value }))}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>

          {/* Production Line */}
          <div className="space-y-2">
            <Label className="text-zinc-300 flex items-center gap-2">
              <Factory className="w-4 h-4" />
              Production Line
            </Label>
            <Select
              value={String(formData.assigned_production_line)}
              onValueChange={(v) => setFormData(prev => ({ ...prev, assigned_production_line: parseInt(v) }))}
            >
              <SelectTrigger className="bg-zinc-800 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Line 1</SelectItem>
                <SelectItem value="2">Line 2</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Timeline Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-zinc-300 text-sm">Degassing (days)</Label>
              <Input
                type="number"
                min="0"
                value={formData.degassing_time_days}
                onChange={(e) => setFormData(prev => ({ ...prev, degassing_time_days: parseInt(e.target.value) || 0 }))}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300 text-sm">QC Hold (days)</Label>
              <Input
                type="number"
                min="0"
                value={formData.qc_hold_time_days}
                onChange={(e) => setFormData(prev => ({ ...prev, qc_hold_time_days: parseInt(e.target.value) || 0 }))}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>

          {/* Calculated End Date */}
          {endDate && (
            <div className="p-3 bg-zinc-800/50 rounded-lg">
              <p className="text-xs text-zinc-500">Estimated Completion</p>
              <p className="text-sm text-zinc-200 font-medium">
                {format(endDate, "EEEE, MMM d, yyyy")}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Total duration: {1 + formData.degassing_time_days + formData.qc_hold_time_days} day(s)
              </p>
            </div>
          )}

          {/* Tags */}
          <div className="space-y-2">
            <Label className="text-zinc-300 flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Tags
            </Label>
            <div className="flex flex-wrap gap-2">
              {productionTags?.map(tag => (
                <button
                  key={tag.value}
                  onClick={() => handleTagToggle(tag.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                    formData.tags.includes(tag.value)
                      ? `bg-${tag.color}-500/20 text-${tag.color}-400 border-${tag.color}-500/50`
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                  }`}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-zinc-300">Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Optional notes for this run..."
              className="bg-zinc-800 border-zinc-700 h-20"
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex gap-2 w-full sm:w-auto">
            {canDelete && item?.id && (
              <Button 
                variant="ghost" 
                onClick={() => setShowDeleteConfirm(true)}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
              Cancel
            </Button>
          </div>
          <Button 
            onClick={handleSave}
            disabled={isNewItem && !formData.sku}
            className={conflicts.length > 0 
              ? "bg-amber-600 hover:bg-amber-700" 
              : "bg-orange-500 hover:bg-orange-600"
            }
          >
            {conflicts.length > 0 
              ? `Schedule Anyway (${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''})` 
              : (isNewItem ? 'Add to Schedule' : (item?.status === 'scheduled' ? 'Update Schedule' : 'Schedule Run'))
            }
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100">Delete Scheduled Run</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete this scheduled production run for <span className="font-semibold text-zinc-200">{item?.product_name}</span>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}