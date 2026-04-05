import React from "react";
import { Box, Tag, Beaker, Circle, Package, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";

const roleConfig = {
  bottle: { icon: Package, label: "Bottle" },
  cap: { icon: Circle, label: "Cap" },
  label: { icon: Tag, label: "Label" },
  label_back: { icon: Tag, label: "Back Label" },
  shrink_band: { icon: Box, label: "Shrink Band" },
  insert: { icon: Box, label: "Insert" },
  outer_box: { icon: Box, label: "Outer Box" },
  other: { icon: Package, label: "Other" }
};

const categoryIcons = {
  packaging: Box,
  label: Tag,
  raw_material: Beaker,
  default: Package
};

export default function ComponentPhotoCard({ component, inventoryItem, onUploadClick, isEditMode }) {
  const role = roleConfig[component.role] || roleConfig.other;
  const RoleIcon = role.icon;
  
  const getCategoryIcon = () => {
    const material = inventoryItem?.material_type?.toLowerCase() || "";
    if (material.includes("label")) return categoryIcons.label;
    if (inventoryItem?.type === "packaging") return categoryIcons.packaging;
    if (inventoryItem?.type === "raw_material") return categoryIcons.raw_material;
    return categoryIcons.default;
  };
  
  const CategoryIcon = getCategoryIcon();
  
  const stockLevel = inventoryItem?.quantity || 0;
  const reorderPoint = inventoryItem?.reorder_point || 0;
  let stockStatus = "in_stock";
  if (stockLevel === 0) stockStatus = "out";
  else if (stockLevel <= reorderPoint) stockStatus = "low";
  
  const stockColors = {
    in_stock: "bg-green-500",
    low: "bg-amber-500",
    out: "bg-red-500"
  };
  
  const stockLabels = {
    in_stock: "In Stock",
    low: "Low",
    out: "OUT"
  };

  return (
    <div className="flex flex-col bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden min-w-[160px]">
      {/* Photo Area */}
      <div className="relative h-32 bg-zinc-900 flex items-center justify-center overflow-hidden group">
        {inventoryItem?.component_photo ? (
          <>
            <img
              src={inventoryItem.component_photo}
              alt={inventoryItem?.name}
              className="w-full h-full object-cover"
            />
            {isEditMode && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onUploadClick}
                className="absolute opacity-0 group-hover:opacity-100 bg-zinc-900/80 text-white transition-opacity"
              >
                <UploadCloud className="w-4 h-4 mr-1" />
                Change
              </Button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <CategoryIcon className="w-8 h-8 text-zinc-600" />
            {isEditMode && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onUploadClick}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                <UploadCloud className="w-3 h-3 mr-1" />
                Add Photo
              </Button>
            )}
            {!isEditMode && (
              <span className="text-xs text-zinc-600">No photo</span>
            )}
          </div>
        )}
      </div>

      {/* Info Area */}
      <div className="p-3 space-y-2">
        {/* Role Badge */}
        <div className="text-xs text-zinc-500 uppercase font-medium">{role.label}</div>
        
        {/* Item Name */}
        <p className="text-sm font-semibold text-zinc-200 line-clamp-2">
          {inventoryItem?.name || "Unknown Item"}
        </p>
        
        {/* Component Notes */}
        {component.notes && (
          <p className="text-xs text-zinc-500 line-clamp-2">{component.notes}</p>
        )}
        
        {/* SKU */}
        <p className="text-xs font-mono text-zinc-400">{inventoryItem?.sku}</p>
        
        {/* Stock Indicator + Quantity */}
        <div className="flex items-center gap-2 text-xs">
          <div className={`w-2 h-2 rounded-full ${stockColors[stockStatus]}`}></div>
          <span className="text-zinc-400">{stockLabels[stockStatus]}</span>
          {component.quantity_per_unit > 1 && (
            <span className="ml-auto text-zinc-500">×{component.quantity_per_unit}</span>
          )}
        </div>
      </div>
    </div>
  );
}