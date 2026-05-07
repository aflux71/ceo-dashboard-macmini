import React from "react";
import { Package, Layers, Boxes } from "lucide-react";

const ICONS = {
  bin: Package,
  rack: Layers,
  shelf: Layers,
  pallet: Boxes,
  zone: Boxes,
};

export default function DraggableBin({ bin, selected, onMouseDown, onClick }) {
  const Icon = ICONS[bin.type] || Package;
  return (
    <div
      onMouseDown={onMouseDown}
      onClick={onClick}
      className={`absolute flex flex-col items-center justify-center rounded-md shadow-lg cursor-move transition-all ${
        selected ? "ring-2 ring-white scale-105 z-10" : "hover:scale-105"
      }`}
      style={{
        left: `${bin.x}%`,
        top: `${bin.y}%`,
        width: `${bin.width || 80}px`,
        height: `${bin.height || 60}px`,
        transform: "translate(-50%, -50%)",
        backgroundColor: bin.color || "#f97316",
        color: "#fff",
      }}
    >
      <Icon className="w-4 h-4 mb-0.5" />
      <span className="text-xs font-bold leading-tight px-1 text-center">{bin.name}</span>
    </div>
  );
}