import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Factory,
  ClipboardCheck,
  Package,
  LogOut,
  User,
  Clock,
  AlertTriangle,
  Loader2,
  Delete,
  Sun,
  Moon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import KioskProductionEntry from "@/components/kiosk/KioskProductionEntry";
import KioskQCReview from "@/components/kiosk/KioskQCReview";
import KioskInventoryCheck from "@/components/kiosk/KioskInventoryCheck";

const ROLE_PERMISSIONS = {
  owner: ['production', 'qc', 'inventory'],
  admin: ['production', 'qc', 'inventory'],
  production_lead: ['production', 'qc', 'inventory'],
  production_labor: ['production'],
  qc: ['qc', 'inventory']
};

const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  production_lead: 'Production Lead',
  production_labor: 'Production',
  qc: 'Quality Control'
};

export default function Kiosk() {
  const { theme, setTheme } = useTheme();
  const [kioskUser, setKioskUser] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeModule, setActiveModule] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const { data: floorUsers = [] } = useQuery({
    queryKey: ['floorUsers'],
    queryFn: () => base44.entities.FloorUser.list(),
  });

  const { data: pendingBatches = [] } = useQuery({
    queryKey: ['pendingBatches'],
    queryFn: () => base44.entities.Batch.filter({ status: 'pending_qc' }),
    enabled: !!kioskUser,
  });

  const handleDigit = (digit) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError("");
      if (newPin.length === 4) {
        handleLogin(newPin);
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

  const handleLogin = async (pinCode) => {
    setLoading(true);
    const user = floorUsers.find(u => u.pin === pinCode && u.active);
    
    if (user) {
      await base44.entities.FloorUser.update(user.id, {
        last_login: new Date().toISOString()
      });
      setKioskUser(user);
      setError("");
    } else {
      setError("Invalid PIN");
      setPin("");
    }
    setLoading(false);
  };

  const handleLogout = () => {
    setKioskUser(null);
    setActiveModule(null);
    setPin("");
  };

  const hasPermission = (module) => {
    if (!kioskUser) return false;
    return ROLE_PERMISSIONS[kioskUser.role]?.includes(module) || false;
  };

  // PIN Entry Screen
  if (!kioskUser) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold text-white">neōb</h1>
            <p className="text-zinc-500 mt-2 text-lg">Kiosk Mode</p>
            <p className="text-zinc-600 text-sm mt-1">
              {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* PIN Display */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 mb-4">
            <p className="text-center text-zinc-400 text-lg mb-6">Enter your PIN</p>
            
            <div className="flex justify-center gap-4 mb-8">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-16 h-16 rounded-xl border-2 flex items-center justify-center text-3xl font-bold transition-all ${
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
              <div className="flex items-center justify-center gap-2 text-red-400 mb-4">
                <AlertTriangle className="w-5 h-5" />
                <span>{error}</span>
              </div>
            )}

            {loading && (
              <div className="flex justify-center mb-4">
                <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
              </div>
            )}
          </div>

          {/* Number Pad */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                <button
                  key={digit}
                  onClick={() => handleDigit(String(digit))}
                  disabled={loading}
                  className="h-20 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white text-3xl font-semibold transition-colors disabled:opacity-50"
                >
                  {digit}
                </button>
              ))}
              <button
                onClick={handleClear}
                disabled={loading}
                className="h-20 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-lg font-medium transition-colors disabled:opacity-50"
              >
                Clear
              </button>
              <button
                onClick={() => handleDigit("0")}
                disabled={loading}
                className="h-20 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white text-3xl font-semibold transition-colors disabled:opacity-50"
              >
                0
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="h-20 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                <Delete className="w-8 h-8" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Module Active
  if (activeModule) {
    return (
      <div className="min-h-screen bg-zinc-950">
        {/* Kiosk Header */}
        <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => setActiveModule(null)}
                className="text-zinc-400"
              >
                ← Back
              </Button>
              <div>
                <h1 className="text-xl font-bold text-white">
                  {activeModule === 'production' && 'Production Entry'}
                  {activeModule === 'qc' && 'QC Review'}
                  {activeModule === 'inventory' && 'Inventory Check'}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-zinc-400">{kioskUser.name}</p>
                <p className="text-xs text-zinc-600">{ROLE_LABELS[kioskUser.role]}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="text-zinc-400">
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Module Content */}
        <div className="p-6">
          {activeModule === 'production' && <KioskProductionEntry user={kioskUser} onComplete={() => setActiveModule(null)} />}
          {activeModule === 'qc' && <KioskQCReview user={kioskUser} onComplete={() => setActiveModule(null)} />}
          {activeModule === 'inventory' && <KioskInventoryCheck user={kioskUser} />}
        </div>
      </div>
    );
  }

  // Main Menu
  return (
    <div className="min-h-screen bg-zinc-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">neōb Kiosk</h1>
          <p className="text-zinc-500 mt-1">
            {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} • {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
              <User className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <p className="text-zinc-200 font-medium">{kioskUser.name}</p>
              <p className="text-xs text-zinc-500">{ROLE_LABELS[kioskUser.role]}</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="h-12 px-4 text-zinc-400 border-zinc-700"
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>
          <Button 
            variant="outline" 
            onClick={handleLogout}
            className="h-12 px-4 text-zinc-400 border-zinc-700"
          >
            <LogOut className="w-5 h-5 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      {pendingBatches.length > 0 && hasPermission('qc') && (
        <div className="mb-8 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
            <Clock className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <p className="text-amber-400 font-semibold">{pendingBatches.length} Batches Pending QC</p>
            <p className="text-sm text-zinc-400">Review and approve completed production batches</p>
          </div>
        </div>
      )}

      {/* Main Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Production Entry */}
        <button
          onClick={() => hasPermission('production') && setActiveModule('production')}
          disabled={!hasPermission('production')}
          className={`p-8 rounded-2xl border-2 transition-all text-left ${
            hasPermission('production')
              ? 'bg-zinc-900 border-zinc-800 hover:border-orange-500/50 hover:bg-zinc-800/50 active:scale-[0.98]'
              : 'bg-zinc-900/50 border-zinc-800/50 opacity-50 cursor-not-allowed'
          }`}
        >
          <div className="w-16 h-16 rounded-2xl bg-orange-500/20 flex items-center justify-center mb-4">
            <Factory className="w-8 h-8 text-orange-400" />
          </div>
          <h3 className="text-xl font-bold text-zinc-100 mb-2">Production Entry</h3>
          <p className="text-zinc-500">
            Record batch production, material usage, and procedures
          </p>
        </button>

        {/* QC Review */}
        <button
          onClick={() => hasPermission('qc') && setActiveModule('qc')}
          disabled={!hasPermission('qc')}
          className={`p-8 rounded-2xl border-2 transition-all text-left relative ${
            hasPermission('qc')
              ? 'bg-zinc-900 border-zinc-800 hover:border-green-500/50 hover:bg-zinc-800/50 active:scale-[0.98]'
              : 'bg-zinc-900/50 border-zinc-800/50 opacity-50 cursor-not-allowed'
          }`}
        >
          {pendingBatches.length > 0 && hasPermission('qc') && (
            <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center">
              <span className="text-white font-bold">{pendingBatches.length}</span>
            </div>
          )}
          <div className="w-16 h-16 rounded-2xl bg-green-500/20 flex items-center justify-center mb-4">
            <ClipboardCheck className="w-8 h-8 text-green-400" />
          </div>
          <h3 className="text-xl font-bold text-zinc-100 mb-2">QC Review</h3>
          <p className="text-zinc-500">
            Review and approve pending production batches
          </p>
        </button>

        {/* Inventory Check */}
        <button
          onClick={() => hasPermission('inventory') && setActiveModule('inventory')}
          disabled={!hasPermission('inventory')}
          className={`p-8 rounded-2xl border-2 transition-all text-left ${
            hasPermission('inventory')
              ? 'bg-zinc-900 border-zinc-800 hover:border-blue-500/50 hover:bg-zinc-800/50 active:scale-[0.98]'
              : 'bg-zinc-900/50 border-zinc-800/50 opacity-50 cursor-not-allowed'
          }`}
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-4">
            <Package className="w-8 h-8 text-blue-400" />
          </div>
          <h3 className="text-xl font-bold text-zinc-100 mb-2">Inventory Check</h3>
          <p className="text-zinc-500">
            View stock levels and flag items for reorder
          </p>
        </button>
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between text-sm text-zinc-500">
          <span>neōb Production Tracker • Kiosk Mode</span>
          <span>Tap anywhere to interact</span>
        </div>
      </div>
    </div>
  );
}