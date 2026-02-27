import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Delete, ShieldCheck } from "lucide-react";

export default function PinVerifyDialog({ open, onOpenChange, onVerified, title = "Verify with PIN" }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDigit = (digit) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError("");
      
      if (newPin.length === 4) {
        handleSubmit(newPin);
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError("");
  };

  const handleClear = () => {
    setPin("");
    setError("");
  };

  const handleSubmit = async (pinToSubmit) => {
    const pinCode = pinToSubmit || pin;
    if (pinCode.length !== 4) {
      setError("Enter 4-digit PIN");
      return;
    }

    setLoading(true);
    try {
      const users = await base44.entities.FloorUser.filter({ pin: pinCode, active: true });
      if (users.length === 0) {
        setError("Invalid PIN");
        setPin("");
      } else {
        const user = users[0];
        onVerified(user);
        setPin("");
        setError("");
        onOpenChange(false);
      }
    } catch (err) {
      setError("Verification failed");
      setPin("");
    }
    setLoading(false);
  };

  const handleClose = () => {
    setPin("");
    setError("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 justify-center">
            <ShieldCheck className="w-5 h-5 text-orange-400" />
            {title}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* PIN Display */}
          <div className="flex justify-center gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-12 h-12 rounded-lg border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                  pin.length > i
                    ? "bg-orange-500/20 border-orange-500 text-orange-400"
                    : "bg-zinc-800 border-zinc-700 text-zinc-600"
                }`}
              >
                {pin.length > i ? "•" : ""}
              </div>
            ))}
          </div>

          {error && (
            <p className="text-center text-red-400 text-sm">{error}</p>
          )}

          {loading && (
            <div className="flex justify-center">
              <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
            </div>
          )}

          {/* Number Pad */}
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <button
                key={digit}
                onClick={() => handleDigit(String(digit))}
                disabled={loading}
                className="h-14 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white text-xl font-semibold transition-colors disabled:opacity-50"
              >
                {digit}
              </button>
            ))}
            <button
              onClick={handleClear}
              disabled={loading}
              className="h-14 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm font-medium transition-colors disabled:opacity-50"
            >
              Clear
            </button>
            <button
              onClick={() => handleDigit("0")}
              disabled={loading}
              className="h-14 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white text-xl font-semibold transition-colors disabled:opacity-50"
            >
              0
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="h-14 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}