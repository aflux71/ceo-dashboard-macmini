import React, { useMemo } from "react";
import { AlertTriangle, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import Badge from "@/components/ui/Badge";

// Batching logic - groups similar SKUs to minimize setup times
export const createProductionBatches = (items, priorityMap = {}) => {
  if (!items.length) return [];

  // Group by category and production line
  const batches = {};
  
  items.forEach(item => {
    const category = item.category || 'Other';
    const schedule = item.productionSchedule?.[0];
    if (!schedule || schedule.produce === 0) return;

    const key = `${category}`;
    if (!batches[key]) {
      batches[key] = [];
    }
    
    batches[key].push({
      ...item,
      priority: priorityMap[item.sku] || 0,
      produceQty: schedule.produce
    });
  });

  // Sort each batch by priority (events first, then critical, then quantity)
  Object.keys(batches).forEach(key => {
    batches[key].sort((a, b) => {
      if (a.urgency === 'event' && b.urgency !== 'event') return -1;
      if (b.urgency === 'event' && a.urgency !== 'event') return 1;
      if (a.urgency === 'critical' && b.urgency !== 'critical') return -1;
      if (b.urgency === 'critical' && a.urgency !== 'critical') return 1;
      return (b.priority || 0) - (a.priority || 0);
    });
  });

  return batches;
};

// Detect production bottlenecks
export const detectBottlenecks = (items) => {
  const bottlenecks = [];
  
  items.forEach(item => {
    const schedule = item.productionSchedule || [];
    
    // Check for high production volumes in short timeframe
    if (schedule[0]?.produce > 1000) {
      bottlenecks.push({
        type: 'high_volume',
        sku: item.sku,
        product: item.product,
        qty: schedule[0].produce,
        severity: 'warning',
        message: `High volume production needed: ${schedule[0].produce} units`
      });
    }
    
    // Check for tight lead time vs production demand
    if (item.urgency === 'critical' && item.monthsCover < 0.5) {
      bottlenecks.push({
        type: 'tight_timeline',
        sku: item.sku,
        product: item.product,
        leadDays: 7,
        severity: 'critical',
        message: 'Critical: Minimal buffer - production must start immediately'
      });
    }

    // Check for event-driven rush orders
    if (item.eventDemand > item.onHand && item.monthsCover < 1) {
      bottlenecks.push({
        type: 'event_rush',
        sku: item.sku,
        product: item.product,
        qty: item.eventDemand,
        severity: 'critical',
        message: `Event order ${item.eventDemand} units needed before stock runs out`
      });
    }
  });

  return bottlenecks;
};

export default function ProductionBatching({ results = [], priorityMap = {} }) {
  const batches = useMemo(() => createProductionBatches(results, priorityMap), [results, priorityMap]);
  const bottlenecks = useMemo(() => detectBottlenecks(results), [results]);

  if (!results.length) return null;

  return (
    <div className="space-y-4">
      {/* Bottleneck Alerts */}
      {bottlenecks.length > 0 && (
        <Card className="bg-red-950/20 border-red-800/30">
          <div className="p-4">
            <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Production Bottlenecks Detected
            </h3>
            <div className="space-y-2">
              {bottlenecks.map((alert, idx) => (
                <div key={idx} className="flex items-start gap-3 p-2 bg-red-900/20 rounded border border-red-800/30">
                  <div className="flex-1">
                    <div className="text-sm text-red-300">
                      <span className="font-semibold">{alert.sku}</span> - {alert.product}
                    </div>
                    <div className="text-xs text-red-400 mt-1">{alert.message}</div>
                  </div>
                  <Badge variant={alert.severity === 'critical' ? 'red' : 'amber'} className="whitespace-nowrap">
                    {alert.type.replace('_', ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Production Batches */}
      <Card className="bg-zinc-900 border-zinc-800">
        <div className="p-4">
          <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Production Batches (Optimized)
          </h3>
          <div className="space-y-3">
            {Object.entries(batches).map(([category, items]) => {
              const totalQty = items.reduce((sum, i) => sum + i.produceQty, 0);
              const setupTime = Math.ceil(items.length * 0.5); // 30 min per SKU setup
              const hasEvents = items.some(i => i.urgency === 'event');
              
              return (
                <div key={category} className="p-3 bg-zinc-800/50 rounded border border-zinc-700">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="font-semibold text-zinc-200">{category}</span>
                      <span className="text-xs text-zinc-500 ml-2">
                        {items.length} SKU{items.length !== 1 ? 's' : ''} • {totalQty} units • {setupTime}h setup
                      </span>
                    </div>
                    {hasEvents && (
                      <Badge variant="purple" className="text-xs">Event Batch</Badge>
                    )}
                  </div>
                  <div className="space-y-1">
                    {items.map(item => (
                      <div key={item.sku} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400">
                          <span className="font-mono text-orange-400">{item.sku}</span> • {item.product}
                        </span>
                        <div className="flex gap-2">
                          <span className="text-green-400 font-semibold">{item.produceQty} units</span>
                          <Badge variant={item.urgency === 'event' ? 'purple' : 'default'} className="text-xs">
                            {item.urgency}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}