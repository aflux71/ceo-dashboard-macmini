import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, ArrowRight } from "lucide-react";

export default function PhotoCaptureCompletion({ capturedCount, skippedCount, onExit, onReviewSkipped }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 px-4 py-6">
      <div className="text-center space-y-6 max-w-sm">
        {/* Success Icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
        </div>

        {/* Message */}
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 mb-2">All Done!</h2>
          <div className="text-sm text-zinc-400 space-y-1">
            <p>✓ {capturedCount} photos captured</p>
            {skippedCount > 0 && (
              <p>⊘ {skippedCount} item{skippedCount > 1 ? "s" : ""} skipped</p>
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="space-y-2 pt-4">
          <Button
            onClick={onExit}
            className="w-full bg-orange-500 hover:bg-orange-600 h-12"
          >
            <ArrowRight className="w-4 h-4 mr-2" />
            Back to Inventory
          </Button>
          {skippedCount > 0 && (
            <Button
              onClick={onReviewSkipped}
              variant="outline"
              className="w-full h-12 border-zinc-700 text-zinc-200"
            >
              Review Skipped Items
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}