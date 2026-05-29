import Anthropic from '@anthropic-ai/sdk';
import db from './db/database.js';
import dotenv from 'dotenv';
import { logUsage } from './usage.js';

dotenv.config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY_PRODUCTION });

const MODEL = 'claude-sonnet-4-6';

// --- TOOLS: each maps to a DB query the assistant can call ---

const TOOLS = [
  {
    name: 'get_production_needs',
    description: 'Returns SKUs that are low across the entire network (all locations combined). Use this to answer what needs to be PRODUCED. Each result shows total available across all locations and HQ stock specifically.',
    input_schema: {
      type: 'object',
      properties: {
        threshold: { type: 'number', description: 'Total network stock at or below this is considered low. Default 20.' }
      }
    }
  },
  {
    name: 'get_replenishment_needs',
    description: 'Returns retail store SKUs that are low but where HQ still has stock to send. Use this to answer what stores need RESTOCKED from HQ warehouse.',
    input_schema: {
      type: 'object',
      properties: {
        threshold: { type: 'number', description: 'Store stock at or below this is considered low. Default 5.' }
      }
    }
  },
  {
    name: 'get_sku_stock',
    description: 'Returns stock for one specific SKU across every location, plus the network total. Use when asked about a specific product.',
    input_schema: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: 'The SKU code to look up.' }
      },
      required: ['sku']
    }
  },
  {
    name: 'search_inventory',
    description: 'Search inventory by product name or SKU. Returns matching rows with per-location stock. Use to find products when you do not know the exact SKU.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Product name or partial SKU to search for.' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_stock_by_location',
    description: 'Returns total stock units and SKU count for each location. Use for an overview of where inventory sits across the network.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_business_stats',
    description: 'Returns high-level numbers: product count, order count, unfulfilled orders, 30-day revenue, total inventory units.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_unfulfilled_orders',
    description: 'Returns the list of orders that are not yet fulfilled.',
    input_schema: { type: 'object', properties: {} }
  }
];

// --- TOOL IMPLEMENTATIONS ---

function runTool(name, input) {
  switch (name) {
    case 'get_production_needs': {
      const threshold = Number(input.threshold || 20);
      return db.prepare(`
        SELECT sku, product_title, variant_title,
               SUM(available) AS total_available,
               SUM(CASE WHEN location_name = 'neob HQ' THEN available ELSE 0 END) AS hq_stock
        FROM inventory WHERE sku != ''
        GROUP BY sku HAVING total_available <= ?
        ORDER BY total_available ASC
      `).all(threshold);
    }
    case 'get_replenishment_needs': {
      const threshold = Number(input.threshold || 5);
      return db.prepare(`
        SELECT s.location_name AS store, s.sku, s.product_title,
               s.available AS store_stock, hq.available AS hq_stock
        FROM inventory s
        JOIN inventory hq ON s.sku = hq.sku AND hq.location_name = 'neob HQ'
        JOIN locations l ON s.location_id = l.id AND l.is_retail = 1
        WHERE s.available <= ? AND hq.available > 0 AND s.sku != ''
        ORDER BY s.available ASC
      `).all(threshold);
    }
    case 'get_sku_stock': {
      const rows = db.prepare(`
        SELECT location_name, available, product_title, variant_title
        FROM inventory WHERE sku = ? ORDER BY available DESC
      `).all(input.sku);
      const total = rows.reduce((s, r) => s + (r.available || 0), 0);
      return { sku: input.sku, total, locations: rows };
    }
    case 'search_inventory': {
      return db.prepare(`
        SELECT sku, product_title, variant_title, location_name, available
        FROM inventory
        WHERE product_title LIKE ? OR sku LIKE ?
        ORDER BY product_title, location_name
        LIMIT 100
      `).all(`%${input.query}%`, `%${input.query}%`);
    }
    case 'get_stock_by_location': {
      return db.prepare(`
        SELECT location_name, COUNT(*) AS skus, SUM(available) AS total_units
        FROM inventory GROUP BY location_name ORDER BY total_units DESC
      `).all();
    }
    case 'get_business_stats': {
      const products = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
      const orders = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
      const unfulfilled = db.prepare(`
        SELECT COUNT(*) AS c FROM orders
        WHERE fulfillment_status IS NULL OR fulfillment_status = 'partial'
      `).get().c;
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const revenue30 = db.prepare(`
        SELECT COALESCE(SUM(CAST(total_price AS REAL)),0) AS t
        FROM orders WHERE created_at >= ?
      `).get(since.toISOString()).t;
      const units = db.prepare('SELECT COALESCE(SUM(available),0) AS u FROM inventory').get().u;
      return {
        products, orders, unfulfilled,
        revenue_30d: Math.round(revenue30 * 100) / 100,
        inventory_units: units
      };
    }
    case 'get_unfulfilled_orders': {
      return db.prepare(`
        SELECT order_number, created_at, total_price, financial_status
        FROM orders
        WHERE fulfillment_status IS NULL OR fulfillment_status = 'partial'
        ORDER BY created_at DESC LIMIT 100
      `).all();
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

const SYSTEM_PROMPT = `You are the neōb Production Assistant — an operations AI for neōb (Niagara Essential Oils and Blends), a luxury bath and body brand.

neōb runs a hub-and-spoke model: the HQ warehouse holds stock and replenishes 5 retail stores (Queen Street, Flower Farm, Elora, Stratford, Bracebridge). neōb also produces its own products.

Your job is to help with production planning and replenishment. Use the tools to get LIVE data — never guess stock numbers. Always base answers on actual tool results.

Guidance:
- "What do we need to produce?" -> get_production_needs. These are network-wide low items.
- "What needs restocking / what do stores need?" -> get_replenishment_needs. Store low, HQ can send.
- Flag the critical cases: when a store is low AND HQ is also nearly out, that is a production trigger, not just a transfer.
- Be concise and practical. Lead with the answer. Group by category or store when it helps.
- When numbers matter, state them. Round currency sensibly.
- You currently see finished-goods inventory only. If asked about raw materials, recipes, pouches, oils, or whether something CAN be produced, explain that bill-of-materials tracking is a planned future capability not yet connected.`;

// --- AGENTIC LOOP ---

export async function askAssistant(userMessage, history = []) {
  const messages = [...history, { role: 'user', content: userMessage }];
  let rounds = 0;
  const maxRounds = 6;

  while (rounds < maxRounds) {
    rounds++;
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages
    });

    logUsage({ feature: 'production_assistant', model: MODEL, response });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
      return { answer: text, messages };
    }

    // Run all requested tools
    const toolResults = [];
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        let result;
        try {
          result = runTool(block.name, block.input || {});
        } catch (err) {
          result = { error: err.message };
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result)
        });
      }
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return { answer: 'Sorry — I could not complete that request.', messages };
}
