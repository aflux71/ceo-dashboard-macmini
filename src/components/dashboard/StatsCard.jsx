import React from "react";

export default function StatsCard({ title, value, subtitle, icon: Icon, trend, trendUp }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 hover:border-orange-500/30 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{title}</p>
          <p className="text-3xl font-bold text-orange-500 mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <Icon className="w-5 h-5 text-orange-500" />
          </div>
        )}
      </div>
      {trend && (
        <div className={`flex items-center mt-3 text-xs ${trendUp ? 'text-green-500' : 'text-red-400'}`}>
          <span>{trend}</span>
        </div>
      )}
    </div>
  );
}