import React, { useRef, useState } from "react";
import DraggableBin from "./DraggableBin";

export default function FloorMapCanvas({ floorMap, bins, onBinMove, onBinClick, selectedBinId }) {
  const canvasRef = useRef(null);
  const [dragging, setDragging] = useState(null);

  const handleMouseDown = (e, bin) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(bin.id);
  };

  const handleMouseMove = (e) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));
    onBinMove(dragging, clampedX, clampedY, true); // optimistic, no save
  };

  const handleMouseUp = () => {
    if (dragging) {
      onBinMove(dragging, null, null, false); // commit save
      setDragging(null);
    }
  };

  return (
    <div
      ref={canvasRef}
      className="relative w-full bg-zinc-800 border-2 border-zinc-700 rounded-lg overflow-hidden select-none"
      style={{
        aspectRatio: "16 / 10",
        backgroundImage: floorMap?.image_url ? `url(${floorMap.image_url})` : "none",
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {!floorMap?.image_url && (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm">
          Upload a floor map image to get started
        </div>
      )}
      {bins.map((bin) => (
        <DraggableBin
          key={bin.id}
          bin={bin}
          selected={bin.id === selectedBinId}
          onMouseDown={(e) => handleMouseDown(e, bin)}
          onClick={() => !dragging && onBinClick(bin)}
        />
      ))}
    </div>
  );
}