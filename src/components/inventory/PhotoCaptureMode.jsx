import React, { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

  const uploadPhotoMutation = useMutation({
    mutationFn: async ({ itemId, photoData }) => {
      // Convert base64 to blob
      const byteCharacters = atob(photoData.split(",")[1]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "image/jpeg" });

      // Upload file
      const uploadRes = await base44.integrations.Core.UploadFile({ file: blob });
      const fileUrl = uploadRes.file_url;

      // Update inventory item
      await base44.entities.Inventory.update(itemId, {
        component_photo: fileUrl
      });

      return fileUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    }
  });

  const handleStartCapture = (item) => {
    setCurrentItem(item);
    setScreen("capture");
  };

  const handleApprovePhoto = async (photoData) => {
    if (!currentItem) return;

    try {
      await uploadPhotoMutation.mutateAsync({
        itemId: currentItem.id,
        photoData
      });

      // Mark as captured + show saved confirmation
      setCapturedInSession(prev => ({ ...prev, [currentItem.id]: true }));
      setJustSaved(true);

      // Auto-advance to next item
      const currentIndex = itemsWithoutPhotos.findIndex(i => i.id === currentItem.id);
      const remainingItems = itemsWithoutPhotos.slice(currentIndex + 1).filter(
        item => !skippedInSession.has(item.id) && !capturedInSession[item.id]
      );

      if (remainingItems.length > 0) {
        toast.success("Saved! Moving to next...", { duration: 1200 });
        setTimeout(() => {
          setJustSaved(false);
          handleStartCapture(remainingItems[0]);
        }, 1100);
      } else {
        // All done
        toast.success("All photos captured!");
        setTimeout(() => {
          setJustSaved(false);
          setScreen("completion");
        }, 1100);
      }
    } catch (error) {
      setJustSaved(false);
      toast.error("Failed to save photo");
    }
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
    if (savedCount > 0 && !confirm(`You've captured ${savedCount} photos. Exit?`)) {
      return;
    }
    onClose();
  };

  const handleExitCompletion = () => {
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
                {screen === "capture" ? `${Object.keys(capturedInSession).length + skippedInSession.size + 1} of ${itemsWithoutPhotos.length}` : "Photo Capture"}
              </span>
              <div className="w-9" />
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
              isUploading={uploadPhotoMutation.isPending}
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