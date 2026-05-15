import React from "react";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default function PortalTopBar({ storeName, onLogout }) {
  return (
    <div className="sticky top-0 z-30 bg-zinc-900 border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-2xl font-bold text-white">neōb</span>
          <span className="text-xs px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded-full font-medium">
            Store Portal
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-400 hidden sm:inline">
            Ordering as: <span className="text-white font-medium">{storeName}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onLogout}
            className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
}