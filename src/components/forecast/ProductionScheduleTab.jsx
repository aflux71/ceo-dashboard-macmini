import React, { useState } from "react";
import { Search, Copy, Zap, Printer, CalendarPlus, ClipboardList } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Badge from "@/components/ui/Badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { urgencyConfig } from "./ForecastResults";
import ProductionBatching from "./ProductionBatching";
import GanttChart from "./GanttChart";
import EventBreakdownTab from "./EventBreakdownTab";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200];

export default function ProductionScheduleTab({ results = [] }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [itemFilter, setItemFilter] = useState("all");
  const [priorityMap, setPriorityMap] = useState({});
  const [sortField, setSortField] = useState("urgency");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const handleScheduleItem = (item) => {
    const scheduleData = {
      sku: item.sku,
      product_name: item.product,
      category: item.category,
      production_line: item.productionLine,
      suggested_qty: item.productionSchedule?.slice(0, 3).reduce((sum, m) => sum + (m.produce || 0), 0) || 0,
      urgency: item.urgency,
      on_hand: item.onHand
    };
    sessionStorage.setItem('scheduleItem', JSON.stringify(scheduleData));
    navigate(createPageUrl('ProductionSchedule') + '?schedule=' + encodeURIComponent(item.sku));
  };

  const categories = [...new Set(results.map(r => r.category).filter(Boolean))];

  const filtered = results.filter(item => {
    const matchesSearch = !search || 
      item.sku.toLowerCase().includes(search.toLowerCase()) ||
      item.product.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    const matchesItem = itemFilter === "all" || 
      (itemFilter === "critical" && item.urgency === "critical") ||
      (itemFilter === "events" && item.eventDemand > 0);
    
    return matchesSearch && matchesCategory && matchesItem;
  }).sort((a, b) => {
    const urgencyOrder = { critical: 0, event: 1, soon: 2, ok: 3 };
    let valA, valB;
    switch (sortField) {
      case "sku": valA = a.sku || ""; valB = b.sku || ""; break;
      case "product": valA = a.product || ""; valB = b.product || ""; break;
      case "onHand": valA = a.onHand || 0; valB = b.onHand || 0; break;
      case "eventDemand": valA = a.eventDemand || 0; valB = b.eventDemand || 0; break;
      case "threeMonth": 
        valA = (a.productionSchedule?.slice(0, 3).reduce((sum, m) => sum + (m.produce || 0), 0)) || 0;
        valB = (b.productionSchedule?.slice(0, 3).reduce((sum, m) => sum + (m.produce || 0), 0)) || 0;
        break;
      case "urgency":
      default: valA = urgencyOrder[a.urgency] ?? 4; valB = urgencyOrder[b.urgency] ?? 4; break;
    }
    if (typeof valA === "string") return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
    return sortDir === "asc" ? valA - valB : valB - valA;
  });

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortHeader = ({ field, children, className = "" }) => (
    <th 
      className={`p-3 text-[10px] font-semibold text-zinc-400 uppercase cursor-pointer hover:text-zinc-200 ${className}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && <span className="text-orange-400">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </div>
    </th>
  );

  // Pagination
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginatedResults = filtered.slice((page - 1) * pageSize, page * pageSize);

  React.useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, itemFilter, pageSize]);

  const handlePrint = () => {
    window.print();
  };

  const copySchedule = () => {
    const headers = ['Urgency', 'SKU', 'Product', 'On Hand', 'Event ⭐', 'Dec', 'Prod', 'Jan', 'Prod', 'Feb', 'Prod', 'Mar', 'Prod', 'Apr', 'Prod', '3-Mo Total', 'Start By'];
    const rows = filtered.map(item => {
      const schedule = item.productionSchedule?.slice(0, 5) || [];
      const scheduleData = [];
      schedule.forEach(m => {
        scheduleData.push(m.demand);
        scheduleData.push(m.produce);
      });
      
      return [
        item.urgency.toUpperCase(),
        item.sku,
        item.product,
        item.onHand,
        item.eventDemand,
        ...scheduleData,
        item.productionSchedule?.slice(0, 3).reduce((sum, m) => sum + m.produce, 0) || 0,
        item.productionStart || ''
      ];
    });
    
    const tsv = [headers, ...rows].map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv);
    toast.success('Schedule copied to clipboard');
  };

  return (
    <Tabs defaultValue="schedule" className="space-y-4">
      <TabsList className="bg-zinc-800 w-full justify-start">
        <TabsTrigger value="schedule">📋 Schedule</TabsTrigger>
        <TabsTrigger value="timeline">📅 Timeline</TabsTrigger>
        <TabsTrigger value="batches">⚡ Batches & Alerts</TabsTrigger>
        <TabsTrigger value="events">📊 Events</TabsTrigger>
      </TabsList>

      <TabsContent value="schedule" className="space-y-4">
      <div className="bg-purple-950/20 border border-purple-800/30 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-purple-400 mb-2 flex items-center gap-2">
          📚 How to Read This Schedule
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-zinc-400">
          <div>
            <span className="font-semibold text-zinc-300">Demand:</span> Base + Event demand
          </div>
          <div>
            <span className="font-semibold text-zinc-300">Produce:</span> Units to make
          </div>
          <div>
            <span className="font-semibold text-purple-300">⭐ Event:</span> Pull for event after production
          </div>
          <div>
            <span className="font-semibold text-zinc-300">Start By:</span> Production start date
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search SKU or product..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          icon={<Search className="w-4 h-4" />}
        />
        
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={itemFilter} onValueChange={setItemFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="All Items" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Items</SelectItem>
            <SelectItem value="critical">Critical Only</SelectItem>
            <SelectItem value="events">Has Events</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={copySchedule} variant="outline" size="sm" className="gap-2 ml-auto">
          <Copy className="w-4 h-4" />
          Copy for Sheets
        </Button>
        <Button onClick={handlePrint} variant="outline" size="sm" className="gap-2">
          <Printer className="w-4 h-4" />
          Print
        </Button>
      </div>

      {/* Pagination Info */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500">
          <div className="flex items-center gap-3">
            <span>
              Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, filtered.length)} of {filtered.length} items
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

      <div className="overflow-x-auto bg-zinc-900 border border-zinc-800 rounded-lg">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-800/50">
              <SortHeader field="urgency" className="text-left">Urgency</SortHeader>
              <SortHeader field="sku" className="text-left">SKU</SortHeader>
              <SortHeader field="product" className="text-left">Product</SortHeader>
              <th className="p-3 text-[10px] font-semibold text-zinc-400 uppercase text-center w-20">Actions</th>
              <SortHeader field="onHand" className="text-right">On Hand</SortHeader>
              <SortHeader field="eventDemand" className="text-right bg-amber-950/20">Event ⭐</SortHeader>
              {[0, 1, 2, 3, 4].map(idx => {
                const month = new Date();
                month.setMonth(month.getMonth() + idx);
                const monthName = month.toLocaleDateString('en-US', { month: 'short' });
                return (
                  <React.Fragment key={idx}>
                    <th className="text-right p-3 text-[10px] font-semibold text-zinc-400 uppercase bg-zinc-800/30">
                      {monthName}<br/>Dem
                    </th>
                    <th className="text-right p-3 text-[10px] font-semibold text-green-400 uppercase bg-green-950/20">
                      Prod
                    </th>
                  </React.Fragment>
                );
              })}
              <SortHeader field="threeMonth" className="text-right bg-orange-950/20">3-Mo Total</SortHeader>
              <th className="text-left p-3 text-[10px] font-semibold text-zinc-400 uppercase">Start By</th>
            </tr>
          </thead>
          <tbody>
            {paginatedResults.length === 0 ? (
              <tr>
                <td colSpan={18} className="p-8 text-center text-zinc-500">
                  No results match your filters
                </td>
              </tr>
            ) : (
              paginatedResults.map((item) => {
                const schedule = item.productionSchedule?.slice(0, 5) || [];
                const threeMonthTotal = schedule.slice(0, 3).reduce((sum, m) => sum + (m.produce || 0), 0);
                
                return (
                  <tr key={item.sku} className="border-b border-zinc-800 hover:bg-zinc-800/30">
                    <td className="p-3">
                      <Badge variant={urgencyConfig[item.urgency]?.variant || 'default'}>
                        {item.urgency?.toUpperCase() || 'OK'}
                      </Badge>
                    </td>
                    <td className="p-3 w-24">
                      <span className="font-mono text-orange-400">{item.sku}</span>
                    </td>
                    <td className="p-3 text-zinc-200 w-40">{item.product}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10"
                          title="Add to Schedule"
                          onClick={() => handleScheduleItem(item)}
                        >
                          <CalendarPlus className="w-4 h-4" />
                        </Button>
                        <Link
                          to={createPageUrl('RunPlanner') + '?addItem=' + encodeURIComponent(JSON.stringify({
                            sku: item.sku,
                            product_name: item.product,
                            suggested_qty: item.productionSchedule?.slice(0, 3).reduce((sum, m) => sum + (m.produce || 0), 0) || 0,
                            category: item.category,
                            production_line: item.productionLine
                          }))}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10"
                            title="Add to Run Planner"
                          >
                            <ClipboardList className="w-4 h-4" />
                          </Button>
                        </Link>
                      </div>
                    </td>
                    <td className="p-3 text-right text-zinc-200 w-20">{item.onHand?.toLocaleString()}</td>
                    <td className="p-3 text-right bg-amber-950/10">
                      {item.eventDemand > 0 ? (
                        <span className="text-purple-400 font-semibold">{item.eventDemand}</span>
                      ) : (
                        <span className="text-zinc-700">-</span>
                      )}
                    </td>
                    {schedule.map((month, idx) => (
                      <React.Fragment key={idx}>
                        <td className="p-3 text-right bg-zinc-800/20 text-zinc-300">{month.demand}</td>
                        <td className="p-3 text-right bg-green-950/10 text-green-400 font-semibold">{month.produce}</td>
                      </React.Fragment>
                    ))}
                    <td className="p-3 text-right bg-orange-950/10 text-orange-400 font-bold">{threeMonthTotal}</td>
                    <td className="p-3 text-zinc-300">{item.productionStart || '-'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      </TabsContent>

      <TabsContent value="timeline">
        <GanttChart results={results} />
      </TabsContent>

      <TabsContent value="batches">
        <ProductionBatching results={filtered} priorityMap={priorityMap} />
      </TabsContent>

      <TabsContent value="events">
        <EventBreakdownTab results={results} />
      </TabsContent>
    </Tabs>
  );
}