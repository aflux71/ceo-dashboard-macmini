import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { DollarSign, TrendingUp, Package, Search } from "lucide-react";
import Badge from "@/components/ui/Badge";

export default function Reports() {
  const [batchSearchTerm, setBatchSearchTerm] = useState("");
  const [batchStatusFilter, setBatchStatusFilter] = useState("all");

  // Fetch batches
  const { data: batches = [] } = useQuery({
    queryKey: ["batches"],
    queryFn: () => base44.entities.Batch.list()
  });

  // Fetch recipes
  const { data: recipes = [] } = useQuery({
    queryKey: ["recipes"],
    queryFn: () => base44.entities.Recipe.list()
  });

  // Fetch inventory for cost calculation
  const { data: inventory = [] } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => base44.entities.Inventory.list()
  });

  // Calculate batch costs
  const batchCostsData = useMemo(() => {
    return batches
      .filter(batch => {
        const matchesSearch = !batchSearchTerm ||
          batch.sku?.toLowerCase().includes(batchSearchTerm.toLowerCase()) ||
          batch.product_name?.toLowerCase().includes(batchSearchTerm.toLowerCase());
        const matchesStatus = batchStatusFilter === "all" || batch.status === batchStatusFilter;
        return matchesSearch && matchesStatus;
      })
      .map(batch => {
        const recipe = recipes.find(r => r.id === batch.recipe_id);
        let totalMaterialCost = 0;

        if (recipe?.ingredients) {
          recipe.ingredients.forEach(ing => {
            const invItem = inventory.find(i => i.sku === ing.sku);
            const costPerUnit = invItem?.cost_per_unit || 0;
            const ingredientCost = (ing.qty || 0) * costPerUnit * batch.quantity;
            totalMaterialCost += ingredientCost;
          });
        }

        return {
          id: batch.id,
          batch_id: batch.batch_id,
          sku: batch.sku,
          product_name: batch.product_name,
          quantity: batch.quantity,
          status: batch.status,
          production_date: batch.production_date,
          material_cost: totalMaterialCost,
          production_line: batch.production_line
        };
      });
  }, [batches, recipes, inventory, batchSearchTerm, batchStatusFilter]);

  // Calculate daily run costs
  const dailyRunCosts = useMemo(() => {
    const dailyMap = {};

    batchCostsData.forEach(batch => {
      const date = batch.production_date ? new Date(batch.production_date).toISOString().split('T')[0] : 'Unknown';
      if (!dailyMap[date]) {
        dailyMap[date] = {
          date,
          totalBatches: 0,
          totalCost: 0,
          totalQuantity: 0,
          line1Cost: 0,
          line2Cost: 0
        };
      }
      dailyMap[date].totalBatches++;
      dailyMap[date].totalCost += batch.material_cost;
      dailyMap[date].totalQuantity += batch.quantity || 0;
      if (batch.production_line === 1) {
        dailyMap[date].line1Cost += batch.material_cost;
      } else {
        dailyMap[date].line2Cost += batch.material_cost;
      }
    });

    return Object.values(dailyMap).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [batchCostsData]);

  // Summary stats
  const totalBatchCost = batchCostsData.reduce((sum, b) => sum + b.material_cost, 0);
  const avgBatchCost = batchCostsData.length > 0 ? totalBatchCost / batchCostsData.length : 0;
  const totalQuantity = batchCostsData.reduce((sum, b) => sum + (b.quantity || 0), 0);

  const chartData = dailyRunCosts.slice(0, 14).reverse();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-100">Reports</h1>
        <p className="text-zinc-500 text-sm mt-1">Production cost and batch analysis</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">${totalBatchCost.toFixed(2)}</p>
                <p className="text-xs text-zinc-500">Total Cost</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <TrendingUp className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">${avgBatchCost.toFixed(2)}</p>
                <p className="text-xs text-zinc-500">Avg Batch Cost</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <Package className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">{batchCostsData.length}</p>
                <p className="text-xs text-zinc-500">Total Batches</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Package className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">{totalQuantity.toLocaleString()}</p>
                <p className="text-xs text-zinc-500">Total Units</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reports Tabs */}
      <Tabs defaultValue="batch" className="w-full">
        <TabsList className="bg-zinc-800">
          <TabsTrigger value="batch">Batch Cost Report</TabsTrigger>
          <TabsTrigger value="daily">Daily Run Cost Report</TabsTrigger>
        </TabsList>

        {/* Batch Cost Report */}
        <TabsContent value="batch" className="mt-4 space-y-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Batch Cost Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <Input
                    placeholder="Search SKU or product..."
                    value={batchSearchTerm}
                    onChange={(e) => setBatchSearchTerm(e.target.value)}
                    className="pl-9 bg-zinc-800 border-zinc-700"
                  />
                </div>
                <Select value={batchStatusFilter} onValueChange={setBatchStatusFilter}>
                  <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="started">Started</SelectItem>
                    <SelectItem value="pending_qc">Pending QC</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800">
                      <TableHead className="text-zinc-400">Batch ID</TableHead>
                      <TableHead className="text-zinc-400">SKU</TableHead>
                      <TableHead className="text-zinc-400">Product</TableHead>
                      <TableHead className="text-right text-zinc-400">Qty</TableHead>
                      <TableHead className="text-right text-zinc-400">Material Cost</TableHead>
                      <TableHead className="text-zinc-400">Line</TableHead>
                      <TableHead className="text-zinc-400">Status</TableHead>
                      <TableHead className="text-zinc-400">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchCostsData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-zinc-500 py-8">
                          No batches found
                        </TableCell>
                      </TableRow>
                    ) : (
                      batchCostsData.map((batch) => (
                        <TableRow key={batch.id} className="border-zinc-800 hover:bg-zinc-800/50">
                          <TableCell className="font-mono text-sm text-orange-400">{batch.batch_id}</TableCell>
                          <TableCell className="font-mono text-sm text-zinc-300">{batch.sku}</TableCell>
                          <TableCell className="text-sm text-zinc-300 max-w-[200px] truncate">{batch.product_name}</TableCell>
                          <TableCell className="text-right text-zinc-300">{batch.quantity}</TableCell>
                          <TableCell className="text-right font-semibold text-green-400">${batch.material_cost.toFixed(2)}</TableCell>
                          <TableCell className="text-sm">
                            <Badge variant="default">L{batch.production_line}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            <Badge variant={batch.status === "approved" ? "green" : batch.status === "rejected" ? "red" : "orange"}>
                              {batch.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-zinc-400">
                            {batch.production_date ? new Date(batch.production_date).toLocaleDateString() : '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Daily Run Cost Report */}
        <TabsContent value="daily" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Chart */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-lg">Daily Run Costs (Last 14 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <p className="text-zinc-500 text-center py-8">No data available</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                      <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 12 }} angle={-45} textAnchor="end" height={80} />
                      <YAxis tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#27272a', border: '1px solid #52525b', borderRadius: '8px' }} />
                      <Legend />
                      <Bar dataKey="line1Cost" stackId="a" fill="#10b981" name="Line 1" />
                      <Bar dataKey="line2Cost" stackId="a" fill="#3b82f6" name="Line 2" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Distribution Pie */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-lg">Cost by Production Line</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <p className="text-zinc-500 text-center py-8">No data available</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Line 1', value: chartData.reduce((sum, d) => sum + d.line1Cost, 0) },
                          { name: 'Line 2', value: chartData.reduce((sum, d) => sum + d.line2Cost, 0) }
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: $${value.toFixed(2)}`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#3b82f6" />
                      </Pie>
                      <Tooltip formatter={(value) => `$${value.toFixed(2)}`} contentStyle={{ backgroundColor: '#27272a', border: '1px solid #52525b', borderRadius: '8px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Daily Details Table */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg">Daily Run Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800">
                      <TableHead className="text-zinc-400">Date</TableHead>
                      <TableHead className="text-right text-zinc-400">Batches</TableHead>
                      <TableHead className="text-right text-zinc-400">Units</TableHead>
                      <TableHead className="text-right text-zinc-400">Line 1 Cost</TableHead>
                      <TableHead className="text-right text-zinc-400">Line 2 Cost</TableHead>
                      <TableHead className="text-right text-zinc-400">Total Cost</TableHead>
                      <TableHead className="text-right text-zinc-400">Avg Cost/Unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyRunCosts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-zinc-500 py-8">
                          No data available
                        </TableCell>
                      </TableRow>
                    ) : (
                      dailyRunCosts.map((day) => (
                        <TableRow key={day.date} className="border-zinc-800 hover:bg-zinc-800/50">
                          <TableCell className="text-sm text-zinc-300 font-medium">{new Date(day.date).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right text-zinc-300">{day.totalBatches}</TableCell>
                          <TableCell className="text-right text-zinc-300">{day.totalQuantity.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-green-400 font-semibold">${day.line1Cost.toFixed(2)}</TableCell>
                          <TableCell className="text-right text-blue-400 font-semibold">${day.line2Cost.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-bold text-orange-400">${day.totalCost.toFixed(2)}</TableCell>
                          <TableCell className="text-right text-zinc-300">
                            ${day.totalQuantity > 0 ? (day.totalCost / day.totalQuantity).toFixed(2) : '0.00'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}