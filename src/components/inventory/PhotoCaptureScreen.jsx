import React, { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw, Check } from "lucide-react";

export default function PhotoCaptureScreen({ item, onApprove, onRetake, onSkip }) {
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);

  // Try to activate wake lock to prevent screen lock
  useEffect(() => {
    let wakeLock = null;
    if ("wakeLock" in navigator) {
      navigator.wakeLock
        .request("screen")
        .then((wl) => { wakeLock = wl; })
        .catch(() => {});
    }
    return () => { wakeLock?.release?.().catch(() => {}); };
  }, []);

  // Restart camera when item changes
  useEffect(() => {
    setCapturedPhoto(null);
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        openFileInput();
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch {
      openFileInput();
    }
  };

  const openFileInput = () => {
    fileInputRef.current?.click();
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const context = canvasRef.current.getContext("2d");
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context.drawImage(videoRef.current, 0, 0);
    canvasRef.current.toBlob((blob) => {
      if (blob) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setCapturedPhoto(e.target.result);
          stopCamera();
        };
        reader.readAsDataURL(blob);
      }
    }, "image/jpeg", 0.8);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedPhoto(event.target.result);
        stopCamera();
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
    startCamera();
    onRetake?.();
  };

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Hidden canvas + file input */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />

      {/* Compact item info */}
      <div className="px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <h3 className="text-sm font-semibold text-zinc-100 leading-tight line-clamp-2">{item.name}</h3>
        <p className="text-xs text-zinc-500 mt-0.5">
          {item.sku} · {item.type || "other"}
          {item.reorder_point ? ` · Stock: ${item.quantity}` : ""}
        </p>
      </div>

      {/* Camera / preview — fills available space */}
      <div className="flex-1 min-h-0 relative bg-black flex items-center justify-center overflow-hidden">
        {capturedPhoto ? (
          <img
            src={capturedPhoto}
            alt="Captured"
            className="w-full h-full object-contain"
          />
        ) : cameraActive ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Big floating shutter button */}
            <button
              onClick={capturePhoto}
              aria-label="Capture photo"
              className="absolute bottom-5 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full bg-white border-4 border-orange-500 active:scale-95 transition-transform shadow-lg flex items-center justify-center"
            >
              <div className="w-14 h-14 rounded-full bg-orange-500" />
            </button>
          </>
        ) : (
          <button
            onClick={openFileInput}
            className="flex flex-col items-center gap-3 text-zinc-300 active:text-orange-400 px-8 py-12"
          >
            <Camera className="w-12 h-12" />
            <span className="text-base font-medium">Tap to take photo</span>
          </button>
        )}
      </div>

      {/* Sticky bottom action bar */}
      <div
        className="px-4 pt-3 bg-zinc-900 border-t border-zinc-800 shrink-0"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        {capturedPhoto ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleRetake}
                variant="outline"
                className="h-14 border-zinc-700 text-zinc-200 text-base"
              >
                <RotateCcw className="w-5 h-5 mr-2" />
                Retake
              </Button>
              <Button
                onClick={() => onApprove(capturedPhoto)}
                className="h-14 bg-orange-500 hover:bg-orange-600 text-white text-base font-semibold"
              >
                <Check className="w-5 h-5 mr-2" />
                Approve → Next
              </Button>
            </div>
            <button
              onClick={onSkip}
              className="w-full text-sm text-zinc-500 active:text-zinc-300 py-2"
            >
              Skip this item
            </button>
          </div>
        ) : (
          <button
            onClick={onSkip}
            className="w-full text-sm text-zinc-400 active:text-zinc-200 py-3"
          >
            Skip this item
          </button>
        )}
      </div>
    </div>
  );
}