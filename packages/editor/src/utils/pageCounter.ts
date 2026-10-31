// SPDX-License-Identifier: MPL-2.0
/**
 * A text with `counter: 'page'` shows the number of the page it sits on instead of its own
 * text (the "ghost numeral" of a carousel). The stored text is only what is drawn where no page
 * is known, and what the template gate cannot see through.
 */

/**
 * What the gate measures a page counter as: the widest numeral a deck can show (it holds up to
 * 99 pages). "0" is the widest digit of the shipped fonts.
 */
export const PAGE_COUNTER_PROBE = '00';

/** The text to draw: the page number (from 1) for a page counter, else the stored text. */
export function shownText(
  item: { text: string; counter?: 'page' },
  pageNumber: number | null | undefined
): string {
  if (item.counter !== 'page' || pageNumber == null) return item.text;
  return String(pageNumber);
}
