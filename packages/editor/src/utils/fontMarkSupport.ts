// SPDX-License-Identifier: MPL-2.0
import { brandCuts } from '../brand/brandRegistry.js';

import { aliasFontFamily } from './fontAliases.js';
/**
 * Welche Auszeichnung eine Schrift tragen kann — abgeleitet aus den
 * `@font-face`-Regeln in `styles/typography.css`, nicht je Vorlage gepflegt.
 *
 * Grund für die Ableitung: Fett und Kursiv brauchen einen ECHTEN Schnitt.
 * Fehlt er, synthetisiert der Browser einen (schräggestellt bzw. verfettet),
 * der Server-Renderer kennt diese Synthese nicht — Vorschau und Export liefen
 * in Breite und Umbruch auseinander. Eine Liste je Vorlage hätte dieselbe
 * Frage an 24 Stellen beantwortet und wäre beim nächsten Schriftwechsel
 * stillschweigend falsch geworden.
 *
 * Unterstreichung steht NICHT hier: sie ist keine Schriftvariante, sondern
 * wird gezeichnet (Konva `textDecoration`) und gilt deshalb für jede Schrift. Aufzählungen
 * ebenso — sie sind Umbruch, kein Schnitt.
 *
 * `fontFamily` kommt als CSS-Stapel („Instrument Sans, Arial, sans-serif"); gewertet
 * wird die erste Familie, denn die zeichnet, solange sie geladen ist.
 */

export interface FontMarkSupport {
  bold: boolean;
  italic: boolean;
  /**
   * Fett UND kursiv zugleich ist ein echter Schnitt. Fehlt er, gewinnt Kursiv
   * (`runFont`) — Fett wäre sonst nur angekreuzt, aber nicht zu sehen.
   */
  boldItalic: boolean;
}

/**
 * Familien mit echten Schnitten. Alles, was hier fehlt, bekommt weder Fett
 * noch Kursiv angeboten — der sichere Standard, wenn jemand eine Schrift
 * hinzufügt und diese Tabelle vergisst.
 *
 * Ein Schnitt, der als eigene Familie deklariert ist, ist bewusst NICHT der
 * Fettschnitt seiner Grundfamilie: `font-weight: bold` auf der Grundfamilie
 * träfe keinen von ihnen.
 *
 * Ersetzte Familien laufen vorher durch `aliasFontFamily`.
 */
const FACES: Record<string, FontMarkSupport> = {
  'Instrument Sans': { bold: true, italic: true, boldItalic: false },
  Fraunces: { bold: true, italic: true, boldItalic: true },
  'Bricolage Grotesque': { bold: true, italic: false, boldItalic: false },
};

const NONE: FontMarkSupport = { bold: false, italic: false, boldItalic: false };

/**
 * Familien, deren `bold italic` in `typography.css` ein echter Schnitt ist:
 * Fraunces trägt dort Bold Italic als `italic` und Black Italic als
 * `bold italic`. Nur hier gilt „kursiv schlägt fett" nicht — der Browser
 * fettet nichts synthetisch, er lädt den Black-Schnitt. Den braucht die
 * Betonung einiger Markenpakete.
 */
const REAL_BOLD_ITALIC: ReadonlySet<string> = new Set(['Fraunces']);

/**
 * Built in, or declared by a registered brand (`BrandFonts.cuts`). Takes an
 * already aliased family; the one answer `runFont` and the toolbar share.
 */
export function hasRealBoldItalic(family: string): boolean {
  return REAL_BOLD_ITALIC.has(family) || brandCuts(family)?.boldItalic === true;
}

/** Erste Familie aus einem CSS-Stapel, ohne Anführungszeichen. */
export function primaryFontFamily(fontFamily: string): string {
  return aliasFontFamily((fontFamily.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, ''));
}

/** A registered brand's `cuts` win over the built-in table: the host loads that family. */
export function fontMarkSupport(fontFamily: string): FontMarkSupport {
  const family = primaryFontFamily(fontFamily);
  const cuts = brandCuts(family);
  const boldItalic = hasRealBoldItalic(family);
  if (cuts) return { bold: cuts.bold === true, italic: cuts.italic === true, boldItalic };
  return { ...(FACES[family] ?? NONE), boldItalic };
}
