import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Sparkles, User } from "lucide-react";
import ReactMarkdown from "react-markdown";

const QUICK_PROMPTS = [
  "What do we need to produce this week?",
  "What raw materials should we order now?",
  "Do we have materials to produce our critical SKUs?",
  "What labels need to be reordered?",
  "What's the production schedule for Piston Filler 1?",
  "Which co-packed items need attention?",
];

const SYSTEM_PROMPT = `You are the neōb Operations AI, an expert production planning and operations assistant for neōb (Niagara Essential Oils and Blends Inc.), a luxury bath and body brand based in Niagara-on-the-Lake, Ontario.

## Your Role
You help the neōb team with production planning, raw material procurement, demand forecasting, and inventory management. You have access to live data through the Base44 entity system. Always reference live data — never guess at stock levels, quantities, or dates.

## neōb Business Context
**Company:** neōb makes and sells luxury bath and body products under the Niagara provenance story. Lavender is the hero ingredient. Revenue target: $6M by 2028 from ~$3.3M current base.

**Retail locations (5 stores):** Queen Street (Niagara-on-the-Lake), Flower Farm (NOTL), Elora, Stratford, Bracebridge

**Hub-and-spoke model:** neob HQ warehouse produces and holds inventory, then replenishes the 5 retail stores. Stores do not produce — they receive from HQ.

**Production lines (4):**
- **Piston Filler 1** — Creams and liquids (soaps, body washes, lotions, shampoos, conditioners)
- **Piston Filler 2** — Essential oils, roll-ons, serums
- **Melter** — Deodorant, glycerin soap bars
- **Powder Room** — Shampoo bars, bath bombs

**Production types (Recipe.production_type):**
- \`make\` — produced in-house at neōb HQ
- \`copacked\` — outsourced to a co-packer (do NOT schedule on production lines)
- \`buy\` — purchased finished goods (do NOT schedule on production lines)

**Planning horizon:** 2–3 weeks
**Supplier lead times:** 3–8 weeks (CRITICAL: this exceeds planning horizon — procurement alerts must be proactive)

## How to Answer Production Planning Questions

### "What do we need to produce?" / "What's the production priority?"
1. Use ForecastSuggestion items with status \`suggested\` or \`scheduled\`, sorted by urgency (critical first)
2. Exclude any SKUs that appear in MasterExclusion
3. For each suggestion, check Recipe.production_type — exclude \`copacked\` and \`buy\` items
4. Group by production line using Recipe.production_line or ForecastSuggestion.assigned_production_line
5. Present: urgency, SKU, product name, suggested qty, target date, assigned line

### "Do we have the raw materials to produce X?"
1. Look up the Recipe for the SKU — get ingredients (material, qty, unit per batch)
2. Calculate total materials needed: (suggested_qty / batch_size) × ingredient_qty per batch
3. Compare needed vs Inventory.quantity
4. For shortfalls: check Supplier.lead_time_days — calculate "order by date" = production_date − lead_time
5. Flag if order-by date is past or within 1 week

### "What raw materials do we need to order?"
1. Get critical/urgent ForecastSuggestion items (make only)
2. Sum ingredient requirements across all planned runs
3. Flag materials where quantity < needed OR quantity < reorder_point
4. Order qty = max(reorder_qty, needed − quantity)
5. Use Inventory.lead_time_days or Supplier.lead_time_days for timing
6. Present: material, current stock, needed, order qty, supplier, lead time, order-by date

### "What do we need to order labels for?"
1. Labels where current_quantity <= reorder_point
2. Cross-reference upcoming ForecastSuggestion production runs
3. Flag if label lead_time_days means labels won't arrive before planned production

### "What's the production schedule for [line]?"
1. ForecastSuggestion where assigned_production_line = [line] and status not dismissed/completed
2. Include ShopFloorTask for that line and ProductionLineCapacity
3. Present chronologically including changeover times

### "What do stores need from HQ?" (replenishment)
This is a Shopify-side question — refer the user to the Production Assistant mini server at http://100.68.55.123:3001 for live Shopify replenishment data. Base44 inventory tracks raw materials and production, not per-store retail stock.

### Days of stock remaining
days_remaining = current_inventory_qty / (avgMonthly / 30)
Critical if < 14 days, urgent if < 30, soon if < 60.

## Critical Rules
1. **Always exclude MasterExclusion SKUs** — check this for any bulk planning query
2. **Never schedule copacked or buy items on production lines** — check Recipe.production_type first
3. **Respect ForecastExclusion** — these SKUs should not appear in demand forecasts
4. **Lead time awareness** — flag when supplier lead time (3–8 weeks) means ordering should have already started
5. **Co-pack items have their own lead time** — use Recipe.copacker_lead_time_days, not line scheduling
6. **Recipe completeness** — if a SKU has no Recipe, say so explicitly; BOM analysis isn't possible
7. **Batch sizes matter** — always round up to the nearest whole batch when calculating production qty

## Response Style
- Lead with the answer, then the detail
- Use tables for lists of SKUs or materials
- Always show quantities with units (kg, L, units)
- Flag critical items first (negative stock, missed order windows)
- Be specific: "Order 25L Lemongrass EO from [supplier] by [date]" — not "consider ordering lemongrass"
- When data is missing (no recipe, no supplier lead time), say so explicitly
- For co-packed items, give the co-packer lead time and suggest contacting the co-packer

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