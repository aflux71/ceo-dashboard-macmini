import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { setPortalSession, getPortalSession } from "@/components/portal/portalSession";
import { Store, Lock } from "lucide-react";

export default function PortalLogin() {
  const navigate = useNavigate();
  const [storeName, setStoreName] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getPortalSession()) {
      navigate("/portal/order", { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await base44.functions.invoke("portalLogin", {
        store_name: storeName,
        access_code: accessCode
      });
      if (res?.data?.success) {
        setPortalSession(res.data.account);
        const stores = res.data.account.assigned_stores || [res.data.account.store_name];
        if (stores.length > 1) {
          navigate("/portal/select-store", { replace: true });
        } else {
          navigate("/portal/order", { replace: true });
        }
      } else {
        setError(res?.data?.error || "Invalid store name or access code");
      }
    } catch (err) {
      setError("Invalid store name or access code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2">neōb</h1>
          <p className="text-zinc-400 text-sm">Store Order Portal</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="store" className="text-zinc-300 mb-2 flex items-center gap-2">
                <Store className="w-4 h-4" /> Store Name
              </Label>
              <Input
                id="store"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="e.g. Main Street Store"
                className="bg-zinc-800 border-zinc-700 text-white"
                required
              />
            </div>

            <div>
              <Label htmlFor="code" className="text-zinc-300 mb-2 flex items-center gap-2">
                <Lock className="w-4 h-4" /> Access Code
              </Label>
              <Input
                id="code"
                type="password"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="6-digit code"
                className="bg-zinc-800 border-zinc-700 text-white tracking-widest"
                required
              />
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5"
            >
              {loading ? "Verifying..." : "Enter Portal"}
            </Button>
          </form>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          Authorized store users only
        </p>
      </div>
    </div>
  );
}