import * as React from "react";
import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Factory } from "lucide-react";

const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#eab308'];

export default function LineUtilizationChart({ batches, onDrillDown }) {
  const chartData = useMemo(() => {
    const line1Batches = batches.filter(b => b.production_line === 1);
    const line2Batches = batches.filter(b => b.production_line === 2);
    const otherBatches = batches.filter(b => !b.production_line || (b.production_line !== 1 && b.production_line !== 2));

    const data = [];
    
    if (line1Batches.length > 0) {
      data.push({
        name: 'Line 1',
        value: line1Batches.length,
        batches: line1Batches,
        volume: line1Batches.reduce((sum, b) => sum + (b.quantity || 0), 0)
      });
    }
    
    if (line2Batches.length > 0) {
      data.push({
        name: 'Line 2',
        value: line2Batches.length,
        batches: line2Batches,
        volume: line2Batches.reduce((sum, b) => sum + (b.quantity || 0), 0)
      });
    }

    if (otherBatches.length > 0) {
      data.push({
        name: 'Other',
        value: otherBatches.length,
        batches: otherBatches,
        volume: otherBatches.reduce((sum, b) => sum + (b.quantity || 0), 0)
      });
    }

    return data;
  }, [batches]);

  const handleClick = (data) => {
    if (data && data.batches) {
      onDrillDown('utilization', data.batches, `${data.name} Batches`);
    }
  };

  const totalBatches = batches.length;

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Factory className="w-5 h-5 text-blue-400" />
          Production Line Utilization
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] flex">
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  onClick={handleClick}
                  cursor="pointer"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#18181b', 
                    border: '1px solid #3f3f46',
                    borderRadius: '8px'
                  }}
                  formatter={(value, name, props) => [
                    `${value} batches (${props.payload.volume.toLocaleString()} units)`,
                    name
                  ]}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="w-40 flex flex-col justify-center gap-3">
            {chartData.map((item, idx) => (
              <div 
                key={item.name}
                className="p-3 bg-zinc-800/50 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors"
                onClick={() => handleClick(item)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                  />
                  <span className="text-sm text-zinc-300">{item.name}</span>
                </div>
                <p className="text-lg font-bold text-zinc-100">{item.value} batches</p>
                <p className="text-xs text-zinc-500">{item.volume.toLocaleString()} units</p>
                <p className="text-xs text-zinc-500">
                  {totalBatches > 0 ? ((item.value / totalBatches) * 100).toFixed(1) : 0}% of total
                </p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}