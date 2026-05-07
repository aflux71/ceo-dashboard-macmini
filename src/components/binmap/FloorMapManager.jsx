import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import { Upload, Plus, Trash2 } from "lucide-react";

export default function FloorMapManager({ floorMaps, currentMapId, onSelectMap, onCreateMap, onUpdateMap, onDeleteMap }) {
  const [uploading, setUploading] = useState(false);
  const [newName, setNewName] = useState("");
  const currentMap = floorMaps.find(m => m.id === currentMapId);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !currentMap) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      onUpdateMap(currentMap.id, { ...currentMap, image_url: file_url });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={currentMapId || ""} onValueChange={onSelectMap}>
        <SelectTrigger className="w-56 bg-zinc-900 border-zinc-700">
          <SelectValue placeholder="Select floor map..." />
        </SelectTrigger>
        <SelectContent>
          {floorMaps.map(m => (
            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex gap-1">
        <Input
          placeholder="New map name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="w-44 bg-zinc-900 border-zinc-700"
        />
        <Button
          onClick={() => { if (newName.trim()) { onCreateMap(newName.trim()); setNewName(""); } }}
          variant="outline"
          className="border-zinc-700"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {currentMap && (
        <>
          <label className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md cursor-pointer hover:bg-zinc-800 text-sm text-zinc-300">
            <Upload className="w-4 h-4" />
            {uploading ? "Uploading..." : currentMap.image_url ? "Replace Image" : "Upload Image"}
            <input type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
          <Button
            variant="outline"
            onClick={() => { if (confirm(`Delete map "${currentMap.name}"?`)) onDeleteMap(currentMap.id); }}
            className="border-red-700 text-red-400 hover:bg-red-500/10"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </>
      )}
    </div>
  );
}