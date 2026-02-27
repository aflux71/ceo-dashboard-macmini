import React, { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Search, Copy, Printer, CalendarPlus, ClipboardList } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import Badge from "@/components/ui/Badge";
import { toast } from "sonner";
import { urgencyConfig } from "./ForecastResults";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200];

export default function CompanyPlanTab({ results = [], onStockChange }) {
  const navigate = useNavigate();
  const [expandedSku, setExpandedSku] = useState(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [sortField, setSortField] = useState("urgency");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const handleScheduleItem = (item, e) => {
    e.stopPropagation();
    const scheduleData = {
      sku: item.sku,
      product_name: item.product,
      category: item.category,
      production_line: item.productionLine,
      suggested_qty: item.orderQty || item.forecastTotal || 0,
      urgency: item.urgency,
      on_hand: item.onHand
    };
    sessionStorage.setItem('scheduleItem', JSON.stringify(scheduleData));
    navigate(createPageUrl('ProductionSchedule') + '?schedule=' + encodeURIComponent(item.sku));
  };

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(results.map(r => r.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [results]);

  // Filter and sort results
  const filteredResults = useMemo(() => {
    let filtered = results.filter(item => {
      const matchesSearch = !search || 
        item.sku?.toLowerCase().includes(search.toLowerCase()) ||
        item.product?.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
      const matchesUrgency = urgencyFilter === "all" || item.urgency === urgencyFilter;
      return matchesSearch && matchesCategory && matchesUrgency;
    });

    // Sort
    const urgencyOrder = { critical: 0, event: 1, soon: 2, ok: 3 };
    filtered.sort((a, b) => {
      let valA, valB;
      switch (sortField) {
        case "sku":
          valA = a.sku || "";
          valB = b.sku || "";
          break;
        case "product":
          valA = a.product || "";
          valB = b.product || "";
          break;
        case "onHand":
          valA = a.onHand || 0;
          valB = b.onHand || 0;
          break;
        case "forecast":
          valA = a.forecastTotal || 0;
          valB = b.forecastTotal || 0;
          break;
        case "events":
          valA = a.eventDemand || 0;
          valB = b.eventDemand || 0;
          break;
        case "coverage":
          valA = a.monthsCover || 0;
          valB = b.monthsCover || 0;
          break;
        case "orderQty":
          valA = a.orderQty || 0;
          valB = b.orderQty || 0;
          break;
        case "urgency":
        default:
          valA = urgencyOrder[a.urgency] ?? 4;
          valB = urgencyOrder[b.urgency] ?? 4;
          break;
      }
      if (typeof valA === "string") {
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDir === "asc" ? valA - valB : valB - valA;
    });

    return filtered;
  }, [results, search, categoryFilter, urgencyFilter, sortField, sortDir]);

  // Pagination
  const totalPages = Math.ceil(filteredResults.length / pageSize);
  const paginatedResults = filteredResults.slice((page - 1) * pageSize, page * pageSize);

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, urgencyFilter, pageSize]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const copyForSheets = () => {
    const headers = ['SKU', 'Product', 'On Hand', 'Forecast', 'Events', 'Coverage', 'Urgency', 'Order Qty'];
    const rows = filteredResults.map(item => [
      item.sku,
      item.product,
      item.onHand || 0,
      item.forecastTotal || 0,
      item.eventDemand || 0,
      item.monthsCover >= 999 ? '∞' : `${Math.round(item.monthsCover * 10) / 10}mo`,
      urgencyConfig[item.urgency]?.label || 'OK',
      item.orderQty || 0
    ]);
    
    const tsv = [headers, ...rows].map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv);
    toast.success('Copied to clipboard - paste into Google Sheets');
  };

  const SortHeader = ({ field, children, align = "left" }) => (
    <th 
      className={`p-4 text-xs font-semibold text-zinc-400 uppercase cursor-pointer hover:text-zinc-200 ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => handleSort(field)}
    >
      <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
        {children}
        {sortField === field && (
          <span className="text-orange-400">{sortDir === "asc" ? "↑" : "↓"}</span>
        )}
      </div>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="flex flex-col md:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Search SKU or product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-zinc-800 border-zinc-700"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
            <SelectTrigger className="w-36 bg-zinc-800 border-zinc-700">
              <SelectValue placeholder="All Items" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Items</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="event">Event</SelectItem>
              <SelectItem value="soon">Soon</SelectItem>
              <SelectItem value="ok">OK</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={copyForSheets} variant="outline" size="sm" className="gap-2">
          <Copy className="w-4 h-4" />
          Copy for Sheets
        </Button>
        <Button onClick={() => window.print()} variant="outline" size="sm" className="gap-2">
          <Printer className="w-4 h-4" />
          Print
        </Button>
      </div>

      {/* Pagination Info */}
      {filteredResults.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500">
          <div className="flex items-center gap-3">
            <span>
              Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, filteredResults.length)} of {filteredResults.length} items
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
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                ← Prev
              </Button>
              <span>Page {page} of {totalPages}</span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
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
              <th className="text-left p-4 text-xs font-semibold text-zinc-400 uppercase w-8"></th>
              <SortHeader field="sku">SKU</SortHeader>
              <SortHeader field="product">Product</SortHeader>
              <SortHeader field="onHand" align="right">On Hand</SortHeader>
              <SortHeader field="forecast" align="right">Forecast</SortHeader>
              <SortHeader field="events" align="right">Events</SortHeader>
              <SortHeader field="coverage" align="right">Coverage</SortHeader>
              <SortHeader field="urgency">Urgency</SortHeader>
              <SortHeader field="orderQty" align="right">Order Qty</SortHeader>
              <th className="p-4 text-xs font-semibold text-zinc-400 uppercase text-center w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedResults.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-zinc-500">
                  {results.length === 0 ? "Upload sales data to generate forecast" : "No items match your filters"}
                </td>
              </tr>
            ) : (
              paginatedResults.map((item) => {
                const isExpanded = expandedSku === item.sku;
                const urgencyInfo = urgencyConfig[item.urgency] || urgencyConfig.ok;
                
                return (
                  <React.Fragment key={item.sku}>
                    <tr 
                      className="border-b border-zinc-800 hover:bg-zinc-800/30 cursor-pointer"
                      onClick={() => setExpandedSku(isExpanded ? null : item.sku)}
                    >
                      <td className="p-4">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-zinc-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-zinc-500" />
                        )}
                      </td>
                      <td className="p-4">
                        <span className="font-mono text-sm text-orange-400">{item.sku}</span>
                      </td>
                      <td className="p-4 text-zinc-200">{item.product}</td>
                      <td className="p-4 text-right text-zinc-200">{item.onHand?.toLocaleString()}</td>
                      <td className="p-4 text-right text-zinc-400">{item.forecastTotal?.toLocaleString()}</td>
                      <td className="p-4 text-right">
                        {item.eventDemand > 0 ? (
                          <span className="text-purple-400 font-medium">{item.eventDemand}</span>
                        ) : (
                          <span className="text-zinc-600">-</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <span className={`font-semibold ${
                          item.monthsCover <= 1 ? 'text-red-400' :
                          item.monthsCover <= 2 ? 'text-amber-400' :
                          item.monthsCover >= 999 ? 'text-zinc-600' :
                          'text-green-400'
                        }`}>
                          {item.monthsCover >= 999 ? '∞' : `${Math.round(item.monthsCover * 10) / 10}mo`}
                        </span>
                      </td>
                      <td className="p-4">
                        <Badge variant={urgencyInfo.variant}>
                          {urgencyInfo.label}
                        </Badge>
                      </td>
                      <td className="p-4 text-right font-semibold text-zinc-200">
                        {item.orderQty > 0 ? item.orderQty.toLocaleString() : '-'}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10"
                            title="Add to Schedule"
                            onClick={(e) => handleScheduleItem(item, e)}
                          >
                            <CalendarPlus className="w-4 h-4" />
                          </Button>
                          <Link
                            to={createPageUrl('RunPlanner') + '?addItem=' + encodeURIComponent(JSON.stringify({
                              sku: item.sku,
                              product_name: item.product,
                              suggested_qty: item.orderQty || item.forecastTotal || 0,
                              category: item.category,
                              production_line: item.productionLine
                            }))}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10"
                              title="Add to Run Planner"
                            >
                              <ClipboardList className="w-4 h-4" />
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                    
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} className="bg-zinc-800/20">
                          <div className="p-6 space-y-4">
                            <div>
                              <h4 className="text-sm font-semibold text-zinc-300 mb-3">Monthly Forecast</h4>
                              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                                {item.monthlyForecasts?.map((m, idx) => (
                                  <div key={idx} className="p-2 bg-zinc-800 rounded border border-zinc-700">
                                    <div className="text-xs text-zinc-500">{m.month.split(' ')[0]}</div>
                                    <div className="text-sm font-semibold text-zinc-200">{m.forecast}</div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {item.eventDetails && item.eventDetails.length > 0 && (
                              <div>
                                <h4 className="text-sm font-semibold text-zinc-300 mb-3">Upcoming Events</h4>
                                <div className="space-y-2">
                                  {item.eventDetails.map((evt, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 bg-zinc-800 rounded border border-zinc-700">
                                      <div>
                                        <span className="text-sm text-zinc-200">{evt.eventName}</span>
                                        <span className="text-xs text-zinc-500 ml-2">
                                          {new Date(evt.stockDate).toLocaleDateString()}
                                        </span>
                                      </div>
                                      <span className="text-sm font-semibold text-purple-400">{evt.qty} units</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div>
                              <h4 className="text-sm font-semibold text-zinc-300 mb-3">Order Calculation</h4>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-zinc-800 rounded border border-zinc-700">
                                  <div className="text-xs text-zinc-500">Forecast Demand</div>
                                  <div className="text-lg font-semibold text-zinc-200">{item.forecastTotal}</div>
                                </div>
                                <div className="p-3 bg-zinc-800 rounded border border-zinc-700">
                                  <div className="text-xs text-zinc-500">Event Demand</div>
                                  <div className="text-lg font-semibold text-purple-400">{item.eventDemand}</div>
                                </div>
                                <div className="p-3 bg-zinc-800 rounded border border-zinc-700">
                                  <div className="text-xs text-zinc-500">Safety Stock</div>
                                  <div className="text-lg font-semibold text-amber-400">{item.safetyStock}</div>
                                </div>
                                <div className="p-3 bg-zinc-800 rounded border border-zinc-700">
                                  <div className="text-xs text-zinc-500">Current Stock</div>
                                  {onStockChange ? (
                                    <Input
                                      type="number"
                                      value={item.onHand || 0}
                                      onChange={(e) => onStockChange(item.sku, Number(e.target.value))}
                                      className="mt-1 h-8 w-24 bg-zinc-700 border-zinc-600 text-blue-400 font-semibold"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  ) : (
                                    <div className="text-lg font-semibold text-blue-400">{item.onHand}</div>
                                  )}
                                </div>
                              </div>
                              <div className="mt-3 p-3 bg-orange-500/10 rounded border border-orange-500/30">
                                <div className="text-xs text-orange-400">Net Order Quantity</div>
                                <div className="text-2xl font-bold text-orange-400">{item.orderQty}</div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Prev
          </Button>
          <span className="text-sm text-zinc-500">Page {page} of {totalPages}</span>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}