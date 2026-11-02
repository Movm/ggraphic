// SPDX-License-Identifier: MPL-2.0
/** Greedy word wrap; a single over-long word keeps its own line. */
export function wrapWords(
  text: string,
  width: number,
  measureLine: (line: string) => number
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && measureLine(candidate) > width) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

/**
 * Same line count as a greedy wrap, but at the narrowest width that keeps it —
 * so a box never ends on a lone word ("Mutter. Jeden / Tag.").
 */
export function balancedWrap(
  text: string,
  width: number,
  measureLine: (line: string) => number
): string[] {
  const lines = wrapWords(text, width, measureLine);
  if (lines.length < 2) return lines;
  let low = 0;
  let high = width;
  for (let step = 0; step < 12; step++) {
    const mid = (low + high) / 2;
    if (wrapWords(text, mid, measureLine).length > lines.length) low = mid;
    else high = mid;
  }
  return wrapWords(text, high, measureLine);
}

/**
 * Largest size <= `size` at which every word of `texts` (plus `indent`) fits
 * `width` — the editor's wrap breaks a word that does not fit mid-letter.
 * Measured bold, the widest face a mark can switch to.
 */
export function largestSizeWordsFit(
  texts: string[],
  size: number,
  width: number,
  indent: number,
  measureWord: (word: string, size: number) => number,
  minSize = 24
): number {
  const words = texts
    .join(' ')
    .replace(/\*\*|__|==|\+\+|\*/g, '')
    .split(/\s+/)
    .filter(Boolean);
  let fitted = size;
  while (fitted > minSize && words.some((w) => indent + measureWord(w, fitted) > width)) fitted--;
  return fitted;
}
