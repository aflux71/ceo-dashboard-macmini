import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pause } from "lucide-react";

const DEFAULT_HOLD_REASONS = [
  "Waiting for materials",
  "Equipment maintenance",
  "Shift change",
  "QC issue - investigating",
  "Supervisor review required",
  "Other"
];

export default function HoldReasonDialog({ open, onOpenChange, onConfirm }) {
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");

  // Fetch custom hold reasons from settings
  const { data: settings = [] } = useQuery({
    queryKey: ['settings'],
    queryFn: () => base44.entities.AppSettings.list(),
  });

  const holdReasonsSettings = settings.find(s => s.key === 'hold_reasons');
  const holdReasons = holdReasonsSettings 
    ? JSON.parse(holdReasonsSettings.value) 
    : DEFAULT_HOLD_REASONS;

  const handleConfirm = () => {
    const reason = selectedReason === "Other" ? customReason : selectedReason;
    if (reason) {
      onConfirm(reason);
      setSelectedReason("");
      setCustomReason("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pause className="w-5 h-5 text-amber-400" />
            Put Batch On Hold
          </DialogTitle>
          <DialogDescription>
            Select or enter a reason for putting this batch on hold.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Hold Reason</Label>
            <Select value={selectedReason} onValueChange={setSelectedReason}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700">
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {holdReasons.map((reason) => (
                  <SelectItem key={reason} value={reason}>
                    {reason}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedReason === "Other" && (
            <div className="space-y-2">
              <Label>Custom Reason</Label>
              <Input
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Enter custom reason..."
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedReason || (selectedReason === "Other" && !customReason)}
            className="bg-amber-500 hover:bg-amber-600"
          >
            <Pause className="w-4 h-4 mr-2" />
            Put On Hold
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}