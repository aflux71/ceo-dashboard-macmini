import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Camera, X, Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

export default function PhotoUploader({ photos, onChange }) {
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploads = await Promise.all(
        Array.from(files).map(async (file) => {
          const { file_url } = await base44.integrations.Core.UploadFile({ file });
          return file_url;
        })
      );
      onChange([...photos, ...uploads]);
      toast.success(`${uploads.length} photo${uploads.length > 1 ? "s" : ""} uploaded`);
    } catch (err) {
      toast.error("Upload failed: " + (err?.message || "unknown"));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const remove = (idx) => onChange(photos.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-300">
          Defect Photos {photos.length > 0 && <span className="text-zinc-500">({photos.length})</span>}
        </span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {photos.map((url, i) => (
          <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 group">
            <img src={url} alt={`defect-${i}`} className="w-full h-full object-cover" />
            <button
              onClick={() => remove(i)}
              type="button"
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500/90 hover:bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="aspect-square rounded-lg border-2 border-dashed border-zinc-700 hover:border-orange-500/50 hover:bg-orange-500/5 text-zinc-500 hover:text-orange-400 flex flex-col items-center justify-center gap-1 transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Camera className="w-5 h-5" />
              <span className="text-xs font-medium">Add Photo</span>
            </>
          )}
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />

      {photos.length === 0 && !uploading && (
        <p className="text-xs text-zinc-500 flex items-center gap-1.5">
          <ImageIcon className="w-3 h-3" />
          Tap to capture or upload defect photos
        </p>
      )}
    </div>
  );
}