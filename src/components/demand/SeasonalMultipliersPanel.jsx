import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Snowflake } from "lucide-react";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const KNOWN_CATEGORIES = [
  "Bath Bombs", "Body Wash", "Hand Soap", "Shampoo Bars",
  "Scrubs", "Lotions", "Body Butters", "Candles", "Oils", "Soaps", "Other",
];

/**
 * categorySeasonalMultipliers shape stored in workspace:
 * {
 *   "Bath Bombs": { 11: 1.5, 0: 0.8 },   // 0-indexed months
 *   "Candles": { 11: 2.0 },
 * }
 */
export default function SeasonalMultipliersPanel({ workspace, onWorkspaceChange, summaries }) {
  const [newCategory, setNewCategory] = useState("");
  const [newMonth, setNewMonth] = useState("11"); // December default
  const [newMultiplier, setNewMultiplier] = useState("1.5");

  const multipliers = workspace.categorySeasonalMultipliers || {};

  // Derive available categories from summaries + known list
  const availableCategories = useMemo(() => {
    const fromSummaries = [...new Set((summaries || []).map(s => s.category).filter(Boolean))];
    return [...new Set([...KNOWN_CATEGORIES, ...fromSummaries])].sort();
  }, [summaries]);

  const setMultipliers = (updated) => {
    onWorkspaceChange({ categorySeasonalMultipliers: updated });
  };

  const handleAdd = () => {
    const cat = newCategory.trim();
    const monthIdx = parseInt(newMonth, 10);
    const mult = parseFloat(newMultiplier);
    if (!cat || isNaN(monthIdx) || isNaN(mult) || mult <= 0) return;

    const updated = {
      ...multipliers,
      [cat]: {
        ...(multipliers[cat] || {}),
        [monthIdx]: mult,
      },
    };
    setMultipliers(updated);
    setNewCategory("");
    setNewMonth("11");
    setNewMultiplier("1.5");
  };

  const handleRemoveEntry = (category, monthIdx) => {
    const catData = { ...(multipliers[category] || {}) };
    delete catData[monthIdx];
    const updated = { ...multipliers };
    if (Object.keys(catData).length === 0) {
      delete updated[category];
    } else {
      updated[category] = catData;
    }
    setMultipliers(updated);
  };

  const handleUpdateMultiplier = (category, monthIdx, value) => {
    const mult = parseFloat(value);
    if (isNaN(mult) || mult <= 0) return;
    setMultipliers({
      ...multipliers,
      [category]: { ...(multipliers[category] || {}), [monthIdx]: mult },
    });
  };

  const totalRules = Object.values(multipliers).reduce(
    (sum, months) => sum + Object.keys(months).length, 0
  );

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-1 flex items-center gap-2">
          <Snowflake className="w-4 h-4 text-blue-400" />
          Seasonal Multipliers
          {totalRules > 0 && (
            <span className="text-xs text-zinc-500 font-normal">({totalRules} rule{totalRules !== 1 ? "s" : ""})</span>
          )}
        </h3>
        <p className="text-[10px] text-zinc-500 mb-4">
          Boost or reduce forecast demand for a category in specific months. A multiplier of 1.5 = +50%, 0.8 = −20%.
          Applied on top of growth % and safety stock.
        </p>

        {/* Existing rules */}
        {totalRules > 0 && (
          <div className="space-y-3 mb-4">
            {Object.entries(multipliers).map(([category, months]) => (
              <div key={category} className="bg-zinc-800/50 rounded-lg p-3">
                <p className="text-xs font-medium text-zinc-300 mb-2">{category}</p>
                <div className="space-y-1.5">
                  {Object.entries(months)
                    .sort(([a], [b]) => parseInt(a) - parseInt(b))
                    .map(([monthIdx, mult]) => (
                      <div key={monthIdx} className="flex items-center gap-2">
                        <span className="text-[11px] text-zinc-400 w-20 shrink-0">
                          {MONTH_NAMES[parseInt(monthIdx)]}
                        </span>
                        <span className="text-[10px] text-zinc-600">×</span>
                        <Input
                          type="number"
                          step="0.05"
                          min="0.1"
                          max="10"
                          value={mult}
                          onChange={(e) => handleUpdateMultiplier(category, parseInt(monthIdx), e.target.value)}
                          className="h-6 w-20 bg-zinc-900 border-zinc-700 text-xs text-center px-1"
                        />
                        <span className={`text-[10px] font-medium ${mult > 1 ? "text-green-400" : mult < 1 ? "text-red-400" : "text-zinc-500"}`}>
                          {mult > 1 ? `+${Math.round((mult - 1) * 100)}%` : mult < 1 ? `-${Math.round((1 - mult) * 100)}%` : "no change"}
                        </span>
                        <button
                          onClick={() => handleRemoveEntry(category, parseInt(monthIdx))}
                          className="ml-auto text-zinc-600 hover:text-red-400 p-0.5"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add new rule */}
        <div className="border border-zinc-700/50 rounded-lg p-3 space-y-2">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">Add Rule</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full h-8 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-2"
              >
                <option value="">Pick…</option>
                {availableCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Month</label>
              <select
                value={newMonth}
                onChange={(e) => setNewMonth(e.target.value)}
                className="w-full h-8 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-2"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx} value={idx}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Multiplier</label>
              <Input
                type="number"
                step="0.05"
                min="0.1"
                max="10"
                value={newMultiplier}
                onChange={(e) => setNewMultiplier(e.target.value)}
                className="h-8 bg-zinc-800 border-zinc-700 text-xs"
                placeholder="1.5"
              />
            </div>
          </div>
          {newMultiplier && !isNaN(parseFloat(newMultiplier)) && (
            <p className="text-[10px] text-zinc-500">
              Effect: {parseFloat(newMultiplier) > 1
                ? <span className="text-green-400">+{Math.round((parseFloat(newMultiplier) - 1) * 100)}% demand boost</span>
                : parseFloat(newMultiplier) < 1
                  ? <span className="text-red-400">−{Math.round((1 - parseFloat(newMultiplier)) * 100)}% demand reduction</span>
                  : "no change"}
            </p>
          )}
          <button
            onClick={handleAdd}
            disabled={!newCategory}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-medium rounded transition-colors"
          >
            <Plus className="w-3 h-3" /> Add Rule
          </button>
        </div>
      </CardContent>
    </Card>
  );
}