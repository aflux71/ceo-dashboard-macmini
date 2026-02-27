import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

export default function ChartsTab({ results = [] }) {
  const urgencyData = useMemo(() => {
    const counts = { critical: 0, event: 0, soon: 0, ok: 0 };
    results.forEach(item => {
      counts[item.urgency] = (counts[item.urgency] || 0) + 1;
    });
    return [
      { name: "Critical", value: counts.critical, color: "#ef4444" },
      { name: "Event", value: counts.event, color: "#a855f7" },
      { name: "Soon", value: counts.soon, color: "#f59e0b" },
      { name: "OK", value: counts.ok, color: "#22c55e" }
    ].filter(d => d.value > 0);
  }, [results]);

  const categoryData = useMemo(() => {
    const grouped = {};
    results.forEach(item => {
      const cat = item.category || "Other";
      if (!grouped[cat]) {
        grouped[cat] = { name: cat, orderQty: 0, forecast: 0, onHand: 0 };
      }
      grouped[cat].orderQty += item.orderQty || 0;
      grouped[cat].forecast += item.forecastTotal || 0;
      grouped[cat].onHand += item.onHand || 0;
    });
    return Object.values(grouped)
      .sort((a, b) => b.orderQty - a.orderQty)
      .slice(0, 10);
  }, [results]);

  const topOrderItems = useMemo(() => {
    return [...results]
      .filter(item => item.orderQty > 0)
      .sort((a, b) => b.orderQty - a.orderQty)
      .slice(0, 10)
      .map(item => ({
        name: item.sku,
        product: item.product,
        orderQty: item.orderQty,
        forecast: item.forecastTotal,
        events: item.eventDemand
      }));
  }, [results]);

  if (results.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center text-zinc-500">
        Upload sales data to see charts
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Urgency Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-zinc-300 mb-4">Urgency Distribution</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={urgencyData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {urgencyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Order Qty by Category */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-zinc-300 mb-4">Order Quantity by Category</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis type="number" stroke="#71717a" />
                <YAxis dataKey="name" type="category" stroke="#71717a" width={100} tick={{ fontSize: 11 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Bar dataKey="orderQty" fill="#f97316" name="Order Qty" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top Items by Order Qty */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-4">Top 10 Items by Order Quantity</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topOrderItems}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
              <XAxis dataKey="name" stroke="#71717a" tick={{ fontSize: 10 }} />
              <YAxis stroke="#71717a" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46' }}
                labelStyle={{ color: '#fff' }}
                formatter={(value, name) => [value.toLocaleString(), name]}
              />
              <Legend />
              <Bar dataKey="forecast" fill="#3b82f6" name="Forecast" />
              <Bar dataKey="events" fill="#a855f7" name="Events" />
              <Bar dataKey="orderQty" fill="#f97316" name="Order Qty" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="text-xs text-zinc-500 uppercase mb-1">Total SKUs</div>
          <div className="text-2xl font-bold text-zinc-100">{results.length}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="text-xs text-zinc-500 uppercase mb-1">Need Ordering</div>
          <div className="text-2xl font-bold text-orange-400">
            {results.filter(r => r.orderQty > 0).length}
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="text-xs text-zinc-500 uppercase mb-1">Critical Items</div>
          <div className="text-2xl font-bold text-red-400">
            {results.filter(r => r.urgency === 'critical').length}
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="text-xs text-zinc-500 uppercase mb-1">Out of Stock</div>
          <div className="text-2xl font-bold text-red-400">
            {results.filter(r => r.onHand === 0).length}
          </div>
        </div>
      </div>
    </div>
  );
}