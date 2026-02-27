import React, { useState } from "react";
import { useFloorPin } from "./FloorPinContext";
import { Button } from "@/components/ui/button";
import { Loader2, Delete } from "lucide-react";

export default function PinLoginScreen() {
  const { login } = useFloorPin();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDigit = (digit) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError("");
      
      // Auto-submit when 4 digits entered
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
    const result = await login(pinCode);
    setLoading(false);

    if (!result.success) {
      setError(result.error);
      setPin("");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white">neōb</h1>
          <p className="text-zinc-500 mt-2">Production Tracker</p>
        </div>

        {/* PIN Display */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
          <p className="text-center text-zinc-400 text-sm mb-4">Enter your 4-digit PIN</p>
          
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
            <p className="text-center text-red-400 text-sm mb-4">{error}</p>
          )}

          {loading && (
            <div className="flex justify-center mb-4">
              <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
            </div>
          )}
        </div>

        {/* Number Pad */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <button
                key={digit}
                onClick={() => handleDigit(String(digit))}
                disabled={loading}
                className="h-16 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white text-2xl font-semibold transition-colors disabled:opacity-50"
              >
                {digit}
              </button>
            ))}
            <button
              onClick={handleClear}
              disabled={loading}
              className="h-16 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm font-medium transition-colors disabled:opacity-50"
            >
              Clear
            </button>
            <button
              onClick={() => handleDigit("0")}
              disabled={loading}
              className="h-16 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white text-2xl font-semibold transition-colors disabled:opacity-50"
            >
              0
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="h-16 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              <Delete className="w-6 h-6" />
            </button>
          </div>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          Contact your supervisor if you forgot your PIN
        </p>
      </div>
    </div>
  );
}