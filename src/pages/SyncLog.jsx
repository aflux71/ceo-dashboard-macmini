import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, Search, Play, Zap } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

const STATUS_ICON = {
  success: <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />,
  error: <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />,
  partial: <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />,
};

const STATUS_COLORS = {
  success: "bg-green-500/10 text-green-400 border-green-500/20",
  error: "bg-red-500/10 text-red-400 border-red-500/20",
  partial: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const SYNC_TYPE_LABELS = {
  shopify_orders: "Shopify Orders",
  shopify_inventory: "Shopify Inventory",
  demand_summaries: "Demand Summaries",
  manual: "Manual",
};

export default function SyncLog() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["sync-logs-all"],
    queryFn: () => base44.entities.SyncLog.list("-created_date", 200),
  });

  const filtered = logs.filter((log) => {
    if (statusFilter !== "all" && log.status !== statusFilter) return false;
    if (typeFilter !== "all" && log.sync_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !SYNC_TYPE_LABELS[log.sync_type]?.toLowerCase().includes(q) &&
        !log.notes?.toLowerCase().includes(q) &&
        !log.triggered_by?.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const successCount = logs.filter((l) => l.status === "success").length;
  const errorCount = logs.filter((l) => l.status === "error").length;
  const partialCount = logs.filter((l) => l.status === "partial").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
          <RefreshCw className="w-6 h-6 text-zinc-400" />
          Sync Log
        </h1>
        <p className="text-zinc-500 text-sm mt-1">Full history of data sync operations</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500">Total Syncs</p>
            <p className="text-2xl font-bold text-zinc-100">{logs.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-green-500/10 border-green-500/20">
          <CardContent className="p-4">
            <p className="text-xs text-green-400">Successful</p>
            <p className="text-2xl font-bold text-green-400">{successCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-500/10 border-amber-500/20">
          <CardContent className="p-4">
            <p className="text-xs text-amber-400">Partial</p>
            <p className="text-2xl font-bold text-amber-400">{partialCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-red-500/10 border-red-500/20">
          <CardContent className="p-4">
            <p className="text-xs text-red-400">Errors</p>
            <p className="text-2xl font-bold text-red-400">{errorCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by type, notes, user..."
                className="pl-9 bg-zinc-800 border-zinc-700"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] bg-zinc-800 border-zinc-700">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px] bg-zinc-800 border-zinc-700">
                <SelectValue placeholder="Sync Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="shopify_orders">Shopify Orders</SelectItem>
                <SelectItem value="shopify_inventory">Shopify Inventory</SelectItem>
                <SelectItem value="demand_summaries">Demand Summaries</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Log Table */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base text-zinc-200">
            {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-zinc-500">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">No sync records found</div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {filtered.map((log) => (
                <div key={log.id} className="p-4 hover:bg-zinc-800/30 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      {STATUS_ICON[log.status]}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-zinc-200">
                            {SYNC_TYPE_LABELS[log.sync_type] || log.sync_type}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[log.status]}`}>
                            {log.status}
                          </span>
                          {log.triggered_by && (
                            <span className="text-xs text-zinc-500">by {log.triggered_by}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3 mt-1 text-xs text-zinc-500">
                          {log.records_processed != null && (
                            <span>{log.records_processed} processed</span>
                          )}
                          {log.records_created != null && log.records_created > 0 && (
                            <span className="text-green-500">+{log.records_created} created</span>
                          )}
                          {log.records_updated != null && log.records_updated > 0 && (
                            <span className="text-blue-400">~{log.records_updated} updated</span>
                          )}
                          {log.duration_seconds != null && (
                            <span>{log.duration_seconds}s</span>
                          )}
                          {log.date_range_start && (
                            <span>
                              {log.date_range_start}
                              {log.date_range_end ? ` → ${log.date_range_end}` : ""}
                            </span>
                          )}
                        </div>
                        {log.notes && (
                          <p className="text-xs text-zinc-400 mt-1 max-w-lg">{log.notes}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-xs text-zinc-500 whitespace-nowrap">
                      <p>{format(new Date(log.created_date), "MMM d, yyyy")}</p>
                      <p>{format(new Date(log.created_date), "h:mm a")}</p>
                      <p className="text-zinc-600 mt-0.5">
                        {formatDistanceToNow(new Date(log.created_date), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}