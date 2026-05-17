import React, { useState, useEffect, useRef } from "react";
import { useFloorPin } from "./FloorPinContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock } from "lucide-react";

export default function PinLoginScreen() {
  const { login, dashboardUser } = useFloorPin();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleChange = (e) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
    setPin(v);
    setError("");
    if (v.length === 4) {
      handleSubmit(v);
    }
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
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const displayName = dashboardUser?.full_name || dashboardUser?.email?.split("@")[0] || "";

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        {/* Lock Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
            <Lock className="w-7 h-7 text-slate-700" strokeWidth={2.5} />
          </div>
        </div>

        {/* Headings */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Screen Locked</h1>
          {displayName && (
            <p className="text-slate-600 font-medium">Welcome back, {displayName}</p>
          )}
          <p className="text-slate-400 text-sm mt-1">Enter your PIN to unlock</p>
        </div>

        {/* PIN Input */}
        <div className="space-y-2 mb-4">
          <Label htmlFor="pin-input" className="text-slate-900 font-semibold">
            4-Digit PIN
          </Label>
          <Input
            id="pin-input"
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder="••••"
            className="h-12 text-center text-2xl tracking-[0.5em] text-slate-900 placeholder:text-slate-300 bg-white border-slate-300 focus-visible:ring-slate-900"
          />
        </div>

        {error && (
          <p className="text-center text-red-500 text-sm mb-3">{error}</p>
        )}

        {/* Unlock Button */}
        <Button
          onClick={() => handleSubmit()}
          disabled={loading || pin.length !== 4}
          className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-base rounded-lg"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            "Unlock"
          )}
        </Button>

        <p className="text-center text-slate-400 text-xs mt-6">
          Contact your supervisor if you forgot your PIN
        </p>
      </div>
    </div>
  );
}