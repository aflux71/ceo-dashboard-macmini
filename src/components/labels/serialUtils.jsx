// Utilities for label serial range tracking.
// A serial range is defined by: prefix (string, optional), start (number), end (number), padding (number).
// Display format: `${prefix}${String(n).padStart(padding, '0')}`

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