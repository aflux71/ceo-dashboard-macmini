import React, { useMemo, useState } from "react";
import { Search, AlertTriangle, TrendingUp, Package, CheckCircle, Copy, Printer, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Badge from "@/components/ui/Badge";
import { toast } from "sonner";
import { urgencyConfig } from "./ForecastResults";

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200];

export default function InventoryStatusTab({ results = [], salesData }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [sortField, setSortField] = useState("coverage");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Derive unique location names from salesData
  const locations = useMemo(() => {
    const allRows = [...(salesData?.retail || []), ...(salesData?.online || [])];
    const locs = new Set(allRows.map(r => r.location).filter(Boolean));
    return Array.from(locs).sort();
  }, [salesData]);

  // Build per-location on-hand data (sum of sales per SKU per location)
  // We use location sales velocity to estimate how inventory is distributed across locations
  const locationOnHandMap = useMemo(() => {
    if (locationFilter === "all") return null;
    const allRows = [...(salesData?.retail || []), ...(salesData?.online || [])];
    
    // Calculate total qty per SKU overall and per location
    const skuTotal = {};
    const skuLocation = {};
    allRows.forEach(r => {
      if (!r.sku) return;
      skuTotal[r.sku] = (skuTotal[r.sku] || 0) + (r.qty || 0);
      if (r.location === locationFilter) {
        skuLocation[r.sku] = (skuLocation[r.sku] || 0) + (r.qty || 0);
      }
    });

    // For each SKU, estimate on-hand at this location as proportion of total sales
    const map = {};
    results.forEach(item => {
      const total = skuTotal[item.sku] || 0;
      const locQty = skuLocation[item.sku] || 0;
      const proportion = total > 0 ? locQty / total : 0;
      map[item.sku] = {
        onHand: Math.round(item.onHand * proportion),
        proportion,
        locSales: locQty,
        totalSales: total
      };
    });
    return map;
  }, [locationFilter, salesData, results]);

  // Get effective on-hand for an item given current location filter
  const getEffectiveOnHand = (item) => {
    if (!locationOnHandMap) return item.onHand;
    return locationOnHandMap[item.sku]?.onHand ?? 0;
  };

  // Get monthly demand scaled to location if filtered
  const getEffectiveMonthlyDemand = (item) => {
    const base = item.forecastTotal ? Math.round(item.forecastTotal / 6) : 0;
    if (!locationOnHandMap) return base;
    const proportion = locationOnHandMap[item.sku]?.proportion ?? 0;
    return Math.round(base * proportion);
  };

  const statusGroups = useMemo(() => {
    const groups = {
      outOfStock: { label: "Out of Stock", icon: AlertTriangle, color: "red", items: [] },
      critical: { label: "Critical (<1 mo)", icon: AlertTriangle, color: "red", items: [] },
      low: { label: "Low (1-2 mo)", icon: TrendingUp, color: "amber", items: [] },
      adequate: { label: "Adequate (2-4 mo)", icon: Package, color: "blue", items: [] },
      healthy: { label: "Healthy (4+ mo)", icon: CheckCircle, color: "green", items: [] }
    };

    results.forEach(item => {
      const oh = getEffectiveOnHand(item);
      const monthlyDemand = item.forecastTotal ? item.forecastTotal / 6 : 0;
      const locMonthlyDemand = locationOnHandMap
        ? monthlyDemand * (locationOnHandMap[item.sku]?.proportion ?? 0)
        : monthlyDemand;
      const mc = locMonthlyDemand > 0 ? oh / locMonthlyDemand : 999;

      if (oh === 0) {
        groups.outOfStock.items.push(item);
      } else if (mc < 1) {
        groups.critical.items.push(item);
      } else if (mc < 2) {
        groups.low.items.push(item);
      } else if (mc < 4) {
        groups.adequate.items.push(item);
      } else {
        groups.healthy.items.push(item);
      }
    });

    return groups;
  }, [results, locationOnHandMap]);

  const filteredItems = useMemo(() => {
    let items = [];
    if (statusFilter === "all") {
      items = results;
    } else {
      items = statusGroups[statusFilter]?.items || [];
    }

    return items.filter(item => 
      !search ||
      item.sku?.toLowerCase().includes(search.toLowerCase()) ||
      item.product?.toLowerCase().includes(search.toLowerCase())
    ).sort((a, b) => {
      let valA, valB;
      switch (sortField) {
        case "sku": valA = a.sku || ""; valB = b.sku || ""; break;
        case "product": valA = a.product || ""; valB = b.product || ""; break;
        case "category": valA = a.category || ""; valB = b.category || ""; break;
        case "onHand": valA = a.onHand || 0; valB = b.onHand || 0; break;
        case "monthlyDemand": valA = a.forecastTotal ? Math.round(a.forecastTotal / 6) : 0; valB = b.forecastTotal ? Math.round(b.forecastTotal / 6) : 0; break;
        case "coverage":
        default: valA = a.monthsCover || 0; valB = b.monthsCover || 0; break;
      }
      if (typeof valA === "string") return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return sortDir === "asc" ? valA - valB : valB - valA;
    });
  }, [results, statusGroups, search, statusFilter, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortHeader = ({ field, children, align = "left" }) => (
    <th 
      className={`p-4 text-xs font-semibold text-zinc-400 uppercase cursor-pointer hover:text-zinc-200 ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => handleSort(field)}
    >
      <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
        {children}
        {sortField === field && <span className="text-orange-400">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </div>
    </th>
  );

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / pageSize);
  const paginatedResults = filteredItems.slice((page - 1) * pageSize, page * pageSize);

  React.useEffect(() => {
    setPage(1);
  }, [search, statusFilter, locationFilter, pageSize]);

  const handlePrint = () => {
    window.print();
  };

  const copyForSheets = () => {
    const headers = ['SKU', 'Product', 'Category', 'On Hand', 'Monthly Demand', 'Coverage', 'Status'];
    const rows = filteredItems.map(item => {
      const monthlyDemand = item.forecastTotal ? Math.round(item.forecastTotal / 6) : 0;
      let statusLabel = "Healthy";
      if (item.onHand === 0) statusLabel = "Out of Stock";
      else if (item.monthsCover < 1) statusLabel = "Critical";
      else if (item.monthsCover < 2) statusLabel = "Low";
      else if (item.monthsCover < 4) statusLabel = "Adequate";
      return [item.sku, item.product, item.category || '-', item.onHand, monthlyDemand, item.monthsCover >= 999 ? '∞' : `${Math.round(item.monthsCover * 10) / 10}mo`, statusLabel];
    });
    const tsv = [headers, ...rows].map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(statusGroups).map(([key, group]) => {
          const Icon = group.icon;
          const colorClasses = {
            red: "bg-red-950/30 border-red-800/30 text-red-400",
            amber: "bg-amber-950/30 border-amber-800/30 text-amber-400",
            blue: "bg-blue-950/30 border-blue-800/30 text-blue-400",
            green: "bg-green-950/30 border-green-800/30 text-green-400"
          };
          return (
            <div 
              key={key} 
              className={`p-4 rounded-lg border cursor-pointer hover:opacity-80 transition-opacity ${colorClasses[group.color]} ${statusFilter === key ? 'ring-2 ring-offset-2 ring-offset-zinc-900' : ''}`}
              onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase">{group.label}</span>
              </div>
              <div className="text-2xl font-bold">{group.items.length}</div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search SKU or product..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-zinc-800 border-zinc-700"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 bg-zinc-800 border-zinc-700">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="outOfStock">Out of Stock</SelectItem>
            <SelectItem value="critical">Critical (&lt;1 mo)</SelectItem>
            <SelectItem value="low">Low (1-2 mo)</SelectItem>
            <SelectItem value="adequate">Adequate (2-4 mo)</SelectItem>
            <SelectItem value="healthy">Healthy (4+ mo)</SelectItem>
          </SelectContent>
        </Select>
        {locations.length > 0 && (
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-52 bg-zinc-800 border-zinc-700">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-zinc-400" />
                <SelectValue placeholder="All Locations" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map(loc => (
                <SelectItem key={loc} value={loc}>{loc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex gap-2 ml-auto">
          <Button onClick={copyForSheets} variant="outline" size="sm" className="gap-2">
            <Copy className="w-4 h-4" />
            Copy for Sheets
          </Button>
          <Button onClick={handlePrint} variant="outline" size="sm" className="gap-2">
            <Printer className="w-4 h-4" />
            Print
          </Button>
        </div>
      </div>

      {/* Pagination Info */}
      {filteredItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500">
          <div className="flex items-center gap-3">
            <span>
              Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, filteredItems.length)} of {filteredItems.length} items
            </span>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="w-28 h-8 bg-zinc-800 border-zinc-700 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map(size => (
                  <SelectItem key={size} value={String(size)}>{size} per page</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                ← Prev
              </Button>
              <span>Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                Next →
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Results Table */}
      <div className="overflow-x-auto bg-zinc-900 border border-zinc-800 rounded-lg">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-800/50">
              <SortHeader field="sku">SKU</SortHeader>
              <SortHeader field="product">Product</SortHeader>
              <SortHeader field="category">Category</SortHeader>
              <SortHeader field="onHand" align="right">On Hand</SortHeader>
              <SortHeader field="monthlyDemand" align="right">Monthly Demand</SortHeader>
              <SortHeader field="coverage" align="right">Coverage</SortHeader>
              <th className="text-left p-4 text-xs font-semibold text-zinc-400 uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {paginatedResults.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-500">
                  No items found
                </td>
              </tr>
            ) : (
              paginatedResults.map(item => {
                const monthlyDemand = item.forecastTotal ? Math.round(item.forecastTotal / 6) : 0;
                const urgencyInfo = urgencyConfig[item.urgency] || urgencyConfig.ok;
                
                let statusLabel = "Healthy";
                let statusColor = "green";
                if (item.onHand === 0) {
                  statusLabel = "Out of Stock";
                  statusColor = "red";
                } else if (item.monthsCover < 1) {
                  statusLabel = "Critical";
                  statusColor = "red";
                } else if (item.monthsCover < 2) {
                  statusLabel = "Low";
                  statusColor = "amber";
                } else if (item.monthsCover < 4) {
                  statusLabel = "Adequate";
                  statusColor = "blue";
                }

                return (
                  <tr key={item.sku} className="border-b border-zinc-800 hover:bg-zinc-800/30">
                    <td className="p-4">
                      <span className="font-mono text-sm text-orange-400">{item.sku}</span>
                    </td>
                    <td className="p-4 text-zinc-200">{item.product}</td>
                    <td className="p-4 text-zinc-400 text-sm">{item.category || '-'}</td>
                    <td className="p-4 text-right">
                      <span className={`font-semibold ${item.onHand === 0 ? 'text-red-400' : 'text-zinc-200'}`}>
                        {item.onHand}
                      </span>
                    </td>
                    <td className="p-4 text-right text-zinc-400">{monthlyDemand}/mo</td>
                    <td className="p-4 text-right">
                      <span className={`font-semibold ${
                        item.monthsCover < 1 ? 'text-red-400' :
                        item.monthsCover < 2 ? 'text-amber-400' :
                        item.monthsCover >= 999 ? 'text-zinc-600' :
                        'text-green-400'
                      }`}>
                        {item.monthsCover >= 999 ? '∞' : `${Math.round(item.monthsCover * 10) / 10}mo`}
                      </span>
                    </td>
                    <td className="p-4">
                      <Badge variant={statusColor}>{statusLabel}</Badge>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}