import * as React from "react";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format, subDays, subMonths, startOfMonth, endOfMonth, parseISO, isWithinInterval } from "date-fns";
import {
  BarChart3,
  TrendingUp,
  Clock,
  AlertTriangle,
  Calendar,
  Factory,
  Package,
  CheckCircle2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import Badge from "@/components/ui/Badge";

import ProductionVolumeChart from "@/components/analytics/ProductionVolumeChart";
import LineUtilizationChart from "@/components/analytics/LineUtilizationChart";
import BottlenecksChart from "@/components/analytics/BottlenecksChart";
import CompletionRatesChart from "@/components/analytics/CompletionRatesChart";
import ScheduleVarianceChart from "@/components/analytics/ScheduleVarianceChart";
import DrillDownModal from "@/components/analytics/DrillDownModal";

const DATE_PRESETS = [
  { label: "Last 7 Days", value: "7d", getDates: () => ({ start: subDays(new Date(), 7), end: new Date() }) },
  { label: "Last 30 Days", value: "30d", getDates: () => ({ start: subDays(new Date(), 30), end: new Date() }) },
  { label: "Last 90 Days", value: "90d", getDates: () => ({ start: subDays(new Date(), 90), end: new Date() }) },
  { label: "This Month", value: "month", getDates: () => ({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) }) },
  { label: "Last 6 Months", value: "6m", getDates: () => ({ start: subMonths(new Date(), 6), end: new Date() }) },
  { label: "Last Year", value: "1y", getDates: () => ({ start: subMonths(new Date(), 12), end: new Date() }) },
  { label: "Custom", value: "custom", getDates: () => null }
];

export default function Analytics() {
  const [datePreset, setDatePreset] = useState("30d");
  const [customDateRange, setCustomDateRange] = useState({ start: null, end: null });
  const [drillDownData, setDrillDownData] = useState(null);

  const dateRange = useMemo(() => {
    if (datePreset === "custom" && customDateRange.start && customDateRange.end) {
      return customDateRange;
    }
    const preset = DATE_PRESETS.find(p => p.value === datePreset);
    return preset?.getDates() || { start: subDays(new Date(), 30), end: new Date() };
  }, [datePreset, customDateRange]);

  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ['analytics-batches'],
    queryFn: () => base44.entities.Batch.list('-production_date', 1000),
  });

  const { data: schedules = [] } = useQuery({
    queryKey: ['analytics-schedules'],
    queryFn: () => base44.entities.ForecastSuggestion.list('-created_date', 500),
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ['analytics-recipes'],
    queryFn: () => base44.entities.Recipe.list(),
  });

  // Filter batches by date range
  const filteredBatches = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return batches;
    return batches.filter(batch => {
      if (!batch.production_date) return false;
      const batchDate = parseISO(batch.production_date);
      return isWithinInterval(batchDate, { start: dateRange.start, end: dateRange.end });
    });
  }, [batches, dateRange]);

  // Calculate summary stats
  const stats = useMemo(() => {
    const completed = filteredBatches.filter(b => b.status === 'approved' || b.status === 'added_to_inventory');
    const totalVolume = completed.reduce((sum, b) => sum + (b.quantity || 0), 0);
    const avgCompletionRate = filteredBatches.length > 0 
      ? (completed.length / filteredBatches.length * 100).toFixed(1)
      : 0;
    const onHoldCount = filteredBatches.filter(b => b.status === 'on_hold').length;
    const line1Batches = filteredBatches.filter(b => b.production_line === 1).length;
    const line2Batches = filteredBatches.filter(b => b.production_line === 2).length;

    return {
      totalVolume,
      totalBatches: filteredBatches.length,
      completedBatches: completed.length,
      avgCompletionRate,
      onHoldCount,
      line1Batches,
      line2Batches
    };
  }, [filteredBatches]);

  const handleDrillDown = (type, data, title) => {
    setDrillDownData({ type, data, title });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Analytics Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Production metrics and performance insights
          </p>
        </div>
        
        {/* Date Range Selector */}
        <div className="flex items-center gap-3">
          <Select value={datePreset} onValueChange={setDatePreset}>
            <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map(preset => (
                <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {datePreset === "custom" && (
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="bg-zinc-800 border-zinc-700">
                    <Calendar className="w-4 h-4 mr-2" />
                    {customDateRange.start ? format(customDateRange.start, 'MMM d, yyyy') : 'Start'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={customDateRange.start}
                    onSelect={(date) => setCustomDateRange(prev => ({ ...prev, start: date }))}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-zinc-500">to</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="bg-zinc-800 border-zinc-700">
                    <Calendar className="w-4 h-4 mr-2" />
                    {customDateRange.end ? format(customDateRange.end, 'MMM d, yyyy') : 'End'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={customDateRange.end}
                    onSelect={(date) => setCustomDateRange(prev => ({ ...prev, end: date }))}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <Package className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">{stats.totalVolume.toLocaleString()}</p>
                <p className="text-xs text-zinc-500">Total Units Produced</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">{stats.avgCompletionRate}%</p>
                <p className="text-xs text-zinc-500">Completion Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Factory className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">{stats.totalBatches}</p>
                <p className="text-xs text-zinc-500">Total Batches</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">{stats.onHoldCount}</p>
                <p className="text-xs text-zinc-500">On Hold</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProductionVolumeChart 
          batches={filteredBatches} 
          dateRange={dateRange}
          onDrillDown={handleDrillDown}
        />
        <LineUtilizationChart 
          batches={filteredBatches}
          onDrillDown={handleDrillDown}
        />
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BottlenecksChart 
          batches={filteredBatches}
          onDrillDown={handleDrillDown}
        />
        <CompletionRatesChart 
          batches={filteredBatches}
          recipes={recipes}
          onDrillDown={handleDrillDown}
        />
      </div>

      {/* Charts Row 3 */}
      <ScheduleVarianceChart 
        batches={filteredBatches}
        schedules={schedules}
        onDrillDown={handleDrillDown}
      />

      {/* Drill Down Modal */}
      <DrillDownModal 
        data={drillDownData}
        onClose={() => setDrillDownData(null)}
      />
    </div>
  );
}