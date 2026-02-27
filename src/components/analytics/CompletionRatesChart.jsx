import * as React from "react";
import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

export default function CompletionRatesChart({ batches, recipes, onDrillDown }) {
  const chartData = useMemo(() => {
    // Group batches by product/SKU
    const productStats = {};

    batches.forEach(batch => {
      const key = batch.sku || batch.product_name || 'Unknown';
      if (!productStats[key]) {
        productStats[key] = {
          name: batch.product_name || key,
          sku: batch.sku,
          total: 0,
          completed: 0,
          batches: []
        };
      }
      productStats[key].total++;
      productStats[key].batches.push(batch);
      if (batch.status === 'approved' || batch.status === 'added_to_inventory') {
        productStats[key].completed++;
      }
    });

    return Object.values(productStats)
      .map(p => ({
        ...p,
        rate: p.total > 0 ? ((p.completed / p.total) * 100) : 0,
        displayName: p.name.length > 15 ? p.name.substring(0, 15) + '...' : p.name
      }))
      .filter(p => p.total >= 2) // Only show products with at least 2 batches
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [batches]);

  const handleClick = (data) => {
    if (data && data.activePayload && data.activePayload[0]) {
      const point = data.activePayload[0].payload;
      onDrillDown('completion', point.batches, `${point.name} - Completion Details`);
    }
  };

  const getBarColor = (rate) => {
    if (rate >= 90) return '#22c55e';
    if (rate >= 70) return '#eab308';
    return '#ef4444';
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-400" />
          Completion Rates by Product
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-center">
              <CheckCircle2 className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500">Not enough data</p>
              <p className="text-xs text-zinc-600 mt-1">Need at least 2 batches per product</p>
            </div>
          </div>
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} onClick={handleClick}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis 
                  dataKey="displayName" 
                  tick={{ fill: '#a1a1aa', fontSize: 10 }}
                  axisLine={{ stroke: '#3f3f46' }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis 
                  tick={{ fill: '#a1a1aa', fontSize: 12 }}
                  axisLine={{ stroke: '#3f3f46' }}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#18181b', 
                    border: '1px solid #3f3f46',
                    borderRadius: '8px'
                  }}
                  formatter={(value, name, props) => [
                    `${value.toFixed(1)}% (${props.payload.completed}/${props.payload.total} batches)`,
                    'Completion Rate'
                  ]}
                  labelFormatter={(label) => chartData.find(d => d.displayName === label)?.name || label}
                />
                <Bar 
                  dataKey="rate" 
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getBarColor(entry.rate)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex items-center justify-center gap-4 mt-3 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span className="text-zinc-400">≥90%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-yellow-500" />
            <span className="text-zinc-400">70-89%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-500" />
            <span className="text-zinc-400">&lt;70%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}