// SPDX-License-Identifier: AGPL-3.0-only

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
  /** Obergrenze: begonnen wird bei `max(fontSize, maxSize)`, die Größe kann also wieder wachsen. */
  maxSize?: number;
  /**
   * Platz bis zum nächsten Element darunter: gilt erst ab der zweiten Zeile. Eine einzeilige
   * Vorlage steht, wo sie gezeichnet wurde; verkleinern ändert dort nichts. `gap` kommt dazu.
   */
  room?: number;
  /** Abstand unter dem Text als Anteil der Zeilenhöhe (`size * lineHeight`), der zu `maxHeight` dazukommt. */
  gap?: number;
  /** Höchstens so viele Zeilen. */
  maxLines?: number;
  /** Kein Wort wird getrennt oder mitten im Wort umgebrochen: jedes Wort muss ganz in die Breite passen. */
  wholeWords?: boolean;
  /** Zeilenzahl bei `size`, wenn der Aufrufer sie genauer kennt als `wrapLines` (der Renderer-Umbruch). */
  countLines?: (size: number) => number;
  /**
   * Breite des breitesten Worts bei `size`, wenn der Aufrufer sie genauer kennt als `measureAt`
   * (jeder Lauf in seinem eigenen Schnitt: ein fettes Wort ist breiter). Gilt nur mit `wholeWords`.
   */
  widestWord?: (size: number) => number;
}

/** Passt eine Messung für `fontSize` an: `measureAt(size)` misst Text in dieser Größe. */
export type MeasureAt = (fontSize: number) => MeasureText;

/**
 * Passt jedes Wort, an allen erlaubten Stellen getrennt, in die Breite? Die feinsten
 * Stücke sind die schmalsten, die ein Umbruch je bilden kann.
 */
function wordsFit(text: string, width: number, measure: MeasureText, whole = false): boolean {
  if (whole) {
    return text
      .replace(/\*\*|==|\+\+/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .every((word) => measure(word) <= width);
  }
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

/** Passt `text` bei genau `size` in das Feld? */
export function slotFits(text: string, slot: SlotFit, measureAt: MeasureAt, size: number): boolean {
  const measure = measureAt(size);
  const wordsOk =
    slot.wholeWords && slot.widestWord
      ? slot.widestWord(size) <= slot.width
      : wordsFit(text, slot.width, measure, slot.wholeWords);
  if (!wordsOk) return false;
  const lines = slot.countLines?.(size) ?? wrapLines(text, slot.width, measure).length;
  if (slot.maxLines !== undefined && lines > slot.maxLines) return false;
  const high = (lines + (slot.gap ?? 0)) * size * slot.lineHeight;
  if (high > slot.maxHeight) return false;
  return slot.room === undefined || lines <= 1 || high <= slot.room;
}

/**
 * Die größte Schriftgröße von `max(fontSize, maxSize)` abwärts, bei der `text` in das Feld passt:
 * kein Wort braucht einen harten Bruch mitten in der Silbe (mit `wholeWords` darf auch kein Wort
 * getrennt werden), die Zeilen bleiben innerhalb von `maxLines` und `maxHeight`. Ein Wort, das auch
 * getrennt nicht passt, verkleinert die Schrift, statt mitten im Wort umzubrechen. Passt es auch bei
 * `minSize` nicht, ist das Ergebnis `minSize` (`slotFits` sagt, ob es dort passt).
 */
export function fitFontSizeToSlot(text: string, slot: SlotFit, measureAt: MeasureAt): number {
  const min = slot.minSize ?? 12;
  const start = Math.max(slot.fontSize, slot.maxSize ?? slot.fontSize);
  // Sizes start, start - 1, ... above `min`; if s fits, every smaller s fits, so the first
  // fitting step is found by bisection (the result equals a 1 px linear scan).
  let low = 0;
  let high = Math.max(0, Math.ceil(start - min)); // high = "none fits, take min"
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (slotFits(text, slot, measureAt, start - mid)) high = mid;
    else low = mid + 1;
  }
  return low >= Math.ceil(start - min) ? min : start - low;
}
