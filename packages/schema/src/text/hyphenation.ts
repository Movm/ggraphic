// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Silbentrennung und Einpassen für Überschriften — DOM-frei, wie das Textlayout.
 *
 * Kein Wörterbuch: ein Regelwerk für deutsche Wörter, das an Silbengrenzen trennt
 * („Ge-mein-schafts-gar-ten") und Zusammensetzungen an der Fuge trifft, weil dort
 * ein Konsonantenhaufen zwischen zwei Vokalen steht. Es trennt nicht immer so, wie
 * der Duden es täte (ein Wörterbuch kennt „Dinge-n"), trennt aber nie mitten in
 * einer Silbe — und nur das braucht der Umbruch: ein sinnvoller Strich statt
 * „Gemeinschaftsga / rten".
 */

/** Konsonantengruppen, die ein Laut sind und nicht getrennt werden. */
const CONSONANT_UNITS = ['sch', 'ch', 'ck', 'ph', 'th', 'qu'];
/** Zwei Buchstaben, die zusammen EINEN Vokallaut ergeben. */
const VOWEL_UNITS = ['ei', 'ie', 'au', 'eu', 'äu', 'ai', 'ey', 'ay', 'oi'];
const VOWELS = 'aeiouyäöü';

const MIN_BEFORE = 2;
const MIN_AFTER = 3;

interface Token {
  start: number;
  vowel: boolean;
}

function tokenise(lower: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < lower.length) {
    const three = lower.slice(i, i + 3);
    const two = lower.slice(i, i + 2);
    if (CONSONANT_UNITS.includes(three)) {
      tokens.push({ start: i, vowel: false });
      i += 3;
    } else if (CONSONANT_UNITS.includes(two)) {
      tokens.push({ start: i, vowel: false });
      i += 2;
    } else if (VOWEL_UNITS.includes(two)) {
      tokens.push({ start: i, vowel: true });
      i += 2;
    } else {
      tokens.push({ start: i, vowel: VOWELS.includes(lower[i]!) });
      i += 1;
    }
  }
  return tokens;
}

function syllablePoints(letters: string): number[] {
  const tokens = tokenise(letters.toLowerCase());
  const points: number[] = [];
  let lastVowel = -1;
  tokens.forEach((token, index) => {
    if (!token.vowel) return;
    if (lastVowel >= 0 && index - lastVowel > 1) {
      // Zwischen zwei Vokalen: vor dem letzten Konsonanten des Haufens trennen.
      points.push(tokens[index - 1]!.start);
    }
    lastVowel = index;
  });
  return points.filter((p) => p >= MIN_BEFORE && letters.length - p >= MIN_AFTER);
}

/**
 * Die Stellen in `word`, an denen getrennt werden darf: Indizes, vor denen ein
 * Trennstrich stehen kann. Nach einem Bindestrich immer; sonst an Silbengrenzen,
 * wenn das Wort nur aus Buchstaben besteht. Wörter mit Ziffern bleiben ganz.
 */
export function hyphenationPoints(word: string): number[] {
  const points: number[] = [];
  let offset = 0;
  for (const part of word.split('-')) {
    if (/^\p{L}+$/u.test(part)) {
      for (const p of syllablePoints(part)) points.push(offset + p);
    }
    offset += part.length + 1;
    if (offset < word.length) points.push(offset);
  }
  return points.sort((a, b) => a - b);
}
