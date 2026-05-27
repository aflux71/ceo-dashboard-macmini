// Utilities for label serial range tracking.
// A serial range is defined by: prefix (string, optional), start (number), end (number), padding (number).
// Display format: `${prefix}${String(n).padStart(padding, '0')}`

// Returns a Julian-date prefix in the format YYDDD- (e.g. 26147- for May 27, 2026).
// Used as the default serial prefix when adding a label to a new PO.
export function julianDatePrefix(date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2);
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const day = Math.floor(diff / (1000 * 60 * 60 * 24));
  const ddd = String(day).padStart(3, "0");
  return `${yy}${ddd}-`;
}

// Compute the next available start number for a label based on its existing
// serial_ranges. Returns 1 if no prior ranges exist (per-prefix scoped if a
// prefix is supplied; otherwise scoped to the overall max + 1).
export function nextAvailableStart(label, prefix) {
  const ranges = (label?.serial_ranges || []).filter((r) =>
    prefix === undefined ? true : (r.serial_prefix || "") === (prefix || "")
  );
  if (ranges.length === 0) return 1;
  const maxEnd = Math.max(
    ...ranges.map((r) => Number(r.serial_end || 0)).filter((n) => !isNaN(n))
  );
  return (maxEnd || 0) + 1;
}

// Build an auto-populated serial range for a label + quantity.
// Uses julian-date prefix and the next sequential number for that prefix.
export function autoSerialRange(label, quantity, date = new Date()) {
  const prefix = julianDatePrefix(date);
  const start = nextAvailableStart(label, prefix);
  const qty = Number(quantity) || 0;
  const end = qty > 0 ? start + qty - 1 : start;
  return { serial_prefix: prefix, serial_start: start, serial_end: end, serial_padding: 4 };
}

export function formatSerial(prefix, n, padding = 4) {
  if (n === undefined || n === null || isNaN(n)) return "";
  const padded = String(Number(n)).padStart(Number(padding) || 0, "0");
  return `${prefix || ""}${padded}`;
}

export function formatSerialRange(prefix, start, end, padding = 4) {
  if (start === undefined || end === undefined || start === null || end === null) return "";
  return `${formatSerial(prefix, start, padding)} – ${formatSerial(prefix, end, padding)}`;
}

export function rangeCount(start, end) {
  if (start === undefined || end === undefined) return 0;
  const s = Number(start);
  const e = Number(end);
  if (isNaN(s) || isNaN(e) || e < s) return 0;
  return e - s + 1;
}

// Validate that a list of ranges has no overlaps within the same prefix.
// Returns null if valid, or { message } if there is an issue.
export function validateRanges(ranges) {
  for (const r of ranges) {
    if (r.serial_start === undefined || r.serial_end === undefined) continue;
    if (Number(r.serial_end) < Number(r.serial_start)) {
      return { message: `Serial end must be >= start (line ${r.label_sku || ""})` };
    }
  }
  // Overlap check per prefix
  const byPrefix = {};
  for (const r of ranges) {
    if (r.serial_start === undefined || r.serial_end === undefined) continue;
    const key = (r.serial_prefix || "").trim();
    byPrefix[key] = byPrefix[key] || [];
    byPrefix[key].push({ start: Number(r.serial_start), end: Number(r.serial_end), sku: r.label_sku });
  }
  for (const key of Object.keys(byPrefix)) {
    const arr = byPrefix[key].sort((a, b) => a.start - b.start);
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].start <= arr[i - 1].end) {
        return {
          message: `Overlapping serial ranges for prefix "${key}" (${arr[i - 1].sku} and ${arr[i].sku})`,
        };
      }
    }
  }
  return null;
}