import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const STATUS_ICON = {
  success: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  error: <XCircle className="w-4 h-4 text-red-400" />,
  partial: <AlertCircle className="w-4 h-4 text-amber-400" />,
};

const SYNC_TYPE_LABELS = {
  shopify_orders: "Shopify Orders",
  shopify_inventory: "Shopify Inventory",
  demand_summaries: "Demand Summaries",
  manual: "Manual",
};

export default function SyncLogMini() {
  const { data: logs = [] } = useQuery({
    queryKey: ["sync-logs-recent"],
    queryFn: () => base44.entities.SyncLog.list("-created_date", 6),
  });

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-zinc-400" />
          Sync Log
        </CardTitle>
        <Link to={createPageUrl("SyncLog")}>
          <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-100">
            Full Log <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-zinc-500 text-sm py-4 text-center">No sync activity recorded</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg border border-zinc-800"
              >
                <div className="flex items-center gap-3">
                  {STATUS_ICON[log.status] || STATUS_ICON.partial}
                  <div>
                    <p className="text-sm font-medium text-zinc-200">
                      {SYNC_TYPE_LABELS[log.sync_type] || log.sync_type}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {log.records_processed != null ? `${log.records_processed} records` : ""}
                      {log.records_created ? ` · ${log.records_created} created` : ""}
                      {log.records_updated ? ` · ${log.records_updated} updated` : ""}
                      {log.notes && !log.records_processed ? log.notes : ""}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-zinc-500 whitespace-nowrap ml-2">
                  {formatDistanceToNow(new Date(log.created_date), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}