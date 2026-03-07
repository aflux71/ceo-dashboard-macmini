import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, GripVertical, Save, Loader2, Tag } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { useProductCategories } from "@/components/utils/useProductCategories";

export default function CategorySettings() {
  const { categories, isLoading, saveCategories, isSaving } = useProductCategories();
  const [items, setItems] = useState([]);
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    if (categories) setItems([...categories]);
  }, [categories]);

  const handleAdd = () => {
    const name = newCategory.trim();
    if (!name) return;
    if (items.some((c) => c.toLowerCase() === name.toLowerCase())) {
      toast.error("Category already exists");
      return;
    }
    setItems([...items, name]);
    setNewCategory("");
  };

  const handleRemove = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleRename = (index, value) => {
    const updated = [...items];
    updated[index] = value;
    setItems(updated);
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = [...items];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setItems(reordered);
  };

  const handleSave = async () => {
    const cleaned = items.map((c) => c.trim()).filter(Boolean);
    const unique = [...new Set(cleaned)];
    if (unique.length === 0) {
      toast.error("You need at least one category");
      return;
    }
    await saveCategories(unique);
    toast.success("Categories saved");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Product Categories</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Manage the categories available for recipes and templates.
        </p>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-zinc-300">
            <Tag className="w-4 h-4 text-orange-400" />
            Categories ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="categories">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                  {items.map((cat, idx) => (
                    <Draggable key={`${cat}-${idx}`} draggableId={`cat-${idx}`} index={idx}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`flex items-center gap-2 p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50 ${
                            snapshot.isDragging ? "ring-2 ring-orange-500" : ""
                          }`}
                        >
                          <div {...provided.dragHandleProps} className="cursor-grab">
                            <GripVertical className="w-4 h-4 text-zinc-600" />
                          </div>
                          <Input
                            value={cat}
                            onChange={(e) => handleRename(idx, e.target.value)}
                            className="h-8 bg-zinc-800 border-zinc-700 text-sm flex-1"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemove(idx)}
                            className="text-red-400 hover:text-red-300 h-8 w-8 p-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          {/* Add new */}
          <div className="flex gap-2 pt-2 border-t border-zinc-800">
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="New category name..."
              className="h-9 bg-zinc-800 border-zinc-700 text-sm flex-1"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAdd}
              disabled={!newCategory.trim()}
              className="h-9"
            >
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>

          {/* Save */}
          <div className="pt-3 border-t border-zinc-800 flex justify-end">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Categories
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}