import React from "react";
import { Button } from "@/components/ui/button";
import { Printer, AlertTriangle } from "lucide-react";
import ComponentPhotoCard from "./ComponentPhotoCard";

export default function AssemblyGuideDisplay({ guide, inventory, onPrint, onEdit, isEditMode = false }) {
  if (!guide || !guide.components?.length) {
    return (
      <div className="text-center py-8 text-zinc-500">
        <p>No assembly guide data available</p>
      </div>
    );
  }

  const sortedComponents = [...guide.components].sort((a, b) => a.order - b.order);
  const missingPhotos = sortedComponents.filter(comp => {
    const inv = inventory.find(i => i.id === comp.inventory_item_id);
    return !inv?.component_photo;
  }).length;

  return (
    <div className="space-y-6">
      {/* Warning Banner for Missing Photos */}
      {missingPhotos > 0 && isEditMode && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-200">
              {missingPhotos} component{missingPhotos > 1 ? "s" : ""} missing photo
            </p>
            <p className="text-xs text-amber-300 mt-1">
              The guide will be more useful with photos. Click "Add Photo" on the cards below.
            </p>
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex gap-2">
        {!isEditMode && (
          <Button
            variant="outline"
            size="sm"
            onClick={onPrint}
            className="text-zinc-400 hover:text-zinc-100"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print Guide
          </Button>
        )}
        {onEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="text-zinc-400 hover:text-zinc-100"
          >
            Edit Guide
          </Button>
        )}
      </div>

      {/* Component Cards */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-min">
          {sortedComponents.map((comp) => {
            const inv = inventory.find(i => i.id === comp.inventory_item_id);
            return (
              <ComponentPhotoCard
                key={comp.order}
                component={comp}
                inventoryItem={inv}
                isEditMode={isEditMode}
              />
            );
          })}
        </div>
      </div>

      {/* Assembly Notes */}
      {guide.assembly_notes && (
        <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
          <h4 className="font-semibold text-zinc-200 mb-2">Assembly Notes</h4>
          <p className="text-sm text-zinc-400 whitespace-pre-wrap">{guide.assembly_notes}</p>
        </div>
      )}
    </div>
  );
}