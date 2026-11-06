// SPDX-License-Identifier: AGPL-3.0-only
/** The few XML helpers the SVG writer and the SVG inliner share. */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * What XML 1.0 does not allow in a document, escaped or not: the control characters other than
 * tab, LF and CR, the two non-characters U+FFFE and U+FFFF, and a surrogate that is not half of a
 * pair. A paste from Word or a PDF brings them in; one of them makes the whole file unreadable.
 */
/* eslint-disable no-control-regex -- the control characters are what it is for */
const ILLEGAL =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
/* eslint-enable no-control-regex */

/**
 * For text and attribute values alike: all five characters, so no caller has to know which. The
 * characters XML forbids are dropped.
 */
export function escapeXml(text: string): string {
  return text.replace(ILLEGAL, '').replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

/**
 * At most `digits` decimals with the trailing zeros trimmed. Never `-0` (`String(-0)` is `'0'`)
 * and never `NaN`: a non-finite value is a bug upstream, but it must not make the file invalid.
 */
export function formatNumber(value: number, digits = 3): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(digits))) : '0';
}
