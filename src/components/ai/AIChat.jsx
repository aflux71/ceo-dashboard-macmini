import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Sparkles, User } from "lucide-react";
import ReactMarkdown from "react-markdown";

const QUICK_PROMPTS = [
  "Run the full production planning workflow (Steps 1-5)",
  "What should we make, can we make it, and what do we need to order?",
  "Rank the top 15 SKUs that need production attention",
  "Which SKUs are BLOCKED on raw materials right now?",
  "Build a 10-day production schedule by line",
  "Generate the purchase order queue grouped by supplier",
];

const SYSTEM_PROMPT = `You are the neōb Production Planning Assistant, an intelligent scheduling and operations AI for neōb (Niagara Essential Oils and Blends Inc.), a luxury bath and body manufacturing company based in Niagara-on-the-Lake, Ontario.

You have access to the following entities via live data: ForecastSuggestion, ProductionRequest, ProductionLineCapacity, Recipe, Batch, MaterialUsage, Inventory, Supplier, and MasterExclusion.

## YOUR ROLE
You help the production team answer one core question on every run:
"What should we make, can we make it, and what do we need to order?"

## neōb Business Context
**Production lines (4):**
- **Piston Filler 1** — Creams and liquids (soaps, body washes, lotions, shampoos, conditioners)
- **Piston Filler 2** — Essential oils, roll-ons, serums
- **Melter** — Deodorant, glycerin soap bars
- **Powder Room** — Shampoo bars, bath bombs

**Production types (Recipe.production_type):**
- \`make\` — produced in-house (schedule on production lines)
- \`copacked\` — outsourced to a co-packer (do NOT schedule on production lines)
- \`buy\` — purchased finished goods (do NOT schedule on production lines)

**Planning horizon:** 2–3 weeks. Supplier lead times: 3–8 weeks (procurement alerts must be proactive).

---

## STEP 1 — READ THE DEMAND PLANNER

Read all ForecastSuggestions with status \`suggested\`, \`scheduled\`, \`on_hold\`, or \`in_progress\` (treat as pending/urgent).
Exclude any SKU in MasterExclusion.
Sort by priority using this logic:
- **CRITICAL**: on_hand = 0 AND suggested_qty > 0
- **HIGH**: on_hand < reorder_point AND days_until_stockout <= 14
- **MEDIUM**: days_until_stockout between 15–30
- **LOW**: everything else

Present a ranked list of the top 15 SKUs that need production attention.

---

## STEP 2 — CHECK INVENTORY AGAINST BOM

For each SKU in the ranked list, retrieve its Recipe (BOM).
For each ingredient/component in the Recipe:
- Check current Inventory quantity for that material SKU
- Calculate total needed: ceil(suggested_qty / batch_size) × ingredient_qty per batch
- Calculate how many full batches can be made with available stock

Output for each SKU:
- ✅ **CAN MAKE** — sufficient raw materials on hand
- ⚠️ **PARTIAL** — can make X of Y batches before materials run out
- ❌ **BLOCKED** — missing one or more critical materials

If a SKU has no Recipe, flag as **DATA GAP — no recipe**; if a material's inventory record is missing, flag as **DATA GAP — material not tracked**. Do not assume availability.

---

## STEP 3 — BUILD PRODUCTION SCHEDULE RECOMMENDATIONS

From SKUs marked ✅ or ⚠️ (skip \`copacked\` and \`buy\` types):
- Assign to a ProductionLine based on ProductionLineCapacity and the Recipe's preferred production_line
- Calculate estimated run time using filling_rate_units_per_hour and batches × batch_size
- Add degassing_time_days + qc_hold_time_days to get the earliest ship-ready date
- Factor in changeover_time_minutes between batches on the same line
- Flag any line capacity conflicts (daily_capacity exceeded)

Present as a sequenced daily schedule for the next 10 business days.

---

## STEP 4 — RAW MATERIAL ORDER RECOMMENDATIONS

For SKUs marked ⚠️ PARTIAL or ❌ BLOCKED:
- Identify every missing or insufficient material from the BOM
- Calculate exact shortfall = needed − on_hand
- Group shortfalls by Supplier (from Inventory.supplier)
- Use Inventory.lead_time_days first, fall back to Supplier.lead_time_days
- Flag materials needed within 7 days as 🔴 **RUSH ORDER**
- Flag materials needed within 8–21 days as 🟡 **STANDARD ORDER**

Output a purchase order summary grouped by supplier, with:
- Material name & SKU
- Quantity needed (with unit)
- Priority (RUSH / STANDARD)
- SKUs blocked pending this material

---

## STEP 5 — SUMMARY OUTPUT FORMAT

Always end with a structured summary in this exact format:

### 🟥 CRITICAL — Produce Immediately (stock = 0)
[list]

### 🟧 HIGH PRIORITY — Produce This Week
[list]

### ✅ Scheduled — Can Run Now
[production schedule by line + date]

### 🛒 Purchase Order Queue
[grouped by supplier]

### ⚠️ Blocked — Awaiting Materials
[list with ETA if known]

---

## RULES

- **Never schedule a batch without first confirming BOM materials are available or on order.**
- **Always show your quantity math** (e.g., "Recipe calls for 2.4L fragrance per batch × 3 batches = 7.2L needed, 5.1L on hand, shortfall: 2.1L").
- **If inventory data is missing for a material, flag it as DATA GAP** — do not assume availability.
- **Use metric units (L, kg, g, ml, units)** consistent with existing recipe records.
- **Do not modify any records without explicit user confirmation.**
- **Always exclude MasterExclusion SKUs** from planning.
- **Never schedule \`copacked\` or \`buy\` items on production lines** — use Recipe.copacker_lead_time_days for co-pack timing instead.
- **Round up to the nearest whole batch** when calculating production qty.

## Response Style
- Lead with the answer, then the detail
- Always show quantities with units (kg, L, g, ml, units)
- Flag critical items first (negative stock, missed order windows)
- Be specific: "Order 25L Lemongrass EO from Azelis Canada by 2026-06-04" — not "consider ordering lemongrass"
- When data is missing (no recipe, no supplier lead time), say so explicitly as DATA GAP
- For co-packed items, give the co-packer lead time and suggest contacting the co-packer

## Output Formatting (CRITICAL: Base44 chat does NOT render markdown tables)
**DO NOT use | pipe tables, --- separators, or markdown table syntax**

Instead, format lists like this:

MATERIAL: Lavender Oil (Glorious)
  Needed for: Roll-on Lavender ×1658, Baby Butter ×177
  Quantity: ~6–8 kg
  Supplier: Azelis Canada Inc
  Lead time: 49 days 🔴 OVERDUE — order immediately

(blank line between items)

MATERIAL: Grapeseed Oil
  Needed for: Body Oil Blend ×420
  Quantity: ~2–3 kg
  Supplier: Azelis Canada Inc
  Lead time: 42 days 🟡 URGENT

Rules:
- Use ALL CAPS for section headers (CRITICAL, URGENT, WATCH, MATERIAL, SKU, etc.)
- Use plain numbered lists for action items (1. 2. 3. etc.)
- Separate each item with a blank line
- Use emoji indicators: 🔴 OVERDUE, 🟡 URGENT, 🟢 OK, ⚠️ WATCH
- NO --- or === dividers
- NO | pipe characters
- Keep responses concise; lead with summary first

## What You Cannot Do Yet
- Access Shopify per-store retail inventory directly (use Production Assistant at 100.68.55.123:3001)
- See financial forecasts or revenue targets (use the CEO Dashboard)
- Send purchase orders automatically (create a PurchaseRequisition record instead)`;

export default function AIChat() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! I can answer questions about your inventory, batches, demand, labels, and more. What would you like to know?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const buildContext = async () => {
    try {
      const [
        inventory,
        labels,
        batches,
        demandSummaries,
        forecastSuggestions,
        masterExclusions,
        recipes,
        suppliers,
        lineCapacity,
        openPOs,
        requisitions,
        copackOrders,
        productionRequests,
      ] = await Promise.all([
        base44.entities.Inventory.list('-updated_date', 100).catch(() => []),
        base44.entities.Label.list('-updated_date', 50).catch(() => []),
        base44.entities.Batch.filter({ status: { $in: ['pending_qc', 'started', 'on_hold', 'in_review'] } }).catch(() => []),
        base44.entities.DemandSummary.list('-avgMonthly', 50).catch(() => []),
        base44.entities.ForecastSuggestion.filter({ status: { $in: ['suggested', 'scheduled', 'on_hold', 'in_progress'] } }).catch(() => []),
        base44.entities.MasterExclusion.list().catch(() => []),
        base44.entities.Recipe.filter({ active: true }).catch(() => []),
        base44.entities.Supplier.list().catch(() => []),
        base44.entities.ProductionLineCapacity.filter({ active: true }).catch(() => []),
        base44.entities.PurchaseOrder.filter({ status: { $in: ['submitted', 'confirmed', 'shipped'] } }).catch(() => []),
        base44.entities.PurchaseRequisition.list('-created_date', 30).catch(() => []),
        base44.entities.CopackOrder.list('-created_date', 30).catch(() => []),
        base44.entities.ProductionRequest.filter({ status: { $in: ['pending', 'material_check', 'approved', 'in_production'] } }).catch(() => []),
      ]);

      // Build excluded SKU set so the model doesn't have to remember it
      const excludedSkus = new Set(masterExclusions.map(m => m.sku));

      // Compact recipe view — keep ingredients/packaging short
      const recipeBlock = recipes.slice(0, 80).map(r => {
        const ing = (r.ingredients || []).map(i => `${i.material}:${i.qty}${i.unit || ''}`).join(', ');
        return `- ${r.sku} | ${r.name} | type:${r.production_type || 'make'} | line:${r.production_line || '?'} | batch:${r.batch_size}${r.batch_unit || ''} | copacker_lead:${r.copacker_lead_time_days || '-'}d | ingredients:[${ing}]`;
      }).join('\n');

      return `
=== MASTER EXCLUSION LIST (NEVER plan these) ===
${masterExclusions.map(m => `- ${m.sku} (${m.scope})${m.reason ? ' — ' + m.reason : ''}`).join('\n') || '(none)'}

=== FORECAST SUGGESTIONS (active production needs) ===
${forecastSuggestions
  .filter(f => !excludedSkus.has(f.sku))
  .sort((a, b) => {
    const order = { critical: 0, event: 1, soon: 2, ok: 3 };
    return (order[a.urgency] ?? 9) - (order[b.urgency] ?? 9);
  })
  .slice(0, 60)
  .map(f => `- ${f.urgency?.toUpperCase()} | ${f.sku} | ${f.product_name} | need:${f.suggested_qty} | on_hand:${f.on_hand} | by:${f.target_date || '-'} | line:${f.assigned_production_line || f.production_line || '?'} | status:${f.status}`)
  .join('\n') || '(none)'}

=== PRODUCTION REQUESTS (manual + forecast) ===
${productionRequests.map(p => `- ${p.urgency?.toUpperCase() || '-'} | ${p.sku} | ${p.product_name} | qty:${p.quantity_needed} | due:${p.due_date || '-'} | type:${p.production_type || '-'} | status:${p.status}`).join('\n') || '(none)'}

=== RAW MATERIAL & FINISHED INVENTORY (top 100) ===
${inventory.map(i => `- ${i.sku} | ${i.name} | type:${i.type} | qty:${i.quantity}${i.unit} | reorder@${i.reorder_point || '-'} | reorder_qty:${i.reorder_qty || '-'} | supplier:${i.supplier || '-'} | lead:${i.lead_time_days || '-'}d`).join('\n')}

=== RECIPES / BOM (active, top 80) ===
${recipeBlock}

=== SUPPLIERS ===
${suppliers.map(s => `- ${s.name} | lead:${s.lead_time_days || '-'}d | contact:${s.contact_email || s.contact_name || '-'}`).join('\n') || '(none)'}

=== PRODUCTION LINE CAPACITY ===
${lineCapacity.map(l => `- Line ${l.line_number} (${l.line_name}) | daily:${l.daily_capacity_units || l.daily_capacity_liters || '?'} | fill_rate:${l.filling_rate_units_per_hour || '-'}/hr | changeover:${l.changeover_time_minutes || '-'}min | types:[${(l.product_types || []).join(',')}]`).join('\n') || '(none)'}

=== LABEL STOCK (top 50) ===
${labels.map(l => `- ${l.sku} | ${l.name} | on_hand:${l.current_quantity} | reorder@${l.reorder_point} | lead:${l.lead_time_days || '-'}d`).join('\n')}

=== OPEN PURCHASE ORDERS ===
${openPOs.slice(0, 30).map(po => `- ${po.po_number} | ${po.supplier} | status:${po.status} | expected:${po.expected_date || '-'} | items:${(po.items || []).length}`).join('\n') || '(none)'}

=== OPEN PURCHASE REQUISITIONS ===
${requisitions.slice(0, 30).map(r => `- ${r.sku || '-'} | ${r.product_name || r.material_name || '-'} | qty:${r.quantity || '-'} | status:${r.status || '-'}`).join('\n') || '(none)'}

=== ACTIVE CO-PACK ORDERS ===
${copackOrders.slice(0, 20).map(c => `- ${c.sku || '-'} | ${c.product_name || '-'} | qty:${c.quantity || '-'} | ship_by:${c.ship_by || '-'} | status:${c.status || '-'}`).join('\n') || '(none)'}

=== ACTIVE BATCHES (pending QC / in progress / on hold / in review) ===
${batches.map(b => `- ${b.batch_id} | ${b.sku} | ${b.product_name} | qty:${b.quantity} | line:${b.production_line || '-'} | status:${b.status}`).join('\n') || '(none)'}

=== DEMAND SUMMARIES (top 50 by avg monthly) ===
${demandSummaries.map(d => `- ${d.sku} | ${d.product} | avg/mo:${d.avgMonthly} | total:${d.totalQty} | data_months:${d.dataMonths || '-'}`).join('\n')}
      `.trim();
    } catch (err) {
      console.error('AIChat context build failed:', err);
      return "Context unavailable.";
    }
  };

  const sendMessage = async (text) => {
    const userMsg = text || input.trim();
    if (!userMsg) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const context = await buildContext();
      const history = messages.slice(-8).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');

      const response = await base44.integrations.Core.InvokeLLM({
        model: "claude_sonnet_4_6",
        prompt: `${SYSTEM_PROMPT}

=== LIVE DATA FROM BASE44 ===
${context}

=== CONVERSATION HISTORY ===
${history}

User: ${userMsg}

Answer the user using the live data above. Follow your response style rules: lead with the answer, use tables for lists, always include units, flag critical items first, and be specific (named SKUs, suppliers, dates, quantities). If a recipe or supplier lead time is missing, say so explicitly.`,
      });
      setMessages(prev => [...prev, { role: "assistant", content: response }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I encountered an error. Please try again." }]);
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-[70vh]">
      {/* Messages */}
      <Card className="bg-zinc-900 border-zinc-800 flex-1 overflow-hidden flex flex-col">
        <CardContent className="p-4 flex-1 overflow-y-auto space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'bg-zinc-800 text-zinc-200'
              }`}>
                {msg.role === 'assistant'
                  ? <ReactMarkdown className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{msg.content}</ReactMarkdown>
                  : msg.content
                }
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-zinc-400" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-orange-400" />
              </div>
              <div className="bg-zinc-800 rounded-2xl px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </CardContent>
      </Card>

      {/* Quick prompts */}
      <div className="flex gap-2 mt-3 flex-wrap">
        {QUICK_PROMPTS.map((p, i) => (
          <button
            key={i}
            onClick={() => sendMessage(p)}
            disabled={loading}
            className="text-[11px] px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-full border border-zinc-700 transition-colors"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2 mt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Ask about inventory, demand, batches, labels..."
          className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-orange-500/50"
          disabled={loading}
        />
        <Button
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
          className="bg-orange-600 hover:bg-orange-500 text-white px-4"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}