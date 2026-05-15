import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Store, LogOut } from "lucide-react";
import {
  getPortalSession,
  clearPortalSession,
  setActiveStore,
} from "@/components/portal/portalSession";

export default function PortalSelectStore() {
  const navigate = useNavigate();
  const session = getPortalSession();

  useEffect(() => {
    if (!session) {
      navigate("/portal/login", { replace: true });
      return;
    }
    const stores = session.assigned_stores || [session.store_name];
    // If only one store, auto-select and continue
    if (stores.length === 1) {
      setActiveStore(stores[0]);
      navigate("/portal/order", { replace: true });
    }
    // eslint-disable-next-line
  }, []);

  if (!session) return null;
  const stores = session.assigned_stores || [session.store_name];

  const handlePick = (name) => {
    setActiveStore(name);
    navigate("/portal/order", { replace: true });
  };

  const handleLogout = () => {
    clearPortalSession();
    navigate("/portal/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2">neōb</h1>
          <p className="text-zinc-400 text-sm">Select Store</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl">
          <p className="text-sm text-zinc-400 mb-4">
            You have access to multiple stores. Choose which store you want to order for:
          </p>
          <div className="space-y-2">
            {stores.map((name) => (
              <button
                key={name}
                onClick={() => handlePick(name)}
                className="w-full flex items-center gap-3 p-4 rounded-lg border border-zinc-800 bg-zinc-800/40 hover:bg-zinc-800 hover:border-orange-500/50 text-left transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <Store className="w-4 h-4 text-orange-400" />
                </div>
                <span className="text-white font-medium">{name}</span>
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            onClick={handleLogout}
            className="w-full mt-6 border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
        </div>
      </div>
    </div>
  );
}