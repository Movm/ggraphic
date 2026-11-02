// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The line breaking of Konva's `Text` (wrap `word`, fixed width, no ellipsis), with the glyph
 * measure injected. It is a port of `Text._setTextData`, so the render gate can count the lines
 * of a plain text without Konva or a canvas. A test holds it against the real Konva node.
 *
 * Konva keeps leading spaces, breaks at a space or a dash, falls back to a break inside the
 * word when none fits, and drops the whitespace at the break.
 */

/** Width of `text` in px; `graphemes` is its length in grapheme clusters (letter spacing is per grapheme). */
export type MeasureLine = (text: string, graphemes: number) => number;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const splitGraphemes = (line: string): string[] =>
  Array.from(segmenter.segment(line), (part) => part.segment);

export function plainTextLines(
  text: string,
  maxWidth: number,
  measure: MeasureLine,
  wrap: 'word' | 'char' = 'word'
): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const graphemes = splitGraphemes(line);
    const length = graphemes.length;
    const lineWidth = measure(line, length);
    if (!(Number.isFinite(maxWidth) && lineWidth > maxWidth)) {
      out.push(line);
      continue;
    }
    const slice = (start: number, end: number) => graphemes.slice(start, end).join('');
    const isBreak = (char: string | undefined) => char === ' ' || char === '-';
    const perLine = Math.max(1, Math.ceil((length * maxWidth) / lineWidth));
    let start = 0;
    while (start < length) {
      const fits = (end: number) => measure(slice(start, end), end - start) <= maxWidth;
      let low = start;
      let high = Math.min(length, start + perLine);
      while (fits(high)) {
        low = high;
        if (high === length) break;
        high = Math.min(length, high + (high - start));
      }
      while (high - low > 1) {
        const mid = (low + high) >>> 1;
        if (fits(mid)) low = mid;
        else high = mid;
      }
      // Not even one character fits: Konva gives up on the rest of the paragraph.
      if (low === start) break;
      if (low === length) {
        out.push(slice(start, length));
        break;
      }
      if (wrap === 'word' && !isBreak(graphemes[low])) {
        let wrapIndex = low - 1;
        while (wrapIndex >= start && !isBreak(graphemes[wrapIndex])) wrapIndex--;
        if (wrapIndex >= start) low = wrapIndex + 1;
      }
      out.push(slice(start, low).trimEnd());
      start = low;
      while (start < length && !graphemes[start]!.trim()) start++;
    }
  }
  return out;
}
