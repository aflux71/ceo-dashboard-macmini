import React, { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, TrendingUp, Package, AlertTriangle, Calendar, Copy, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import Badge from "@/components/ui/Badge";
import { toast } from "sonner";
import ProductionScheduleTab from "./ProductionScheduleTab";
import UrgentSKUsList from "./UrgentSKUsList";
import EventBreakdownTab from "./EventBreakdownTab";
import CompanyPlanTab from "./CompanyPlanTab";
import CategoryBreakdownTab from "./CategoryBreakdownTab";
import InventoryStatusTab from "./InventoryStatusTab";
import LocationBreakdownTab from "./LocationBreakdownTab";
import ChartsTab from "./ChartsTab";

export const urgencyConfig = {
  critical: { variant: 'red', label: 'Critical', icon: AlertTriangle },
  event: { variant: 'purple', label: 'Event', icon: Package },
  soon: { variant: 'amber', label: 'Soon', icon: TrendingUp },
  ok: { variant: 'green', label: 'OK', icon: Package }
};

export default function ForecastResults({ results = [], onStockChange, salesData }) {
  const stats = useMemo(() => {
    if (!results.length) return null;
    
    const totalSkus = results.length;
    const categories = new Set(results.map(r => r.category).filter(Boolean));
    const baseForecast = results.reduce((sum, r) => sum + (r.forecastTotal || 0), 0);
    const eventDemand = results.reduce((sum, r) => sum + (r.eventDemand || 0), 0);
    const onHand = results.reduce((sum, r) => sum + (r.onHand || 0), 0);
    const totalOrderQty = results.reduce((sum, r) => sum + (r.orderQty || 0), 0);
    
    return { totalSkus, categories: categories.size, baseForecast, eventDemand, onHand, totalOrderQty };
  }, [results]);

  const copyForSheets = () => {
    const headers = ['SKU', 'Product', 'On Hand', 'Forecast', 'Events', 'Coverage', 'Urgency', 'Order Qty'];
    const rows = results.map(item => [
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

  const exportAsCSV = () => {
    const headers = ['SKU', 'Product', 'On Hand', 'Forecast', 'Events', 'Coverage', 'Urgency', 'Order Qty'];
    const rows = results.map(item => [
      item.sku,
      item.product,
      item.onHand || 0,
      item.forecastTotal || 0,
      item.eventDemand || 0,
      item.monthsCover >= 999 ? '∞' : `${Math.round(item.monthsCover * 10) / 10}mo`,
      urgencyConfig[item.urgency]?.label || 'OK',
      item.orderQty || 0
    ]);
    
    const csv = [headers, ...rows].map(row => row.map(cell => 
      typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
    ).join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forecast_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    toast.success('Downloaded forecast as CSV');
  };

  return (
    <div className="space-y-4">
      {stats && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-zinc-500">
              📊 Export your forecast data
            </p>
            <div className="flex gap-2">
              <Button onClick={copyForSheets} variant="outline" size="sm" className="gap-2">
                <Copy className="w-4 h-4" />
                Copy for Sheets
              </Button>
              <Button onClick={exportAsCSV} variant="outline" size="sm" className="gap-2">
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="text-xs text-zinc-500 uppercase mb-1">SKUs</div>
              <div className="text-2xl font-bold text-zinc-100">{stats.totalSkus}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="text-xs text-zinc-500 uppercase mb-1">Categories</div>
              <div className="text-2xl font-bold text-zinc-100">{stats.categories}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="text-xs text-zinc-500 uppercase mb-1">Base Forecast</div>
              <div className="text-2xl font-bold text-zinc-100">{stats.baseForecast.toLocaleString()}</div>
            </div>
            <div className="bg-amber-950/30 border border-amber-800/30 rounded-lg p-4">
              <div className="text-xs text-amber-500 uppercase mb-1">+ Event Demand</div>
              <div className="text-2xl font-bold text-amber-400">+{stats.eventDemand.toLocaleString()}</div>
            </div>
            <div className="bg-cyan-950/30 border border-cyan-800/30 rounded-lg p-4">
              <div className="text-xs text-cyan-500 uppercase mb-1">On Hand</div>
              <div className="text-2xl font-bold text-cyan-400">{stats.onHand.toLocaleString()}</div>
            </div>
            <div className="bg-green-950/30 border border-green-800/30 rounded-lg p-4">
              <div className="text-xs text-green-500 uppercase mb-1">Total Order Qty</div>
              <div className="text-2xl font-bold text-green-400">{stats.totalOrderQty.toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}
      
      <UrgentSKUsList results={results} />
      
      <Card className="bg-zinc-900 border-zinc-800">
        <Tabs defaultValue="company-plan" className="w-full">
        <TabsList className="bg-zinc-800/50 border-b border-zinc-700 rounded-none w-full justify-start h-auto p-0">
          <TabsTrigger value="company-plan" className="data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400 rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500">
            📊 Company Plan
          </TabsTrigger>
          <TabsTrigger value="production" className="data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400 rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500">
            🔧 Production Schedule
          </TabsTrigger>
          <TabsTrigger value="events" className="data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400 rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500">
            📅 Events
          </TabsTrigger>
          <TabsTrigger value="location" className="data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400 rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500">
            📍 By Location
          </TabsTrigger>
          <TabsTrigger value="category" className="data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400 rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500">
            🎨 By Category
          </TabsTrigger>
          <TabsTrigger value="inventory" className="data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400 rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500">
            📦 Inventory Status
          </TabsTrigger>
          <TabsTrigger value="charts" className="data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400 rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500">
            📈 Charts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company-plan" className="mt-4">
          <CompanyPlanTab results={results} onStockChange={onStockChange} />
        </TabsContent>

        <TabsContent value="production" className="mt-4">
          <ProductionScheduleTab results={results} />
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <EventBreakdownTab results={results} />
        </TabsContent>

        <TabsContent value="location" className="mt-4">
          <LocationBreakdownTab results={results} />
        </TabsContent>

        <TabsContent value="category" className="mt-4">
          <CategoryBreakdownTab results={results} />
        </TabsContent>

        <TabsContent value="inventory" className="mt-4">
          <InventoryStatusTab results={results} />
        </TabsContent>

        <TabsContent value="charts" className="mt-4">
          <ChartsTab results={results} />
        </TabsContent>
      </Tabs>
      </Card>
    </div>
  );
}