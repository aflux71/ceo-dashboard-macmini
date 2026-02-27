import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, Copy, Printer } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Badge from "@/components/ui/Badge";
import { toast } from "sonner";
import { urgencyConfig } from "./ForecastResults";

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200];

export default function CategoryBreakdownTab({ results = [] }) {
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const categoryData = useMemo(() => {
    const grouped = {};
    results.forEach(item => {
      const cat = item.category || "Uncategorized";
      if (!grouped[cat]) {
        grouped[cat] = {
          name: cat,
          items: [],
          totalForecast: 0,
          totalEvents: 0,
          totalOnHand: 0,
          totalOrderQty: 0,
          criticalCount: 0,
          eventCount: 0,
          soonCount: 0
        };
      }
      grouped[cat].items.push(item);
      grouped[cat].totalForecast += item.forecastTotal || 0;
      grouped[cat].totalEvents += item.eventDemand || 0;
      grouped[cat].totalOnHand += item.onHand || 0;
      grouped[cat].totalOrderQty += item.orderQty || 0;
      if (item.urgency === "critical") grouped[cat].criticalCount++;
      if (item.urgency === "event") grouped[cat].eventCount++;
      if (item.urgency === "soon") grouped[cat].soonCount++;
    });

    return Object.values(grouped).sort((a, b) => {
      // Sort by critical count first, then by name
      if (a.criticalCount !== b.criticalCount) return b.criticalCount - a.criticalCount;
      return a.name.localeCompare(b.name);
    });
  }, [results]);

  const filteredCategories = categoryData.filter(cat => 
    !search || 
    cat.name.toLowerCase().includes(search.toLowerCase()) ||
    cat.items.some(item => 
      item.sku?.toLowerCase().includes(search.toLowerCase()) ||
      item.product?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const totalPages = Math.ceil(filteredCategories.length / pageSize);
  const paginatedCategories = filteredCategories.slice((page - 1) * pageSize, page * pageSize);

  React.useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  const handlePrint = () => {
    window.print();
  };

  const copyForSheets = () => {
    const headers = ['Category', 'SKU', 'Product', 'On Hand', 'Forecast', 'Urgency', 'Order Qty'];
    const rows = [];
    filteredCategories.forEach(cat => {
      cat.items.forEach(item => {
        rows.push([cat.name, item.sku, item.product, item.onHand, item.forecastTotal, urgencyConfig[item.urgency]?.label || 'OK', item.orderQty || 0]);
      });
    });
    const tsv = [headers, ...rows].map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search category or product..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-zinc-800 border-zinc-700"
          />
        </div>
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
      {filteredCategories.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500">
          <div className="flex items-center gap-3">
            <span>
              Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, filteredCategories.length)} of {filteredCategories.length} categories
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

      <div className="space-y-3">
        {paginatedCategories.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center text-zinc-500">
            No categories found
          </div>
        ) : (
          paginatedCategories.map(cat => {
            const isExpanded = expandedCategory === cat.name;
            return (
              <div key={cat.name} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                <div 
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-800/50"
                  onClick={() => setExpandedCategory(isExpanded ? null : cat.name)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-zinc-500" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-zinc-500" />
                    )}
                    <div>
                      <h3 className="font-semibold text-zinc-100">{cat.name}</h3>
                      <p className="text-xs text-zinc-500">{cat.items.length} products</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {cat.criticalCount > 0 && (
                      <Badge variant="red">{cat.criticalCount} Critical</Badge>
                    )}
                    {cat.eventCount > 0 && (
                      <Badge variant="purple">{cat.eventCount} Event</Badge>
                    )}
                    {cat.soonCount > 0 && (
                      <Badge variant="amber">{cat.soonCount} Soon</Badge>
                    )}
                    <div className="text-right">
                      <div className="text-sm font-semibold text-orange-400">{cat.totalOrderQty.toLocaleString()}</div>
                      <div className="text-xs text-zinc-500">Order Qty</div>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-zinc-800">
                    <div className="grid grid-cols-4 gap-4 p-4 bg-zinc-800/30">
                      <div className="p-3 bg-zinc-800 rounded">
                        <div className="text-xs text-zinc-500">Forecast</div>
                        <div className="text-lg font-semibold text-zinc-200">{cat.totalForecast.toLocaleString()}</div>
                      </div>
                      <div className="p-3 bg-zinc-800 rounded">
                        <div className="text-xs text-zinc-500">Events</div>
                        <div className="text-lg font-semibold text-purple-400">+{cat.totalEvents.toLocaleString()}</div>
                      </div>
                      <div className="p-3 bg-zinc-800 rounded">
                        <div className="text-xs text-zinc-500">On Hand</div>
                        <div className="text-lg font-semibold text-cyan-400">{cat.totalOnHand.toLocaleString()}</div>
                      </div>
                      <div className="p-3 bg-orange-500/10 rounded border border-orange-500/30">
                        <div className="text-xs text-orange-400">Order Qty</div>
                        <div className="text-lg font-semibold text-orange-400">{cat.totalOrderQty.toLocaleString()}</div>
                      </div>
                    </div>

                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-800/50">
                          <th className="text-left p-3 text-xs font-semibold text-zinc-400 uppercase">SKU</th>
                          <th className="text-left p-3 text-xs font-semibold text-zinc-400 uppercase">Product</th>
                          <th className="text-right p-3 text-xs font-semibold text-zinc-400 uppercase">On Hand</th>
                          <th className="text-right p-3 text-xs font-semibold text-zinc-400 uppercase">Forecast</th>
                          <th className="text-left p-3 text-xs font-semibold text-zinc-400 uppercase">Urgency</th>
                          <th className="text-right p-3 text-xs font-semibold text-zinc-400 uppercase">Order Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cat.items.map(item => {
                          const urgencyInfo = urgencyConfig[item.urgency] || urgencyConfig.ok;
                          return (
                            <tr key={item.sku} className="border-b border-zinc-800/50">
                              <td className="p-3">
                                <span className="font-mono text-sm text-orange-400">{item.sku}</span>
                              </td>
                              <td className="p-3 text-zinc-200 text-sm">{item.product}</td>
                              <td className="p-3 text-right text-zinc-400">{item.onHand}</td>
                              <td className="p-3 text-right text-zinc-400">{item.forecastTotal}</td>
                              <td className="p-3">
                                <Badge variant={urgencyInfo.variant}>{urgencyInfo.label}</Badge>
                              </td>
                              <td className="p-3 text-right font-semibold text-zinc-200">
                                {item.orderQty > 0 ? item.orderQty : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}