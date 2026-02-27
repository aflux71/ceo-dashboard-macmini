import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { 
  ChevronLeft, 
  ChevronRight, 
  X, 
  RotateCcw, 
  SortAsc, 
  SortDesc, 
  Filter, 
  EyeOff,
  Settings2,
  Check,
  CalendarPlus,
  ClipboardList
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import Badge from "@/components/ui/Badge";

const SORT_OPTIONS = [
  { value: "daysOfStock", label: "Days of Stock", ascending: true },
  { value: "forecastQty", label: "Forecast Qty", ascending: false },
  { value: "onHand", label: "On-Hand Qty", ascending: true },
  { value: "category", label: "Category", ascending: true },
  { value: "productionLine", label: "Production Line", ascending: true },
  { value: "urgency", label: "Urgency Level", ascending: true },
];

const URGENCY_ORDER = { critical: 0, event: 1, soon: 2, ok: 3 };

const CATEGORIES = ["Bath Bombs", "Body Wash", "Scrubs", "Lotions", "Oils", "Soaps", "Candles", "Other"];

const STORAGE_KEY = "urgentSkus_excludedItems";
const TEMP_HIDDEN_KEY = "urgentSkus_tempHidden";

export default function UrgentSKUsList({ results = [], onScheduleItem }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("daysOfStock");
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState(new Set(CATEGORIES));
  const [permanentlyExcluded, setPermanentlyExcluded] = useState(new Set());
  const [temporarilyHidden, setTemporarilyHidden] = useState(new Set());
  const [showFilters, setShowFilters] = useState(false);
  
  const itemsPerPage = 20;

  // Load excluded items from storage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setPermanentlyExcluded(new Set(JSON.parse(stored)));
      
      const tempStored = sessionStorage.getItem(TEMP_HIDDEN_KEY);
      if (tempStored) setTemporarilyHidden(new Set(JSON.parse(tempStored)));
    } catch (e) {
      console.error("Error loading excluded items:", e);
    }
  }, []);

  // Save permanently excluded to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...permanentlyExcluded]));
  }, [permanentlyExcluded]);

  // Save temporarily hidden to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(TEMP_HIDDEN_KEY, JSON.stringify([...temporarilyHidden]));
  }, [temporarilyHidden]);

  // Get unique categories from results
  const availableCategories = useMemo(() => {
    const cats = new Set(results.map(r => r.category).filter(Boolean));
    return CATEGORIES.filter(c => cats.has(c));
  }, [results]);

  // Filter and sort
  const topUrgent = useMemo(() => {
    let filtered = results
      .filter(item => {
        // Exclude permanently excluded
        if (permanentlyExcluded.has(item.sku)) return false;
        // Exclude temporarily hidden
        if (temporarilyHidden.has(item.sku)) return false;
        // Filter by category
        if (item.category && !selectedCategories.has(item.category)) return false;
        return true;
      });

    // Sort
    filtered.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case "daysOfStock":
          aVal = a.daysOfStock ?? Infinity;
          bVal = b.daysOfStock ?? Infinity;
          break;
        case "forecastQty":
          aVal = a.forecastQty ?? 0;
          bVal = b.forecastQty ?? 0;
          break;
        case "onHand":
          aVal = a.onHand ?? 0;
          bVal = b.onHand ?? 0;
          break;
        case "category":
          aVal = a.category || "zzz";
          bVal = b.category || "zzz";
          break;
        case "productionLine":
          aVal = a.productionLine ?? 99;
          bVal = b.productionLine ?? 99;
          break;
        case "urgency":
          aVal = URGENCY_ORDER[a.urgency] ?? 99;
          bVal = URGENCY_ORDER[b.urgency] ?? 99;
          break;
        default:
          aVal = a.daysOfStock ?? Infinity;
          bVal = b.daysOfStock ?? Infinity;
      }

      if (typeof aVal === "string") {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortAsc ? aVal - bVal : bVal - aVal;
    });

    return filtered.slice(0, 40);
  }, [results, sortBy, sortAsc, selectedCategories, permanentlyExcluded, temporarilyHidden]);

  const totalPages = Math.ceil(topUrgent.length / itemsPerPage);
  const startIdx = (page - 1) * itemsPerPage;
  const currentItems = topUrgent.slice(startIdx, startIdx + itemsPerPage);

  const getDaysColor = (days) => {
    if (days <= 0) return "text-red-500";
    if (days <= 7) return "text-orange-400";
    return "text-zinc-400";
  };

  const getUrgencyBadge = (urgency) => {
    const variants = {
      critical: "red",
      event: "purple",
      soon: "amber",
      ok: "green"
    };
    return variants[urgency] || "default";
  };

  const handleTemporaryHide = (sku) => {
    setTemporarilyHidden(prev => new Set([...prev, sku]));
  };

  const handlePermanentExclude = (sku) => {
    setPermanentlyExcluded(prev => new Set([...prev, sku]));
  };

  const handleRestoreItem = (sku) => {
    setTemporarilyHidden(prev => {
      const next = new Set(prev);
      next.delete(sku);
      return next;
    });
    setPermanentlyExcluded(prev => {
      const next = new Set(prev);
      next.delete(sku);
      return next;
    });
  };

  const handleRestoreAllTemp = () => {
    setTemporarilyHidden(new Set());
  };

  const handleClearAllExclusions = () => {
    setPermanentlyExcluded(new Set());
    setTemporarilyHidden(new Set());
  };

  const handleScheduleItem = (item) => {
    // Store item data in sessionStorage for the schedule page to pick up
    const scheduleData = {
      sku: item.sku,
      product_name: item.product,
      category: item.category,
      production_line: item.productionLine,
      suggested_qty: item.forecastQty || 0,
      urgency: item.urgency,
      on_hand: item.onHand
    };
    sessionStorage.setItem('scheduleItem', JSON.stringify(scheduleData));
    navigate(createPageUrl('ProductionSchedule') + '?schedule=' + encodeURIComponent(item.sku));
  };

  const toggleCategory = (cat) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
    setPage(1);
  };

  const selectAllCategories = () => {
    setSelectedCategories(new Set(CATEGORIES));
    setPage(1);
  };

  const clearAllCategories = () => {
    setSelectedCategories(new Set());
    setPage(1);
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      const option = SORT_OPTIONS.find(o => o.value === field);
      setSortBy(field);
      setSortAsc(option?.ascending ?? true);
    }
    setPage(1);
  };

  const totalExcluded = permanentlyExcluded.size + temporarilyHidden.size;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-red-950/20 border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
            🚨 Top {topUrgent.length} Urgent SKUs
          </h3>
          
          <div className="flex items-center gap-2 flex-wrap">
            {/* Sort Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  {sortAsc ? <SortAsc className="w-3.5 h-3.5" /> : <SortDesc className="w-3.5 h-3.5" />}
                  {SORT_OPTIONS.find(o => o.value === sortBy)?.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Sort By</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {SORT_OPTIONS.map(option => (
                  <DropdownMenuItem 
                    key={option.value}
                    onClick={() => handleSort(option.value)}
                    className="flex items-center justify-between"
                  >
                    {option.label}
                    {sortBy === option.value && (
                      <span className="text-orange-400 ml-2">
                        {sortAsc ? "↑" : "↓"}
                      </span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Category Filter */}
            <Popover open={showFilters} onOpenChange={setShowFilters}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="w-3.5 h-3.5" />
                  Categories
                  {selectedCategories.size < CATEGORIES.length && (
                    <Badge variant="orange" className="ml-1 px-1.5 py-0">
                      {selectedCategories.size}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-0">
                <div className="p-3 border-b border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Filter by Category</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={selectAllCategories} className="text-xs h-6 px-2">
                        All
                      </Button>
                      <Button variant="ghost" size="sm" onClick={clearAllCategories} className="text-xs h-6 px-2">
                        None
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="p-2 max-h-64 overflow-y-auto">
                  {CATEGORIES.map(cat => (
                    <label 
                      key={cat} 
                      className="flex items-center gap-2 p-2 hover:bg-zinc-800/50 rounded cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedCategories.has(cat)}
                        onCheckedChange={() => toggleCategory(cat)}
                      />
                      <span className="text-sm">{cat}</span>
                      {availableCategories.includes(cat) && (
                        <span className="text-xs text-zinc-500 ml-auto">
                          {results.filter(r => r.category === cat).length}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Exclusions Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Settings2 className="w-3.5 h-3.5" />
                  {totalExcluded > 0 && (
                    <Badge variant="red" className="px-1.5 py-0">
                      {totalExcluded}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Exclusions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="px-2 py-1 text-xs text-zinc-500">
                  Hidden this session: {temporarilyHidden.size}
                </div>
                <div className="px-2 py-1 text-xs text-zinc-500">
                  Permanently excluded: {permanentlyExcluded.size}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleRestoreAllTemp} disabled={temporarilyHidden.size === 0}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Restore hidden items
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleClearAllExclusions} disabled={totalExcluded === 0}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Clear all exclusions
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Pagination */}
            <div className="flex items-center gap-1 text-xs text-zinc-400 ml-2">
              <span>{startIdx + 1}-{Math.min(startIdx + itemsPerPage, topUrgent.length)} of {topUrgent.length}</span>
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-1 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed rounded"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages || totalPages === 0}
                className="p-1 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed rounded"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Active Filters Display */}
        {(selectedCategories.size < CATEGORIES.length || totalExcluded > 0) && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {selectedCategories.size < CATEGORIES.length && (
              <Badge variant="blue" className="text-xs">
                {selectedCategories.size} of {CATEGORIES.length} categories
              </Badge>
            )}
            {temporarilyHidden.size > 0 && (
              <Badge variant="amber" className="text-xs">
                {temporarilyHidden.size} hidden
              </Badge>
            )}
            {permanentlyExcluded.size > 0 && (
              <Badge variant="red" className="text-xs">
                {permanentlyExcluded.size} excluded
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-6">
        {topUrgent.length === 0 ? (
          <div className="text-center py-8 text-zinc-500">
            <p>No items match the current filters</p>
            <Button variant="outline" size="sm" onClick={() => { selectAllCategories(); handleClearAllExclusions(); }} className="mt-3">
              Reset Filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {currentItems.map((item) => (
              <div key={item.sku} className="group flex items-center justify-between border border-zinc-800 rounded-lg p-4 bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-white text-sm min-w-fit">{item.sku}</span>
                    <span className="text-zinc-300 text-sm truncate">{item.product}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {item.category && (
                      <span className="text-xs text-zinc-500">{item.category}</span>
                    )}
                    {item.urgency && (
                      <Badge variant={getUrgencyBadge(item.urgency)} className="text-xs px-1.5 py-0">
                        {item.urgency}
                      </Badge>
                    )}
                    {item.productionLine && (
                      <span className="text-xs text-zinc-600">Line {item.productionLine}</span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className={`font-semibold text-sm whitespace-nowrap ${getDaysColor(item.daysOfStock)}`}>
                      {item.daysOfStock ?? 0} days
                    </div>
                    {item.onHand !== undefined && (
                      <div className="text-xs text-zinc-500">{item.onHand} on hand</div>
                    )}
                  </div>
                  
                  {/* Action buttons */}
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleScheduleItem(item)}
                      className="h-8 w-8 p-0 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10"
                      title="Add to Schedule"
                    >
                      <CalendarPlus className="w-4 h-4" />
                    </Button>
                    <Link
                      to={createPageUrl('RunPlanner') + '?addItem=' + encodeURIComponent(JSON.stringify({
                        sku: item.sku,
                        product_name: item.product,
                        suggested_qty: item.forecastQty || 0,
                        category: item.category,
                        production_line: item.productionLine
                      }))}
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 w-7 p-0"
                        >
                          <X className="w-4 h-4 text-zinc-500" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleTemporaryHide(item.sku)}>
                          <EyeOff className="w-4 h-4 mr-2" />
                          Hide for this session
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handlePermanentExclude(item.sku)} className="text-red-400">
                          <X className="w-4 h-4 mr-2" />
                          Exclude permanently
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Pagination */}
      {totalPages > 1 && (
        <div className="bg-zinc-800/50 border-t border-zinc-800 px-6 py-3 flex items-center justify-between text-xs text-zinc-400">
          <div>Page {page} of {totalPages}</div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              ← Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            >
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}