import React, { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw } from "lucide-react";

export default function PhotoCaptureScreen({ item, onApprove, onRetake, onSkip, onExit }) {
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // Try to activate wake lock to prevent screen lock
  useEffect(() => {
    if ("wakeLock" in navigator) {
      navigator.wakeLock
        .request("screen")
        .catch(() => {
          // Silently fail if not supported
        });
    }
  }, []);

  // Try to start camera with fallback to file input
  useEffect(() => {
    startCamera();
  }, [item.id]);

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        // Fallback: use file input
        openFileInput();
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch {
      // Fallback to file input if camera permission denied or unavailable
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
          setCameraActive(false);
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
        setCameraActive(false);
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
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />

      {/* Item Info */}
      <div className="px-4 py-3 bg-zinc-900 border-b border-zinc-800">
        <h3 className="text-lg font-bold text-zinc-100">{item.name}</h3>
        <p className="text-sm text-zinc-500 mt-1">
          {item.sku} · {item.type || "other"}
        </p>
        {item.reorder_point && (
          <p className="text-xs text-zinc-600 mt-1">
            Min: {item.reorder_point} · Stock: {item.quantity}
          </p>
        )}
      </div>

      {/* Camera/Preview Area */}
      <div className="flex-1 px-4 py-4 flex items-center justify-center bg-zinc-950">
        {cameraActive && videoRef.current?.srcObject ? (
          <div className="w-full max-w-sm space-y-3">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full rounded-lg bg-black"
            />
            <Button
              onClick={capturePhoto}
              className="w-full bg-orange-500 hover:bg-orange-600 h-12"
            >
              <Camera className="w-5 h-5 mr-2" />
              Capture Photo
            </Button>
          </div>
        ) : capturedPhoto ? (
          <div className="w-full max-w-sm">
            <img
              src={capturedPhoto}
              alt="Captured"
              className="w-full rounded-lg"
            />
          </div>
        ) : (
          <div className="w-full max-w-sm text-center">
            <div className="p-8 bg-zinc-800 rounded-lg border border-zinc-700 flex items-center justify-center">
              <button
                onClick={openFileInput}
                className="flex flex-col items-center gap-2 text-zinc-400 hover:text-zinc-100"
              >
                <Camera className="w-8 h-8" />
                <span className="text-sm">Tap to take photo</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="px-4 py-4 bg-zinc-900 border-t border-zinc-800 space-y-3">
        {capturedPhoto ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={handleRetake}
                variant="outline"
                className="h-12 border-zinc-700 text-zinc-200"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Retake
              </Button>
              <Button
                onClick={() => onApprove(capturedPhoto)}
                className="h-12 bg-orange-500 hover:bg-orange-600"
              >
                Approve → Next
              </Button>
            </div>
            <button
              onClick={onSkip}
              className="w-full text-sm text-zinc-500 hover:text-zinc-300 py-2"
            >
              Skip this item
            </button>
          </>
        ) : (
          <button
            onClick={onSkip}
            className="w-full text-sm text-zinc-500 hover:text-zinc-300 py-2"
          >
            Skip this item
          </button>
        )}
      </div>
    </div>
  );
}