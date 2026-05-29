import db from './db/database.js';

// Pricing per million tokens, in USD cents.
// Sonnet 4.6: $3 input / $15 output / $0.30 cached read
// Cache writes: $3.75 / M (5m TTL) or $6.00 / M (1h TTL)
const PRICING_CENTS_PER_M = {
  'claude-sonnet-4-6': {
    input: 300,
    output: 1500,
    cache_read: 30,
    cache_write_5m: 375,
    cache_write_1h: 600
  }
};

function calcCostCents(model, usage) {
  const p = PRICING_CENTS_PER_M[model];
  if (!p) {
    console.warn(`[usage] no pricing for model ${model}, recording cost as 0`);
    return 0;
  }
  const input = (usage.input_tokens || 0) / 1_000_000 * p.input;
  const output = (usage.output_tokens || 0) / 1_000_000 * p.output;
  const cacheRead = (usage.cache_read_input_tokens || 0) / 1_000_000 * p.cache_read;
  // Split cache writes by TTL when reported separately by the API
  const cw5m = usage.cache_creation?.ephemeral_5m_input_tokens;
  const cw1h = usage.cache_creation?.ephemeral_1h_input_tokens;
  let cacheWrite;
  if (cw5m != null || cw1h != null) {
    cacheWrite = ((cw5m || 0) / 1_000_000 * p.cache_write_5m)
               + ((cw1h || 0) / 1_000_000 * p.cache_write_1h);
  } else {
    // Fallback: assume 5m TTL when breakdown not provided
    cacheWrite = (usage.cache_creation_input_tokens || 0) / 1_000_000 * p.cache_write_5m;
  }
  return Math.round((input + output + cacheRead + cacheWrite) * 10000) / 10000;
}

export function logUsage({ feature, model, response }) {
  try {
    const u = response?.usage || {};
    const cost = calcCostCents(model, u);
    db.prepare(`
      INSERT INTO api_usage (feature, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_cents)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      feature,
      model,
      Number(u.input_tokens || 0),
      Number(u.output_tokens || 0),
      Number(u.cache_read_input_tokens || 0),
      Number(u.cache_creation_input_tokens || 0),
      cost
    );
    return cost;
  } catch (err) {
    console.warn('[usage] logging failed:', err.message);
    return 0;
  }
}

export function todayCostCents(feature) {
  const row = feature
    ? db.prepare(
        "SELECT COALESCE(SUM(cost_cents), 0) AS c FROM api_usage WHERE feature = ? AND date(timestamp) = date('now')"
      ).get(feature)
    : db.prepare(
        "SELECT COALESCE(SUM(cost_cents), 0) AS c FROM api_usage WHERE date(timestamp) = date('now')"
      ).get();
  return row?.c || 0;
}
