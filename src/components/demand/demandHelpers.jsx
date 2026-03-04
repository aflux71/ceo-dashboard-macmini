// ── Constants ────────────────────────────────────────────────────────────────
export const URGENCY_COLORS = {
  CRITICAL: { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30" },
  LOW:      { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/30" },
  WATCH:    { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/30" },
  OK:       { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30" },
};

export const URGENCY_LABELS = {
  CRITICAL: "Critical",
  LOW:      "Low Stock",
  WATCH:    "Watch",
  OK:       "OK",
};

const CATEGORY_COLORS = [
  "#ea580c", "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#a855f7",
];

export function getCategoryColor(index) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

export function formatNumber(n) {
  if (n == null || isNaN(n)) return "0";
  return Math.round(n).toLocaleString();
}

export function formatCurrency(n) {
  if (n == null || isNaN(n)) return "$0";
  return "$" + Math.round(n).toLocaleString();
}

export function categorize(productName) {
  const name = (productName || "").toLowerCase();
  if (name.includes("bath bomb") || name.includes("bathbomb")) return "Bath Bombs";
  if (name.includes("body wash") || name.includes("bodywash")) return "Body Wash";
  if (name.includes("hand soap") || name.includes("handsoap")) return "Hand Soap";
  if (name.includes("shampoo bar")) return "Shampoo Bars";
  if (name.includes("scrub")) return "Scrubs";
  if (name.includes("lotion")) return "Lotions";
  if (name.includes("butter")) return "Body Butters";
  if (name.includes("candle")) return "Candles";
  if (name.includes("oil")) return "Oils";
  if (name.includes("soap")) return "Soaps";
  return "Other";
}

export function getCategories(items) {
  const cats = new Set((items || []).map(i => i.category));
  return ["All", ...Array.from(cats).sort()];
}

export const DEFAULT_WORKSPACE = {
  name: "Default",
  mode: "forecast",
  forecastMonths: 4,
  growthPct: 0,
  safetyPct: 20,
  minMonthlyVelocity: 0,
  targetLevels: {},
  inventoryOverrides: {},
  exclusionList: [],
  isDefault: false,
};

export function buildInventoryMap(inventoryItems) {
  const map = {};
  (inventoryItems || []).forEach(item => {
    if (item.sku) {
      map[item.sku] = (map[item.sku] || 0) + (item.quantity || 0);
    }
  });
  return map;
}