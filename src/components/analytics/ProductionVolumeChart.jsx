import * as React from "react";
import { useMemo } from "react";
import { format, parseISO, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, differenceInDays } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

export default function ProductionVolumeChart({ batches, dateRange, onDrillDown }) {
  const chartData = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return [];

    const daysDiff = differenceInDays(dateRange.end, dateRange.start);
    let intervals;
    let formatStr;
    let groupKey;

    if (daysDiff <= 14) {
      intervals = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
      formatStr = 'MMM d';
      groupKey = 'yyyy-MM-dd';
    } else if (daysDiff <= 90) {
      intervals = eachWeekOfInterval({ start: dateRange.start, end: dateRange.end });
      formatStr = 'MMM d';
      groupKey = 'yyyy-ww';
    } else {
      intervals = eachMonthOfInterval({ start: dateRange.start, end: dateRange.end });
      formatStr = 'MMM yyyy';
      groupKey = 'yyyy-MM';
    }

    const completedBatches = batches.filter(b => 
      b.status === 'approved' || b.status === 'added_to_inventory'
    );

    return intervals.map(interval => {
      const key = format(interval, groupKey);
      const label = format(interval, formatStr);
      
      const periodBatches = completedBatches.filter(batch => {
        if (!batch.production_date) return false;
        const batchKey = format(parseISO(batch.production_date), groupKey);
        return batchKey === key;
      });

      const line1Volume = periodBatches
        .filter(b => b.production_line === 1)
        .reduce((sum, b) => sum + (b.quantity || 0), 0);
      
      const line2Volume = periodBatches
        .filter(b => b.production_line === 2)
        .reduce((sum, b) => sum + (b.quantity || 0), 0);

      return {
        period: label,
        periodKey: key,
        line1: line1Volume,
        line2: line2Volume,
        total: line1Volume + line2Volume,
        batches: periodBatches
      };
    });
  }, [batches, dateRange]);

  const handleClick = (data) => {
    if (data && data.activePayload && data.activePayload[0]) {
      const point = data.activePayload[0].payload;
      onDrillDown('volume', point.batches, `Production Volume - ${point.period}`);
    }
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-orange-400" />
          Production Volume Over Time
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} onClick={handleClick}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
              <XAxis 
                dataKey="period" 
                tick={{ fill: '#a1a1aa', fontSize: 12 }}
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
                labelStyle={{ color: '#fff' }}
              />
              <Legend />
              <Bar 
                dataKey="line1" 
                name="Line 1" 
                fill="#f97316" 
                radius={[4, 4, 0, 0]}
                cursor="pointer"
              />
              <Bar 
                dataKey="line2" 
                name="Line 2" 
                fill="#3b82f6" 
                radius={[4, 4, 0, 0]}
                cursor="pointer"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-zinc-500 mt-2 text-center">Click on a bar to see batch details</p>
      </CardContent>
    </Card>
  );
}