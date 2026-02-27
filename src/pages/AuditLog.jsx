import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Badge from "@/components/ui/Badge";
import {
  Shield,
  Search,
  Filter,
  Clock,
  User,
  FileText,
  Package,
  Settings,
  Factory,
  ShoppingCart,
  Beaker,
  BarChart3,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { format } from "date-fns";

const CATEGORY_CONFIG = {
  user_management: { label: "User Management", icon: User, color: "purple" },
  production: { label: "Production", icon: Factory, color: "orange" },
  inventory: { label: "Inventory", icon: Package, color: "blue" },
  settings: { label: "Settings", icon: Settings, color: "amber" },
  purchase_orders: { label: "Purchase Orders", icon: ShoppingCart, color: "green" },
  recipes: { label: "Recipes", icon: Beaker, color: "cyan" },
  forecasting: { label: "Forecasting", icon: BarChart3, color: "red" },
  other: { label: "Other", icon: FileText, color: "default" }
};

const PAGE_SIZE = 25;

export default function AuditLogPage() {
  const [appUser, setAppUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    base44.auth.me().then(setAppUser).catch(() => setAppUser(null));
  }, []);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["auditLogs"],
    queryFn: () => base44.entities.AuditLog.list("-created_date", 500),
  });

  // Filter logs
  const filteredLogs = logs.filter(log => {
    const matchesSearch = !searchTerm || 
      log.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.performed_by_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "all" || log.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE);
  const paginatedLogs = filteredLogs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Check access - only admin can view
  if (appUser && appUser.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Shield className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-zinc-300">Access Denied</h2>
          <p className="text-zinc-500 mt-2">Only admins can view the audit log</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Audit Log</h1>
          <p className="text-zinc-500 mt-1">Track all significant actions in the system</p>
        </div>
        <Badge variant="blue">{filteredLogs.length} entries</Badge>
      </div>

      {/* Filters */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search actions, users..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
                className="pl-10 bg-zinc-800 border-zinc-700"
              />
            </div>
            <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(0); }}>
              <SelectTrigger className="w-full sm:w-48 bg-zinc-800 border-zinc-700">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>{config.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Log Entries */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="border-b border-zinc-800">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-500" />
            Activity Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-zinc-500">Loading audit log...</div>
          ) : paginatedLogs.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">
              No audit entries found
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {paginatedLogs.map((log) => {
                const config = CATEGORY_CONFIG[log.category] || CATEGORY_CONFIG.other;
                const Icon = config.icon;
                return (
                  <div key={log.id} className="p-4 hover:bg-zinc-800/50 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg bg-${config.color}-500/10`}>
                        <Icon className={`w-5 h-5 text-${config.color}-400`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-zinc-200">{log.action?.replace(/_/g, " ")}</span>
                          <Badge variant={config.color}>{config.label}</Badge>
                        </div>
                        <p className="text-sm text-zinc-400 mt-1">{log.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {log.performed_by_name || "Unknown"} 
                            {log.performed_by_role && ` (${log.performed_by_role})`}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(log.created_date), "MMM d, yyyy h:mm a")}
                          </span>
                          {log.entity_type && (
                            <span className="text-zinc-600">
                              {log.entity_type} {log.entity_id && `#${log.entity_id.slice(-6)}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-zinc-800">
              <span className="text-sm text-zinc-500">
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}