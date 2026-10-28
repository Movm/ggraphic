// SPDX-License-Identifier: MPL-2.0

/**
 * Einpassen einer Überschrift in ihr Feld: Schriftgröße, bei der kein Wort
 * mitten in der Silbe brechen muss und der Text nicht in den nächsten läuft.
 */

import { hyphenationPoints } from './hyphenation.js';
import { wrapLines, type MeasureText } from './listLayout.js';

export interface SlotFit {
  /** Breite des Textfeldes in px. */
  width: number;
  /** Höhe, die der Text höchstens einnehmen darf (bis zum nächsten Text). */
  maxHeight: number;
  /** Größe, mit der begonnen wird. */
  fontSize: number;
  lineHeight: number;
  /** Darunter wird nicht verkleinert; Vorgabe 12. */
  minSize?: number;
}

/** Passt eine Messung für `fontSize` an: `measureAt(size)` misst Text in dieser Größe. */
export type MeasureAt = (fontSize: number) => MeasureText;

/**
 * Passt jedes Wort, an allen erlaubten Stellen getrennt, in die Breite? Die feinsten
 * Stücke sind die schmalsten, die ein Umbruch je bilden kann.
 */
function wordsFit(text: string, width: number, measure: MeasureText): boolean {
  const hyphen = measure('-');
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (measure(word) <= width) continue;
    let from = 0;
    for (const p of [...hyphenationPoints(word), word.length]) {
      const piece = word.slice(from, p);
      const dash = p === word.length || piece.endsWith('-') ? 0 : hyphen;
      if (measure(piece) + dash > width) return false;
      from = p;
    }
  }
  return true;
}

/**
 * Die größte Schriftgröße ≤ `fontSize`, bei der `text` in das Feld passt: kein
 * Wort braucht einen harten Bruch mitten in der Silbe, und die Zeilen bleiben
 * innerhalb von `maxHeight`. Ein Wort, das auch getrennt nicht passt, verkleinert
 * die Schrift, statt mitten im Wort umzubrechen.
 */
export function fitFontSizeToSlot(text: string, slot: SlotFit, measureAt: MeasureAt): number {
  const min = slot.minSize ?? 12;
  let size = slot.fontSize;
  while (size > min) {
    const measure = measureAt(size);
    const fits =
      wordsFit(text, slot.width, measure) &&
      wrapLines(text, slot.width, measure).length * size * slot.lineHeight <= slot.maxHeight;
    if (fits) return size;
    size -= 1;
  }
  return min;
}
