// SPDX-License-Identifier: AGPL-3.0-only
/** The few XML helpers the SVG writer and the SVG inliner share. */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** For text and attribute values alike: all five characters, so no caller has to know which. */
export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

/**
 * At most `digits` decimals with the trailing zeros trimmed. Never `-0` (`String(-0)` is `'0'`)
 * and never `NaN`: a non-finite value is a bug upstream, but it must not make the file invalid.
 */
export function formatNumber(value: number, digits = 3): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(digits))) : '0';
}
