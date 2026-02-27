import React, { useMemo } from "react";
import { Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function GanttChart({ results = [] }) {
  const ganttData = useMemo(() => {
    if (!results.length) return [];

    return results
      .filter(item => item.productionStart)
      .slice(0, 15) // Limit to 15 items for readability
      .map(item => {
        const startDate = new Date(item.productionStart);
        const prodDays = Math.ceil((item.productionSchedule?.[0]?.produce || 100) / 50); // Assume 50 units/day
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + prodDays);

        return {
          sku: item.sku,
          product: item.product,
          startDate,
          endDate,
          daysNeeded: prodDays,
          qty: item.productionSchedule?.[0]?.produce || 0,
          urgency: item.urgency,
          hasEvent: item.eventDemand > 0
        };
      })
      .sort((a, b) => a.startDate - b.startDate);
  }, [results]);

  if (!ganttData.length) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <div className="p-6 text-center text-zinc-500">
          No production schedule data to visualize
        </div>
      </Card>
    );
  }

  // Calculate date range
  const allDates = ganttData.flatMap(d => [d.startDate, d.endDate]);
  const minDate = new Date(Math.min(...allDates));
  const maxDate = new Date(Math.max(...allDates));
  const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 5;

  // Get week headers
  const weeks = [];
  const current = new Date(minDate);
  while (current <= maxDate) {
    weeks.push(new Date(current));
    current.setDate(current.getDate() + 7);
  }

  const getTaskPosition = (startDate) => {
    const offset = Math.floor((startDate - minDate) / (1000 * 60 * 60 * 24));
    return (offset / totalDays) * 100;
  };

  const getTaskWidth = (startDate, endDate) => {
    const duration = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    return (duration / totalDays) * 100;
  };

  const urgencyColors = {
    critical: 'bg-red-500/60',
    event: 'bg-purple-500/60',
    soon: 'bg-amber-500/60',
    ok: 'bg-green-500/60'
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <div className="p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Production Timeline (Next 60 Days)
        </h3>

        <div className="overflow-x-auto">
          <div className="min-w-full">
            {/* Timeline header */}
            <div className="flex mb-2">
              <div className="w-32 flex-shrink-0" />
              <div className="flex-1 flex gap-px bg-zinc-800/30 rounded-t">
                {weeks.slice(0, 8).map((week, idx) => (
                  <div key={idx} className="flex-1 text-center text-xs text-zinc-500 border-r border-zinc-800/50 p-2">
                    {week.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                ))}
              </div>
            </div>

            {/* Gantt bars */}
            <div className="space-y-2">
              {ganttData.map((task, idx) => (
                <div key={idx} className="flex gap-2">
                  <div className="w-32 flex-shrink-0">
                    <div className="text-xs">
                      <div className="font-mono text-orange-400">{task.sku}</div>
                      <div className="text-zinc-500 text-[10px] truncate">{task.product}</div>
                    </div>
                  </div>
                  <div className="flex-1 relative h-8 bg-zinc-800/30 rounded overflow-hidden">
                    <div
                      className={`absolute h-full ${urgencyColors[task.urgency]} rounded transition-all hover:opacity-80 border border-zinc-700 flex items-center`}
                      style={{
                        left: `${getTaskPosition(task.startDate)}%`,
                        width: `${getTaskWidth(task.startDate, task.endDate)}%`,
                        minWidth: '40px'
                      }}
                      title={`${task.qty} units • ${task.daysNeeded} days${task.hasEvent ? ' (with event)' : ''}`}
                    >
                      <span className="text-[10px] font-semibold text-white px-2 truncate">
                        {task.qty} units
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex gap-4 text-xs">
          {Object.entries(urgencyColors).map(([level, color]) => (
            <div key={level} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded ${color}`} />
              <span className="text-zinc-400 capitalize">{level}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}