import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, Legend, ScatterChart, Scatter, ZAxis
} from "recharts";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, Activity } from "lucide-react";

const COLORS = ["#f97316", "#3b82f6", "#10b981", "#a855f7", "#ec4899", "#eab308"];

function StatCard({ label, value, sub, trend, warn }) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = warn ? "text-red-400" : trend === "up" ? "text-green-400" : trend === "down" ? "text-amber-400" : "text-zinc-400";
  return (
    <div className={`bg-zinc-800 border rounded-lg p-4 ${warn ? "border-amber-500/50" : "border-zinc-700"}`}>
      <div className="text-xs text-zinc-400 mb-1">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
      {trend && (
        <div className={`flex items-center gap-1 mt-2 text-xs ${trendColor}`}>
          <TrendIcon className="w-3 h-3" />
          {warn ? "Drift detected" : "Stable"}
        </div>
      )}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-zinc-300 font-semibold mb-2">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-zinc-400">{p.name}:</span>
          <span className="text-white font-medium">{p.value}{p.name?.includes("Yield") || p.name?.includes("yield") ? "%" : ""}</span>
        </div>
      ))}
    </div>
  );
};

function detectDrift(values) {
  if (values.length < 4) return false;
  const recent = values.slice(-3);
  const earlier = values.slice(0, Math.max(1, values.length - 3));
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
  return Math.abs(recentAvg - earlierAvg) / (earlierAvg || 1) > 0.08;
}

export default function QCTrends() {
  const [selectedProduct, setSelectedProduct] = useState("all");
  const [activeMetric, setActiveMetric] = useState("both");

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["batches-qc"],
    queryFn: () => base44.entities.Batch.list("-production_date", 300),
  });

  // Get unique products that have QC data
  const products = useMemo(() => {
    const map = {};
    batches.forEach(b => {
      const hasPh = b.qc_final_ph && !isNaN(parseFloat(b.qc_final_ph));
      const hasYield = b.filling_yield_data?.some(r => r.yield_percent > 0);
      if (hasPh || hasYield) {
        if (!map[b.sku]) map[b.sku] = { sku: b.sku, name: b.product_name, count: 0 };
        map[b.sku].count++;
      }
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [batches]);

  // Build chart data per product
  const chartDataByProduct = useMemo(() => {
    const productBatches = selectedProduct === "all"
      ? batches
      : batches.filter(b => b.sku === selectedProduct);

    // Group by SKU for multi-product mode
    if (selectedProduct === "all") {
      // Show top 5 products by batch count with QC data
      const byProduct = {};
      productBatches.forEach(b => {
        const ph = b.qc_final_ph ? parseFloat(b.qc_final_ph) : null;
        const avgYield = b.filling_yield_data?.length
          ? b.filling_yield_data.filter(r => r.yield_percent > 0).reduce((a, r) => a + parseFloat(r.yield_percent || 0), 0) /
            (b.filling_yield_data.filter(r => r.yield_percent > 0).length || 1)
          : null;

        if (ph === null && avgYield === null) return;
        const dateKey = b.production_date ? format(new Date(b.production_date), "MM/dd") : "N/A";
        if (!byProduct[b.sku]) byProduct[b.sku] = { name: b.product_name, points: [] };
        byProduct[b.sku].points.push({ date: dateKey, batchId: b.batch_id, ph, yield: avgYield ? parseFloat(avgYield.toFixed(1)) : null });
      });

      return Object.entries(byProduct)
        .filter(([, v]) => v.points.length >= 2)
        .sort((a, b) => b[1].points.length - a[1].points.length)
        .slice(0, 5)
        .map(([sku, val], idx) => ({ sku, name: val.name, color: COLORS[idx], points: val.points.reverse() }));
    }

    // Single product: full timeline
    const points = productBatches
      .filter(b => b.qc_final_ph || b.filling_yield_data?.some(r => r.yield_percent > 0))
      .sort((a, b) => new Date(a.production_date) - new Date(b.production_date))
      .map(b => {
        const ph = b.qc_final_ph ? parseFloat(b.qc_final_ph) : null;
        const yields = b.filling_yield_data?.filter(r => r.yield_percent > 0) || [];
        const avgYield = yields.length
          ? parseFloat((yields.reduce((a, r) => a + parseFloat(r.yield_percent || 0), 0) / yields.length).toFixed(1))
          : null;
        const phTarget = b.qc_final_ph_target ? parseFloat(b.qc_final_ph_target) : null;
        return {
          date: b.production_date ? format(new Date(b.production_date), "MMM d") : b.batch_id,
          batchId: b.batch_id,
          ph,
          phTarget,
          yield: avgYield,
          colorPass: b.qc_color_scent_pass,
          viscosityPass: b.qc_viscosity_texture_pass,
        };
      });

    return points;
  }, [batches, selectedProduct]);

  // Stats for selected product
  const stats = useMemo(() => {
    const data = selectedProduct === "all" ? [] : (chartDataByProduct || []);
    if (!data.length) return null;
    const phValues = data.filter(d => d.ph !== null).map(d => d.ph);
    const yieldValues = data.filter(d => d.yield !== null).map(d => d.yield);
    return {
      avgPh: phValues.length ? (phValues.reduce((a, b) => a + b, 0) / phValues.length).toFixed(2) : "N/A",
      avgYield: yieldValues.length ? (yieldValues.reduce((a, b) => a + b, 0) / yieldValues.length).toFixed(1) : "N/A",
      phDrift: detectDrift(phValues),
      yieldDrift: detectDrift(yieldValues),
      totalBatches: data.length,
      passRate: data.length ? Math.round((data.filter(d => d.colorPass && d.viscosityPass).length / data.length) * 100) : null,
    };
  }, [chartDataByProduct, selectedProduct]);

  const isMulti = selectedProduct === "all";
  const singleData = !isMulti ? chartDataByProduct : [];
  const multiData = isMulti ? chartDataByProduct : [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Activity className="w-6 h-6 text-orange-400" />
              <h1 className="text-2xl font-bold text-white">QC Trend Analysis</h1>
            </div>
            <p className="text-zinc-400 text-sm">Track pH levels and yield percentages over time — identify process drift across batches</p>
          </div>
          {/* Metric Toggle */}
          <div className="flex gap-2 bg-zinc-800 border border-zinc-700 rounded-lg p-1">
            {[["both", "pH & Yield"], ["ph", "pH Only"], ["yield", "Yield Only"]].map(([val, label]) => (
              <button key={val} onClick={() => setActiveMetric(val)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${activeMetric === val ? "bg-orange-500 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Product Selector */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button onClick={() => setSelectedProduct("all")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${selectedProduct === "all" ? "bg-orange-500/20 border-orange-500/50 text-orange-400" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"}`}>
            All Products
          </button>
          {products.map(p => (
            <button key={p.sku} onClick={() => setSelectedProduct(p.sku)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${selectedProduct === p.sku ? "bg-orange-500/20 border-orange-500/50 text-orange-400" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"}`}>
              {p.name.length > 30 ? p.name.slice(0, 28) + "…" : p.name}
              <span className="ml-1.5 text-xs opacity-60">({p.count})</span>
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-zinc-500">
            <Activity className="w-5 h-5 mr-2 animate-pulse" /> Loading QC data...
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-24 border border-zinc-700 rounded-xl bg-zinc-800/30">
            <Activity className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400 font-medium">No QC data yet</p>
            <p className="text-zinc-600 text-sm mt-1">Fill in pH and yield values in Batch Travellers to see trends here</p>
          </div>
        ) : (
          <>
            {/* Stats Row — single product only */}
            {!isMulti && stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard label="Avg pH" value={stats.avgPh} sub="across all batches" trend={stats.avgPh !== "N/A" ? "stable" : null} warn={stats.phDrift} />
                <StatCard label="Avg Yield" value={stats.avgYield !== "N/A" ? `${stats.avgYield}%` : "N/A"} sub="filling yield" trend={stats.avgYield !== "N/A" ? "stable" : null} warn={stats.yieldDrift} />
                <StatCard label="Total Batches" value={stats.totalBatches} sub="with QC data" />
                <div className={`bg-zinc-800 border rounded-lg p-4 ${(stats.phDrift || stats.yieldDrift) ? "border-amber-500/50" : "border-zinc-700"}`}>
                  <div className="text-xs text-zinc-400 mb-1">Process Status</div>
                  {stats.phDrift || stats.yieldDrift ? (
                    <div className="flex items-center gap-2 mt-2">
                      <AlertTriangle className="w-5 h-5 text-amber-400" />
                      <span className="text-amber-400 font-semibold text-sm">Drift Detected</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-2">
                      <CheckCircle className="w-5 h-5 text-green-400" />
                      <span className="text-green-400 font-semibold text-sm">Process Stable</span>
                    </div>
                  )}
                  <div className="text-xs text-zinc-500 mt-1">
                    {stats.phDrift && "pH trending. "}
                    {stats.yieldDrift && "Yield shifting. "}
                    {!stats.phDrift && !stats.yieldDrift && "No significant drift in recent batches."}
                  </div>
                </div>
              </div>
            )}

            {/* Charts */}
            {isMulti ? (
              /* Multi-product comparison */
              <div className="space-y-6">
                {(activeMetric === "both" || activeMetric === "ph") && multiData.some(p => p.points.some(d => d.ph !== null)) && (
                  <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wide">pH Levels Over Time — All Products</h2>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#71717a", fontSize: 11 }} domain={["auto", "auto"]} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: "12px" }} />
                        {multiData.map(p => (
                          <Line key={p.sku} data={p.points} type="monotone" dataKey="ph" name={p.name.slice(0, 25)}
                            stroke={p.color} strokeWidth={2} dot={{ r: 3, fill: p.color }} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {(activeMetric === "both" || activeMetric === "yield") && multiData.some(p => p.points.some(d => d.yield !== null)) && (
                  <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wide">Yield % Over Time — All Products</h2>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#71717a", fontSize: 11 }} domain={[0, 110]} unit="%" />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: "12px" }} />
                        <ReferenceLine y={95} stroke="#22c55e" strokeDasharray="4 4" label={{ value: "95% target", fill: "#22c55e", fontSize: 10 }} />
                        <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "80% min", fill: "#ef4444", fontSize: 10 }} />
                        {multiData.map(p => (
                          <Line key={p.sku} data={p.points} type="monotone" dataKey="yield" name={p.name.slice(0, 25)}
                            stroke={p.color} strokeWidth={2} dot={{ r: 3, fill: p.color }} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ) : (
              /* Single product deep dive */
              <div className="space-y-6">
                {singleData.length < 2 ? (
                  <div className="text-center py-16 border border-zinc-700 rounded-xl bg-zinc-800/30 text-zinc-500">
                    Need at least 2 batches with QC data to show trends.
                  </div>
                ) : (
                  <>
                    {(activeMetric === "both" || activeMetric === "ph") && singleData.some(d => d.ph !== null) && (
                      <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5">
                        <h2 className="text-sm font-semibold text-zinc-300 mb-1 uppercase tracking-wide">pH Level Per Batch</h2>
                        <p className="text-xs text-zinc-500 mb-4">Final measured pH vs. target. Ideal: consistent values within ±0.3 of target.</p>
                        <ResponsiveContainer width="100%" height={280}>
                          <LineChart data={singleData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} />
                            <YAxis tick={{ fill: "#71717a", fontSize: 11 }} domain={["auto", "auto"]} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend wrapperStyle={{ fontSize: "12px" }} />
                            {singleData.some(d => d.phTarget !== null) && (
                              <Line type="monotone" dataKey="phTarget" name="pH Target" stroke="#22c55e" strokeDasharray="5 5" strokeWidth={1.5} dot={false} connectNulls />
                            )}
                            <Line type="monotone" dataKey="ph" name="pH Measured" stroke="#f97316" strokeWidth={2.5}
                              dot={{ r: 5, fill: "#f97316", stroke: "#fff", strokeWidth: 1 }} activeDot={{ r: 7 }} connectNulls />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {(activeMetric === "both" || activeMetric === "yield") && singleData.some(d => d.yield !== null) && (
                      <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5">
                        <h2 className="text-sm font-semibold text-zinc-300 mb-1 uppercase tracking-wide">Filling Yield % Per Batch</h2>
                        <p className="text-xs text-zinc-500 mb-4">Average yield across all container sizes. Green line = 95% target, red = 80% minimum threshold.</p>
                        <ResponsiveContainer width="100%" height={280}>
                          <LineChart data={singleData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} />
                            <YAxis tick={{ fill: "#71717a", fontSize: 11 }} domain={[0, 110]} unit="%" />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend wrapperStyle={{ fontSize: "12px" }} />
                            <ReferenceLine y={95} stroke="#22c55e" strokeDasharray="4 4" label={{ value: "95% target", fill: "#22c55e", fontSize: 10, position: "insideTopRight" }} />
                            <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "80% min", fill: "#ef4444", fontSize: 10, position: "insideBottomRight" }} />
                            <Line type="monotone" dataKey="yield" name="Yield %" stroke="#3b82f6" strokeWidth={2.5}
                              dot={({ cx, cy, payload }) => {
                                const color = payload.yield >= 95 ? "#22c55e" : payload.yield >= 80 ? "#eab308" : "#ef4444";
                                return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={5} fill={color} stroke="#fff" strokeWidth={1} />;
                              }}
                              activeDot={{ r: 7 }} connectNulls />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* QC Pass/Fail Timeline */}
                    {singleData.some(d => d.colorPass !== undefined) && (
                      <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5">
                        <h2 className="text-sm font-semibold text-zinc-300 mb-3 uppercase tracking-wide">QC Pass/Fail Timeline</h2>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-zinc-700">
                                <th className="text-left py-2 px-3 text-zinc-400">Batch</th>
                                <th className="text-left py-2 px-3 text-zinc-400">Date</th>
                                <th className="text-center py-2 px-3 text-zinc-400">pH</th>
                                <th className="text-center py-2 px-3 text-zinc-400">Yield %</th>
                                <th className="text-center py-2 px-3 text-zinc-400">Color/Scent</th>
                                <th className="text-center py-2 px-3 text-zinc-400">Viscosity</th>
                              </tr>
                            </thead>
                            <tbody>
                              {singleData.map((d, i) => (
                                <tr key={i} className="border-b border-zinc-700/50 hover:bg-zinc-700/30 transition-colors">
                                  <td className="py-2 px-3 font-mono text-orange-400">{d.batchId}</td>
                                  <td className="py-2 px-3 text-zinc-300">{d.date}</td>
                                  <td className="py-2 px-3 text-center">
                                    {d.ph !== null ? (
                                      <span className={`px-2 py-0.5 rounded font-medium ${d.phTarget && Math.abs(d.ph - d.phTarget) > 0.5 ? "bg-amber-500/20 text-amber-400" : "bg-green-500/20 text-green-400"}`}>
                                        {d.ph}
                                      </span>
                                    ) : <span className="text-zinc-600">—</span>}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    {d.yield !== null ? (
                                      <span className={`px-2 py-0.5 rounded font-medium ${d.yield >= 95 ? "bg-green-500/20 text-green-400" : d.yield >= 80 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>
                                        {d.yield}%
                                      </span>
                                    ) : <span className="text-zinc-600">—</span>}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    {d.colorPass === true ? <CheckCircle className="w-4 h-4 text-green-400 mx-auto" /> :
                                     d.colorPass === false ? <AlertTriangle className="w-4 h-4 text-red-400 mx-auto" /> :
                                     <span className="text-zinc-600">—</span>}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    {d.viscosityPass === true ? <CheckCircle className="w-4 h-4 text-green-400 mx-auto" /> :
                                     d.viscosityPass === false ? <AlertTriangle className="w-4 h-4 text-red-400 mx-auto" /> :
                                     <span className="text-zinc-600">—</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}