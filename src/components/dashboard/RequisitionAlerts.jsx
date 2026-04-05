import React from "react";
import { createPageUrl } from "@/utils";
import { AlertTriangle, ArrowRight, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Badge from "@/components/ui/Badge";

const urgencyConfig = {
  low: { color: "blue", label: "Low" },
  medium: { color: "amber", label: "Medium" },
  high: { color: "orange", label: "High" },
  critical: { color: "red", label: "Critical" }
};

export default function RequisitionAlerts({ requisitions = [] }) {
  const [showAll, setShowAll] = React.useState(false);
  const pending = requisitions.filter(r => r.status === "pending");
  const critical = pending.filter(r => r.urgency === "critical");
  const high = pending.filter(r => r.urgency === "high");
  
  if (pending.length === 0) return null;

  const visibleItems = showAll ? pending : pending.slice(0, 5);

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            Pending Requisitions
            <Badge variant="amber">{pending.length}</Badge>
          </CardTitle>
          <a href={createPageUrl("PurchaseRequisitions")}>
            <Button variant="ghost" size="sm">
              View All <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </a>
        </div>
      </CardHeader>
      <CardContent>
        {/* Critical Alert */}
        {critical.length > 0 && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg mb-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <div>
              <p className="text-red-400 font-medium">{critical.length} Critical Requisition{critical.length > 1 ? 's' : ''}</p>
              <p className="text-xs text-zinc-400">Requires immediate attention</p>
            </div>
          </div>
        )}

        {/* High Priority */}
        {high.length > 0 && (
          <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg mb-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            <div>
              <p className="text-orange-400 font-medium">{high.length} High Priority</p>
              <p className="text-xs text-zinc-400">Should be reviewed soon</p>
            </div>
          </div>
        )}

        {/* Recent Items */}
        <div className="space-y-2 mt-3">
          {visibleItems.map((req) => (
            <div key={req.id} className="flex items-center justify-between p-2 bg-zinc-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-orange-400">{req.item_sku}</span>
                <span className="text-sm text-zinc-300 truncate max-w-[150px]">{req.item_name}</span>
              </div>
              <Badge variant={urgencyConfig[req.urgency]?.color}>
                {urgencyConfig[req.urgency]?.label}
              </Badge>
            </div>
          ))}
          {pending.length > 5 && (
            <button onClick={() => setShowAll(!showAll)} className="w-full text-xs text-zinc-500 hover:text-zinc-300 text-center pt-2 transition-colors">
              {showAll ? "Show less" : `+${pending.length - 5} more pending`}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}