import QRCode from "qrcode";

/**
 * Generate a QR code as a data URL (PNG).
 * Returns "" on failure so callers can safely embed without try/catch.
 */
export async function generateQRDataURL(text, options = {}) {
  if (!text) return "";
  try {
    return await QRCode.toDataURL(String(text), {
      margin: 1,
      width: 180,
      errorCorrectionLevel: "M",
      ...options,
    });
  } catch {
    return "";
  }
}

/**
 * Parse a scanned code into a usable identifier.
 * Accepts plain batch IDs (e.g. "BF-TRV-001") or URL-encoded forms
 * like "neob://batch/BF-TRV-001" or "https://app/?batch=BF-TRV-001".
 */
export function parseScannedCode(raw) {
  if (!raw) return "";
  const text = String(raw).trim();

  // neob://batch/<id>
  const proto = text.match(/^neob:\/\/batch\/(.+)$/i);
  if (proto) return proto[1].trim();

  // ?batch=<id>
  try {
    const url = new URL(text);
    const q = url.searchParams.get("batch");
    if (q) return q.trim();
  } catch { /* not a URL */ }

  return text;
}