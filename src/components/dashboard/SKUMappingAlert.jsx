import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { AlertTriangle, ArrowRight, Link2 } from "lucide-react";

export default function SKUMappingAlert() {
  const { data: pendingMappings = [] } = useQuery({
    queryKey: ["sku-mappings-pending"],
    queryFn: () => base44.entities.SKUMapping.filter({ status: "pending" }),
  });

  if (pendingMappings.length === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
      <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
        <Link2 className="w-5 h-5 text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-300">
          {pendingMappings.length} SKU mapping{pendingMappings.length !== 1 ? "s" : ""} pending approval
        </p>
        <p className="text-xs text-amber-400/70 mt-0.5">
          UPC or SKU changes detected — approve mappings to prevent duplicate inventory records.
        </p>
        <div className="flex gap-2 mt-1.5 flex-wrap">
          {pendingMappings.slice(0, 3).map((m) => (
            <span key={m.id} className="text-[10px] font-mono text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded">
              {m.old_sku} → {m.new_sku}
            </span>
          ))}
          {pendingMappings.length > 3 && (
            <span className="text-[10px] text-amber-400/60">
              +{pendingMappings.length - 3} more
            </span>
          )}
        </div>
      </div>
      <Link
        to={createPageUrl("DemandPlanner") + "?tab=settings"}
        className="flex items-center gap-1 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium rounded-lg transition-colors shrink-0"
      >
        Review <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}