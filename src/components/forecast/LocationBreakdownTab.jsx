import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, MapPin, Copy, Printer } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Badge from "@/components/ui/Badge";
import { toast } from "sonner";
import { urgencyConfig } from "./ForecastResults";

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200];

export default function LocationBreakdownTab({ results = [], events = [] }) {
  const [expandedLocation, setExpandedLocation] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Group by event location/name
  const locationData = useMemo(() => {
    const locations = {};

    // Get items with event demand and group by their events
    results.forEach(item => {
      if (item.eventDetails && item.eventDetails.length > 0) {
        item.eventDetails.forEach(evt => {
          const locName = evt.eventName || "Unknown Location";
          if (!locations[locName]) {
            locations[locName] = {
              name: locName,
              stockDate: evt.stockDate,
              items: [],
              totalQty: 0
            };
          }
          // Check if item already exists
          const existing = locations[locName].items.find(i => i.sku === item.sku);
          if (existing) {
            existing.eventQty += evt.qty;
          } else {
            locations[locName].items.push({
              ...item,
              eventQty: evt.qty
            });
          }
          locations[locName].totalQty += evt.qty;
        });
      }
    });

    return Object.values(locations).sort((a, b) => {
      // Sort by date
      if (a.stockDate && b.stockDate) {
        return new Date(a.stockDate) - new Date(b.stockDate);
      }
      return a.name.localeCompare(b.name);
    });
  }, [results]);

  const filteredLocations = locationData.filter(loc => 
    !search || 
    loc.name.toLowerCase().includes(search.toLowerCase()) ||
    loc.items.some(item => 
      item.sku?.toLowerCase().includes(search.toLowerCase()) ||
      item.product?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const totalPages = Math.ceil(filteredLocations.length / pageSize);
  const paginatedLocations = filteredLocations.slice((page - 1) * pageSize, page * pageSize);

  React.useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  const handlePrint = () => {
    window.print();
  };

  const copyForSheets = () => {
    const headers = ['Location', 'Stock Date', 'SKU', 'Product', 'Event Qty', 'On Hand', 'Urgency'];
    const rows = [];
    filteredLocations.forEach(loc => {
      loc.items.forEach(item => {
        rows.push([loc.name, loc.stockDate ? new Date(loc.stockDate).toLocaleDateString() : '-', item.sku, item.product, item.eventQty, item.onHand, urgencyConfig[item.urgency]?.label || 'OK']);
      });
    });
    const tsv = [headers, ...rows].map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv);
    toast.success('Copied to clipboard');
  };

  if (locationData.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center text-zinc-500">
        <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No events with location data found</p>
        <p className="text-sm mt-1">Add events in the Events Manager to see location breakdown</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search location or product..."
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
      {filteredLocations.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500">
          <div className="flex items-center gap-3">
            <span>
              Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, filteredLocations.length)} of {filteredLocations.length} locations
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
        {paginatedLocations.map(loc => {
          const isExpanded = expandedLocation === loc.name;
          return (
            <div key={loc.name} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <div 
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-800/50"
                onClick={() => setExpandedLocation(isExpanded ? null : loc.name)}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-zinc-500" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-zinc-500" />
                  )}
                  <MapPin className="w-5 h-5 text-purple-400" />
                  <div>
                    <h3 className="font-semibold text-zinc-100">{loc.name}</h3>
                    <p className="text-xs text-zinc-500">
                      {loc.stockDate && `Stock by: ${new Date(loc.stockDate).toLocaleDateString()}`}
                      {" · "}{loc.items.length} products
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-purple-400">+{loc.totalQty.toLocaleString()}</div>
                  <div className="text-xs text-zinc-500">Total units</div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-zinc-800">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-800/50">
                        <th className="text-left p-3 text-xs font-semibold text-zinc-400 uppercase">SKU</th>
                        <th className="text-left p-3 text-xs font-semibold text-zinc-400 uppercase">Product</th>
                        <th className="text-right p-3 text-xs font-semibold text-zinc-400 uppercase">Event Qty</th>
                        <th className="text-right p-3 text-xs font-semibold text-zinc-400 uppercase">On Hand</th>
                        <th className="text-left p-3 text-xs font-semibold text-zinc-400 uppercase">Urgency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loc.items.map(item => {
                        const urgencyInfo = urgencyConfig[item.urgency] || urgencyConfig.ok;
                        return (
                          <tr key={item.sku} className="border-b border-zinc-800/50">
                            <td className="p-3">
                              <span className="font-mono text-sm text-orange-400">{item.sku}</span>
                            </td>
                            <td className="p-3 text-zinc-200 text-sm">{item.product}</td>
                            <td className="p-3 text-right font-semibold text-purple-400">+{item.eventQty}</td>
                            <td className="p-3 text-right text-zinc-400">{item.onHand}</td>
                            <td className="p-3">
                              <Badge variant={urgencyInfo.variant}>{urgencyInfo.label}</Badge>
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
        })}
      </div>
    </div>
  );
}