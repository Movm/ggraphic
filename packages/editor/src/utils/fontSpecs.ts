// SPDX-License-Identifier: AGPL-3.0-only
import { resolveFontFamily } from './fontAliases.js';

/**
 * Die Schnitte, die zusätzlich zum Grundschnitt angefordert werden müssen —
 * je Familie einmal `bold` und einmal `italic`.
 *
 * Der Stil gehört in den Spec-String: `document.fonts.load('60px "Instrument Sans"')`
 * nennt keinen und holt damit nur 400/normal. Kein `bold italic`, siehe
 * `fontStyleForRun`.
 */
export function styledFontSpecs(
  fontFamily: string | readonly string[],
  fontSize: number
): string[] {
  const families = (Array.isArray(fontFamily) ? fontFamily : [fontFamily as string]).map(
    resolveFontFamily
  );
  return families.flatMap((family) => [
    `bold ${fontSize}px ${family}`,
    `italic ${fontSize}px ${family}`,
  ]);
}
