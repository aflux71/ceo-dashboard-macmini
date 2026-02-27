import * as React from "react";
import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import Badge from "@/components/ui/Badge";

const COLORS = {
  on_hold: '#f59e0b',
  rejected: '#ef4444',
  pending_qc: '#8b5cf6',
  started: '#3b82f6'
};

export default function BottlenecksChart({ batches, onDrillDown }) {
  const bottleneckData = useMemo(() => {
    // Analyze hold reasons
    const holdReasons = {};
    const statusCounts = {
      on_hold: batches.filter(b => b.status === 'on_hold'),
      rejected: batches.filter(b => b.status === 'rejected'),
      pending_qc: batches.filter(b => b.status === 'pending_qc')
    };

    // Group by hold reason
    statusCounts.on_hold.forEach(batch => {
      const reason = batch.hold_reason || 'Unspecified';
      if (!holdReasons[reason]) {
        holdReasons[reason] = { count: 0, batches: [] };
      }
      holdReasons[reason].count++;
      holdReasons[reason].batches.push(batch);
    });

    const holdReasonData = Object.entries(holdReasons)
      .map(([reason, data]) => ({
        name: reason.length > 20 ? reason.substring(0, 20) + '...' : reason,
        fullName: reason,
        value: data.count,
        batches: data.batches
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const statusData = [
      { name: 'On Hold', value: statusCounts.on_hold.length, batches: statusCounts.on_hold, color: COLORS.on_hold },
      { name: 'Pending QC', value: statusCounts.pending_qc.length, batches: statusCounts.pending_qc, color: COLORS.pending_qc },
      { name: 'Rejected', value: statusCounts.rejected.length, batches: statusCounts.rejected, color: COLORS.rejected }
    ].filter(s => s.value > 0);

    return { holdReasonData, statusData };
  }, [batches]);

  const handleStatusClick = (data) => {
    if (data && data.batches) {
      onDrillDown('bottleneck', data.batches, `${data.name} Batches`);
    }
  };

  const handleReasonClick = (data) => {
    if (data && data.activePayload && data.activePayload[0]) {
      const point = data.activePayload[0].payload;
      onDrillDown('bottleneck', point.batches, `Hold Reason: ${point.fullName}`);
    }
  };

  const totalBottlenecks = bottleneckData.statusData.reduce((sum, s) => sum + s.value, 0);

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          Common Bottlenecks
          {totalBottlenecks > 0 && (
            <Badge variant="amber">{totalBottlenecks} issues</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {totalBottlenecks === 0 ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-center">
              <AlertTriangle className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500">No bottlenecks detected</p>
              <p className="text-xs text-zinc-600 mt-1">All batches flowing smoothly</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status breakdown */}
            <div className="flex gap-3">
              {bottleneckData.statusData.map(item => (
                <div 
                  key={item.name}
                  className="flex-1 p-3 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: `${item.color}20` }}
                  onClick={() => handleStatusClick(item)}
                >
                  <p className="text-2xl font-bold" style={{ color: item.color }}>{item.value}</p>
                  <p className="text-xs text-zinc-400">{item.name}</p>
                </div>
              ))}
            </div>

            {/* Hold reasons bar chart */}
            {bottleneckData.holdReasonData.length > 0 && (
              <div>
                <p className="text-sm text-zinc-400 mb-2">Top Hold Reasons</p>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={bottleneckData.holdReasonData} 
                      layout="vertical"
                      onClick={handleReasonClick}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                      <XAxis type="number" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        tick={{ fill: '#a1a1aa', fontSize: 11 }}
                        width={100}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#18181b', 
                          border: '1px solid #3f3f46',
                          borderRadius: '8px'
                        }}
                        formatter={(value) => [`${value} batches`, 'Count']}
                      />
                      <Bar 
                        dataKey="value" 
                        fill="#f59e0b" 
                        radius={[0, 4, 4, 0]}
                        cursor="pointer"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}