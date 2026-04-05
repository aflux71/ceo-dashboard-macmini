import React, { useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, GripVertical, UploadCloud, Camera } from "lucide-react";
import ComponentPhotoCard from "./ComponentPhotoCard";

const ROLES = [
  { value: "bottle", label: "Bottle" },
  { value: "cap", label: "Cap" },
  { value: "label", label: "Label (Front)" },
  { value: "label_back", label: "Label (Back)" },
  { value: "shrink_band", label: "Shrink Band" },
  { value: "insert", label: "Insert" },
  { value: "outer_box", label: "Outer Box" },
  { value: "other", label: "Other" }
];

export default function AssemblyGuideEditor({ guide, inventory, onSave, onCancel, onOpenPhotoCaptureMode }) {
  const [components, setComponents] = useState(guide?.components || []);
  const [assemblyNotes, setAssemblyNotes] = useState(guide?.assembly_notes || "");
  const [uploading, setUploading] = useState(false);

  const missingPhotos = components.filter(comp => {
    const inv = inventory.find(i => i.id === comp.inventory_item_id);
    return !inv?.component_photo;
  }).length;

  const addComponent = () => {
    const newOrder = components.length > 0 
      ? Math.max(...components.map(c => c.order)) + 1 
      : 1;
    setComponents([
      ...components,
      { order: newOrder, role: "other", inventory_item_id: "", quantity_per_unit: 1, notes: "" }
    ]);
  };

  const updateComponent = (index, field, value) => {
    const updated = [...components];
    updated[index][field] = value;
    setComponents(updated);
  };

  const removeComponent = (index) => {
    setComponents(components.filter((_, i) => i !== index));
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    
    const items = Array.from(components);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    // Recalculate order numbers
    items.forEach((item, idx) => item.order = idx + 1);
    setComponents(items);
  };

  const handleSave = () => {
    onSave({
      components,
      assembly_notes: assemblyNotes
    });
  };

  return (
    <div className="space-y-6">
      {/* Assembly Notes */}
      <div className="space-y-2">
        <Label>Assembly Notes</Label>
        <Textarea
          value={assemblyNotes}
          onChange={(e) => setAssemblyNotes(e.target.value)}
          placeholder="General assembly instructions, warnings, or tips..."
          className="bg-zinc-800 border-zinc-700 min-h-24"
        />
      </div>

      {/* Missing Photos Warning */}
      {missingPhotos > 0 && onOpenPhotoCaptureMode && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
          <UploadCloud className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-200">
              {missingPhotos} component{missingPhotos > 1 ? "s" : ""} missing photo
            </p>
            <Button
              type="button"
              onClick={onOpenPhotoCaptureMode}
              variant="outline"
              size="sm"
              className="mt-2 text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
            >
              <Camera className="w-3 h-3 mr-1" />
              Quick Capture
            </Button>
          </div>
        </div>
      )}

      {/* Components */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base">Components in Assembly Order</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addComponent}
            className="text-zinc-400 hover:text-zinc-100"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Component
          </Button>
        </div>

        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="components">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                {components.map((comp, idx) => {
                  const invItem = inventory.find(i => i.id === comp.inventory_item_id);
                  return (
                    <Draggable key={idx} draggableId={`comp-${idx}`} index={idx}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg space-y-3 ${
                            snapshot.isDragging ? "ring-2 ring-orange-500" : ""
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div {...provided.dragHandleProps} className="cursor-grab mt-1">
                              <GripVertical className="w-4 h-4 text-zinc-500" />
                            </div>
                            <div className="flex-1 space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-xs">Role</Label>
                                  <Select
                                    value={comp.role}
                                    onValueChange={(v) => updateComponent(idx, "role", v)}
                                  >
                                    <SelectTrigger className="bg-zinc-800 border-zinc-700 h-8 text-sm">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {ROLES.map(role => (
                                        <SelectItem key={role.value} value={role.value}>
                                          {role.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Inventory Item</Label>
                                  <Select
                                    value={comp.inventory_item_id}
                                    onValueChange={(v) => updateComponent(idx, "inventory_item_id", v)}
                                  >
                                    <SelectTrigger className="bg-zinc-800 border-zinc-700 h-8 text-sm">
                                      <SelectValue placeholder="Select item" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {inventory
                                        .filter(i => i.type === "packaging" || i.type === "raw_material")
                                        .map(item => (
                                          <SelectItem key={item.id} value={item.id}>
                                            {item.sku} - {item.name}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-xs">Qty per Unit</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={comp.quantity_per_unit}
                                    onChange={(e) => updateComponent(idx, "quantity_per_unit", parseInt(e.target.value) || 1)}
                                    className="bg-zinc-800 border-zinc-700 h-8 text-sm"
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <Label className="text-xs">Component Notes</Label>
                                <Input
                                  value={comp.notes}
                                  onChange={(e) => updateComponent(idx, "notes", e.target.value)}
                                  placeholder="e.g., Black ribbed cap, NOT the smooth cap"
                                  className="bg-zinc-800 border-zinc-700 h-8 text-sm"
                                />
                              </div>

                              {invItem && !invItem.component_photo && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="text-xs text-amber-400 hover:text-amber-300"
                                  disabled
                                >
                                  <UploadCloud className="w-3 h-3 mr-1" />
                                  Missing Photo - Upload in Inventory
                                </Button>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeComponent(idx)}
                              className="text-red-400 hover:text-red-300"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 justify-end pt-4 border-t border-zinc-700">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          className="bg-orange-500 hover:bg-orange-600"
          disabled={components.length === 0}
        >
          Save Guide
        </Button>
      </div>
    </div>
  );
}