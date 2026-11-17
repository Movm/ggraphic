// SPDX-License-Identifier: AGPL-3.0-only

/** Smallest text size a template text may be set at, as a share of the canvas height. */
export const MIN_TEXT_SHARE = 0.035;

export interface SlotBudget {
  maxWords?: number;
  maxLines?: number;
  maxChars?: number;
}

export type BudgetViolation =
  | { kind: 'words'; limit: number; actual: number }
  | { kind: 'chars'; limit: number; actual: number }
  | { kind: 'lines'; limit: number; actual: number }
  | { kind: 'fontSize'; limit: number; actual: number };

/** Breaking whitespace only: a no-break or narrow no-break space (\u00a0, \u202f) joins "73 %" into one word. */
const BREAKING_SPACE = /[ \t\n\r\f\v\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]+/;
/** Inline emphasis markers (bold, highlight, accent) that are not visible text. */
const MARKERS = /\*\*|==|\+\+/g;

const visible = (text: string): string => text.replace(MARKERS, '');

/** Words of the visible text; the emphasis markers `**`, `==`, `++` do not count. */
export function countWords(text: string): number {
  return visible(text).split(BREAKING_SPACE).filter(Boolean).length;
}

/** Code points of the visible text; markers and line breaks are not counted, blank text is 0. */
export function countChars(text: string): number {
  const flat = visible(text).replace(/[\r\n\u2028\u2029]/g, '');
  return flat.trim() === '' ? 0 : Array.from(flat).length;
}

export function minTextSizePx(canvasHeight: number): number {
  return Math.round(MIN_TEXT_SHARE * canvasHeight * 100) / 100;
}

export function checkSlotBudget(
  input: {
    text: string;
    fontSize: number;
    canvasHeight: number;
    lineCount?: number;
  },
  budget: SlotBudget
): BudgetViolation[] {
  const out: BudgetViolation[] = [];
  if (budget.maxWords !== undefined) {
    const actual = countWords(input.text);
    if (actual > budget.maxWords) out.push({ kind: 'words', limit: budget.maxWords, actual });
  }
  if (budget.maxChars !== undefined) {
    const actual = countChars(input.text);
    if (actual > budget.maxChars) out.push({ kind: 'chars', limit: budget.maxChars, actual });
  }
  if (budget.maxLines !== undefined && input.lineCount !== undefined) {
    if (input.lineCount > budget.maxLines) {
      out.push({ kind: 'lines', limit: budget.maxLines, actual: input.lineCount });
    }
  }
  const limit = minTextSizePx(input.canvasHeight);
  if (input.fontSize < limit) out.push({ kind: 'fontSize', limit, actual: input.fontSize });
  return out;
}
