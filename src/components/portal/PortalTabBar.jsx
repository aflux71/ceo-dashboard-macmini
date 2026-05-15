import React from "react";
import { ShoppingCart, ClipboardEdit } from "lucide-react";

const TABS = [
  { id: "order", label: "Place Order", icon: ShoppingCart },
  { id: "adjustment", label: "Inventory Adjustment", icon: ClipboardEdit }
];

export default function PortalTabBar({ activeTab, onChange }) {
  return (
    <div className="bg-zinc-900 border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-orange-500 text-orange-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}