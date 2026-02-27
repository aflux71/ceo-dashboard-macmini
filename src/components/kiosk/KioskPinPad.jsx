import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Delete, AlertTriangle, ShieldCheck } from "lucide-react";

export default function KioskPinPad({ open, onClose, onVerified, floorUsers, title }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDigit = (digit) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError("");
      if (newPin.length === 4) {
        handleVerify(newPin);
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

  const handleVerify = async (pinCode) => {
    setLoading(true);
    const user = floorUsers.find(u => u.pin === pinCode && u.active);
    
    if (user) {
      onVerified(user);
      setPin("");
      setError("");
    } else {
      setError("Invalid PIN");
      setPin("");
    }
    setLoading(false);
  };

  const handleClose = () => {
    setPin("");
    setError("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center flex items-center justify-center gap-2 text-zinc-100">
            <ShieldCheck className="w-5 h-5 text-orange-400" />
            {title || "Verify"}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {/* PIN Display */}
          <div className="flex justify-center gap-3 mb-6">
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
            <div className="flex items-center justify-center gap-2 text-red-400 text-sm mb-4">
              <AlertTriangle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          {loading && (
            <div className="flex justify-center mb-4">
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