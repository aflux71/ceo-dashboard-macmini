import * as React from "react";
import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, TrendingUp, TrendingDown } from "lucide-react";
import Badge from "@/components/ui/Badge";

export default function ScheduleVarianceChart({ batches, schedules, onDrillDown }) {
  const varianceData = useMemo(() => {
    // Match batches with their scheduled items
    const matchedData = [];
    
    batches.forEach(batch => {
      if (!batch.schedule_id) return;
      
      const schedule = schedules.find(s => s.id === batch.schedule_id);
      if (!schedule || !schedule.scheduled_start_date) return;

      const scheduledDate = new Date(schedule.scheduled_start_date);
      const actualDate = batch.production_date ? new Date(batch.production_date) : null;
      
      if (!actualDate) return;

      const varianceDays = Math.round((actualDate - scheduledDate) / (1000 * 60 * 60 * 24));
      
      matchedData.push({
        batchId: batch.batch_id,
        productName: batch.product_name || batch.sku,
        scheduledDate,
        actualDate,
        varianceDays,
        batch,
        schedule
      });
    });

    // Group by product for chart
    const productVariance = {};
    matchedData.forEach(item => {
      const key = item.productName;
      if (!productVariance[key]) {
        productVariance[key] = {
          name: key.length > 12 ? key.substring(0, 12) + '...' : key,
          fullName: key,
          onTime: 0,
          early: 0,
          late: 0,
          avgVariance: 0,
          totalVariance: 0,
          count: 0,
          items: []
        };
      }
      productVariance[key].count++;
      productVariance[key].totalVariance += item.varianceDays;
      productVariance[key].items.push(item);
      
      if (item.varianceDays === 0) {
        productVariance[key].onTime++;
      } else if (item.varianceDays < 0) {
        productVariance[key].early++;
      } else {
        productVariance[key].late++;
      }
    });

    const chartData = Object.values(productVariance)
      .map(p => ({
        ...p,
        avgVariance: p.count > 0 ? (p.totalVariance / p.count).toFixed(1) : 0
      }))
      .filter(p => p.count >= 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Calculate overall stats
    const totalScheduled = matchedData.length;
    const onTimeCount = matchedData.filter(m => m.varianceDays === 0).length;
    const earlyCount = matchedData.filter(m => m.varianceDays < 0).length;
    const lateCount = matchedData.filter(m => m.varianceDays > 0).length;
    const avgVariance = totalScheduled > 0 
      ? (matchedData.reduce((sum, m) => sum + m.varianceDays, 0) / totalScheduled).toFixed(1)
      : 0;

    return {
      chartData,
      stats: {
        total: totalScheduled,
        onTime: onTimeCount,
        early: earlyCount,
        late: lateCount,
        avgVariance
      },
      allItems: matchedData
    };
  }, [batches, schedules]);

  const handleClick = (data) => {
    if (data && data.activePayload && data.activePayload[0]) {
      const point = data.activePayload[0].payload;
      const batchesFromItems = point.items.map(i => i.batch);
      onDrillDown('variance', batchesFromItems, `${point.fullName} - Schedule Variance`);
    }
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-400" />
            Scheduled vs Actual Production
          </CardTitle>
          {varianceData.stats.total > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant={parseFloat(varianceData.stats.avgVariance) <= 0 ? "green" : "amber"}>
                Avg: {varianceData.stats.avgVariance > 0 ? '+' : ''}{varianceData.stats.avgVariance} days
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {varianceData.stats.total === 0 ? (
          <div className="h-[250px] flex items-center justify-center">
            <div className="text-center">
              <Clock className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500">No scheduled batches found</p>
              <p className="text-xs text-zinc-600 mt-1">Link batches to schedules to track variance</p>
            </div>
          </div>
        ) : (
          <>
            {/* Stats summary */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="p-3 bg-zinc-800/50 rounded-lg text-center">
                <p className="text-xl font-bold text-zinc-100">{varianceData.stats.total}</p>
                <p className="text-xs text-zinc-500">Tracked</p>
              </div>
              <div 
                className="p-3 bg-green-500/10 rounded-lg text-center cursor-pointer hover:bg-green-500/20 transition-colors"
                onClick={() => {
                  const onTimeBatches = varianceData.allItems.filter(i => i.varianceDays === 0).map(i => i.batch);
                  if (onTimeBatches.length > 0) onDrillDown('variance', onTimeBatches, 'On-Time Batches');
                }}
              >
                <p className="text-xl font-bold text-green-400">{varianceData.stats.onTime}</p>
                <p className="text-xs text-zinc-500">On Time</p>
              </div>
              <div 
                className="p-3 bg-blue-500/10 rounded-lg text-center cursor-pointer hover:bg-blue-500/20 transition-colors"
                onClick={() => {
                  const earlyBatches = varianceData.allItems.filter(i => i.varianceDays < 0).map(i => i.batch);
                  if (earlyBatches.length > 0) onDrillDown('variance', earlyBatches, 'Early Batches');
                }}
              >
                <div className="flex items-center justify-center gap-1">
                  <TrendingDown className="w-4 h-4 text-blue-400" />
                  <p className="text-xl font-bold text-blue-400">{varianceData.stats.early}</p>
                </div>
                <p className="text-xs text-zinc-500">Early</p>
              </div>
              <div 
                className="p-3 bg-amber-500/10 rounded-lg text-center cursor-pointer hover:bg-amber-500/20 transition-colors"
                onClick={() => {
                  const lateBatches = varianceData.allItems.filter(i => i.varianceDays > 0).map(i => i.batch);
                  if (lateBatches.length > 0) onDrillDown('variance', lateBatches, 'Late Batches');
                }}
              >
                <div className="flex items-center justify-center gap-1">
                  <TrendingUp className="w-4 h-4 text-amber-400" />
                  <p className="text-xl font-bold text-amber-400">{varianceData.stats.late}</p>
                </div>
                <p className="text-xs text-zinc-500">Late</p>
              </div>
            </div>

            {/* Variance chart by product */}
            {varianceData.chartData.length > 0 && (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={varianceData.chartData} onClick={handleClick}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fill: '#a1a1aa', fontSize: 10 }}
                      axisLine={{ stroke: '#3f3f46' }}
                    />
                    <YAxis 
                      tick={{ fill: '#a1a1aa', fontSize: 12 }}
                      axisLine={{ stroke: '#3f3f46' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#18181b', 
                        border: '1px solid #3f3f46',
                        borderRadius: '8px'
                      }}
                      formatter={(value, name) => {
                        if (name === 'early') return [value, 'Early'];
                        if (name === 'late') return [value, 'Late'];
                        if (name === 'onTime') return [value, 'On Time'];
                        return [value, name];
                      }}
                    />
                    <Legend />
                    <ReferenceLine y={0} stroke="#71717a" />
                    <Bar dataKey="early" name="Early" stackId="a" fill="#3b82f6" cursor="pointer" />
                    <Bar dataKey="onTime" name="On Time" stackId="a" fill="#22c55e" cursor="pointer" />
                    <Bar dataKey="late" name="Late" stackId="a" fill="#f59e0b" cursor="pointer" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}