import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";

export default function ScreenshotUploader({ screenshots = [], onChange }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    setError("");
    setUploading(true);
    try {
      const uploads = await Promise.all(
        Array.from(files).map((file) =>
          base44.integrations.Core.UploadFile({ file })
        )
      );
      const urls = uploads.map((r) => r?.file_url).filter(Boolean);
      onChange([...(screenshots || []), ...urls]);
    } catch {
      setError("Failed to upload one or more screenshots. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeAt = (idx) => {
    const next = [...(screenshots || [])];
    next.splice(idx, 1);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" /> Add Screenshots
            </>
          )}
        </Button>
        <span className="text-xs text-zinc-500">
          {screenshots?.length || 0} attached
        </span>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}

      {screenshots && screenshots.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {screenshots.map((url, idx) => (
            <div
              key={`${url}-${idx}`}
              className="relative group rounded-md overflow-hidden border border-zinc-700 bg-zinc-800 aspect-square"
            >
              <a href={url} target="_blank" rel="noopener noreferrer">
                <img
                  src={url}
                  alt={`Screenshot ${idx + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <ImageIcon className="absolute inset-0 m-auto w-6 h-6 text-zinc-600 -z-10" />
              </a>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                aria-label="Remove screenshot"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}