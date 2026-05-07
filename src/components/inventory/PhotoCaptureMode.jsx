import React, { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import PhotoCaptureItemList from "./PhotoCaptureItemList";
import PhotoCaptureScreen from "./PhotoCaptureScreen";
import PhotoCaptureCompletion from "./PhotoCaptureCompletion";

export default function PhotoCaptureMode({ open, onClose, inventory = [] }) {
  const [screen, setScreen] = useState("list"); // "list", "capture", "completion"
  const [currentItem, setCurrentItem] = useState(null);
  const [itemsWithoutPhotos, setItemsWithoutPhotos] = useState([]);
  const [capturedInSession, setCapturedInSession] = useState({});
  const [skippedInSession, setSkippedInSession] = useState(new Set());
  const [inFlightCount, setInFlightCount] = useState(0);
  const [justSaved, setJustSaved] = useState(false);

  const queryClient = useQueryClient();

  // Initialize the session ONLY when the dialog opens.
  // We intentionally don't depend on `inventory` here, otherwise re-fetches
  // (triggered by our own photo upload invalidating the query) would reset
  // the screen back to the list and kill the capture flow.
  useEffect(() => {
    if (open) {
      const missing = inventory.filter(item => !item.component_photo);
      setItemsWithoutPhotos(missing);
      setCapturedInSession({});
      setSkippedInSession(new Set());
      setScreen("list");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fire-and-forget upload that runs fully in parallel with other uploads.
  // We do NOT use useMutation here because it only tracks one at a time and
  // invalidates the inventory query on every success, which would cause the
  // capture session to re-render mid-flow.
  const uploadPhotoInBackground = async (itemId, photoData) => {
    setInFlightCount(c => c + 1);
    try {
      // Convert base64 to blob
      const byteCharacters = atob(photoData.split(",")[1]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "image/jpeg" });

      const uploadRes = await base44.integrations.Core.UploadFile({ file: blob });
      await base44.entities.Inventory.update(itemId, {
        component_photo: uploadRes.file_url
      });
    } catch (error) {
      toast.error("Failed to save a photo — please retake that item");
      // Roll back so user knows it didn't save
      setCapturedInSession(prev => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } finally {
      setInFlightCount(c => Math.max(0, c - 1));
    }
  };

  const handleStartCapture = (item) => {
    setCurrentItem(item);
    setScreen("capture");
  };

  const handleApprovePhoto = (photoData) => {
    if (!currentItem) return;

    const itemId = currentItem.id;

    // Mark as captured immediately so the UI advances right away.
    setCapturedInSession(prev => ({ ...prev, [itemId]: true }));

    // Kick off background upload — does NOT block UI
    uploadPhotoInBackground(itemId, photoData);

    // Show brief "Saved!" confirmation, then advance
    setJustSaved(true);
    setTimeout(() => {
      setJustSaved(false);

      const currentIndex = itemsWithoutPhotos.findIndex(i => i.id === itemId);
      const remainingItems = itemsWithoutPhotos.slice(currentIndex + 1).filter(
        item => !skippedInSession.has(item.id) && !capturedInSession[item.id]
      );

      if (remainingItems.length > 0) {
        handleStartCapture(remainingItems[0]);
      } else {
        setScreen("completion");
      }
    }, 500);
  };

  const handleSkipItem = () => {
    if (!currentItem) return;

    setSkippedInSession(prev => new Set([...prev, currentItem.id]));

    // Move to next non-skipped, non-captured item
    const currentIndex = itemsWithoutPhotos.findIndex(i => i.id === currentItem.id);
    const remainingItems = itemsWithoutPhotos.slice(currentIndex + 1).filter(
      item => !skippedInSession.has(item.id) && !capturedInSession[item.id]
    );

    if (remainingItems.length > 0) {
      handleStartCapture(remainingItems[0]);
    } else {
      setScreen("completion");
    }
  };

  const handleExitCapture = () => {
    const savedCount = Object.keys(capturedInSession).length;
    if (inFlightCount > 0 && !confirm(`${inFlightCount} photo(s) still uploading. Exit anyway?`)) {
      return;
    }
    if (savedCount > 0 && inFlightCount === 0 && !confirm(`You've captured ${savedCount} photos. Exit?`)) {
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
    onClose();
  };

  const handleExitCompletion = () => {
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
    onClose();
  };

  const handleReviewSkipped = () => {
    // Reset to list, filter to only skipped items
    setItemsWithoutPhotos(prev =>
      prev.filter(item => skippedInSession.has(item.id))
    );
    setSkippedInSession(new Set());
    setCapturedInSession({});
    setScreen("list");
  };

  const progressPercent = itemsWithoutPhotos.length > 0
    ? Math.round(
        ((Object.keys(capturedInSession).length + skippedInSession.size) /
          itemsWithoutPhotos.length) *
          100
      )
    : 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 p-0 max-w-lg h-[100dvh] md:h-auto md:max-h-[90vh] rounded-none md:rounded-lg flex flex-col gap-0 overflow-hidden">
        {/* Progress Bar */}
        <div className="h-1 bg-zinc-800">
          <div
            className="h-full bg-orange-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          {screen !== "completion" ? (
            <>
              <button
                onClick={handleExitCapture}
                className="text-zinc-400 hover:text-zinc-100 p-2 -ml-2"
              >
                <X className="w-5 h-5" />
              </button>
              <span className="text-sm text-zinc-400 font-medium">
                {screen === "capture"
                  ? `${Math.min(Object.keys(capturedInSession).length + skippedInSession.size + (justSaved ? 0 : 1), itemsWithoutPhotos.length)} of ${itemsWithoutPhotos.length}`
                  : "Photo Capture"}
              </span>
              <div className="w-9 flex items-center justify-end">
                {inFlightCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-orange-400" title={`${inFlightCount} uploading`}>
                    <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                    {inFlightCount}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="w-full" />
          )}
        </div>

        {/* Content */}
        <div className={`flex-1 min-h-0 ${screen === "capture" ? "" : "overflow-y-auto px-4 py-4"}`}>
          {screen === "list" && (
            <PhotoCaptureItemList
              items={itemsWithoutPhotos}
              onSelectItem={handleStartCapture}
              onStart={handleStartCapture}
              capturedInSession={capturedInSession}
            />
          )}

          {screen === "capture" && currentItem && (
            <PhotoCaptureScreen
              key={currentItem.id}
              item={currentItem}
              onApprove={handleApprovePhoto}
              onSkip={handleSkipItem}
              onExit={handleExitCapture}
              isUploading={false}
              justSaved={justSaved}
            />
          )}

          {screen === "completion" && (
            <PhotoCaptureCompletion
              capturedCount={Object.keys(capturedInSession).length}
              skippedCount={skippedInSession.size}
              onExit={handleExitCompletion}
              onReviewSkipped={skippedInSession.size > 0 ? handleReviewSkipped : undefined}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}