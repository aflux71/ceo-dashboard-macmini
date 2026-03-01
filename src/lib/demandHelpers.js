// ============================================================================
// neōb Demand Helpers — Formatting, colors, and display utilities
// ============================================================================

import { categorize } from "./demandEngine";

export const URGENCY_COLORS = {
  CRITICAL: { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30", dot: "bg-red-400" },
  LOW:      { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30", dot: "bg-amber-400" },
  WATCH:    { bg: "bg-yellow-500/15", text: "text-yellow-400", border: "border-yellow-500/30", dot: "bg-yellow-400" },
  OK:       { bg: "bg-green-500/15", text: "text-green-400", border: "border-green-500/30", dot: "bg-green-400" },
};

export const URGENCY_LABELS = {
  CRITICAL: "Critical",
  LOW: "Low Stock",
  WATCH: "Watch",
  OK: "OK",
};

export const EVENT_TYPE_LABELS = {
  wholesale: "Wholesale",
  new_store: "New Store",
  "3pl": "3PL",
  event: "Event",
};

export const EVENT_STATUS_LABELS = {
  planned: "Planned",
  confirmed: "Confirmed",
  fulfilled: "Fulfilled",
};

export const formatNumber = (n) => {
  if (n == null) return "—";
  return n.toLocaleString("en-CA");
};

export const formatCurrency = (n) => {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
};

export const formatPct = (n) => {
  if (n == null) return "—";
  return `${n > 0 ? "+" : ""}${n}%`;
};

// Unique categories from plan items
export const getCategories = (items) => {
  const cats = new Set(items.map(i => i.category));
  return ["All", ...Array.from(cats).sort()];
};

// Category colors for charts
const CAT_COLORS = [
  "#ea580c", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#e11d48", "#a855f7", "#22c55e", "#0ea5e9",
];

export const getCategoryColor = (idx) => CAT_COLORS[idx % CAT_COLORS.length];

// Build inventory lookup from Inventory entities
export const buildInventoryMap = (inventoryRecords) => {
  const map = {};
  (inventoryRecords || []).forEach(rec => {
    if (rec.location === "neob HQ" && rec.sku) {
      map[rec.sku] = (map[rec.sku] || 0) + (rec.quantity || rec.available || 0);
    }
  });
  return map;
};

// Convert baseline JSON SKUs to DemandSummary shape
export const baselineToSummaries = (baseline) => {
  return baseline.skus.map(s => ({
    sku: s.sku,
    product: s.product,
    category: s.category || categorize(s.product),
    totalQty: s.totalQty,
    avgMonthly: s.avgMonthly,
    monthly: s.monthly,
    byChannel: s.byChannel,
    byLocation: s.byLocation,
    totalRevenue: s.totalRevenue,
    dataMonths: baseline.period.months,
    periodStart: baseline.period.start,
    periodEnd: baseline.period.end,
    updatedAt: baseline.generatedAt,
  }));
};

// Default workspace config
export const DEFAULT_WORKSPACE = {
  name: "Default",
  mode: "forecast",
  forecastMonths: 3,
  growthPct: 0,
  safetyPct: 20,
  minMonthlyVelocity: 5,
  targetLevels: {},
  inventoryOverrides: {},
  exclusionList: [],
  isDefault: true,
};
