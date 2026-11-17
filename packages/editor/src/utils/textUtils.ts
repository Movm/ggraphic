// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Shared text utilities for canvas editor
 *
 * Umbruch, Aufzählungsmarker, hängender Einzug und Inline-Auszeichnung liegen
 * in `@ggraphic/schema` (`text/listLayout.ts`, `text/inlineMarks.ts`) —
 * DOM-frei, damit die Vorschau hier und der Server-Renderer an derselben
 * Stelle umbrechen. Hier bleibt nur, was ein Canvas braucht: die Messung.
 */
import { type TextAccent, type TextMarker } from '@ggraphic/core';
import { layoutRichTextBlock, wrapLines, type MeasureRun, type RunStyle } from '@ggraphic/schema';

import { registeredBrands } from '../brand/brandRegistry.js';
import { notifyFontLoaded } from './fontGeneration.js';

import { aliasFontFamily, resolveFontFamily } from './fontAliases.js';
import { hasRealBoldItalic, primaryFontFamily } from './fontMarkSupport.js';

export { type TextAccent, type TextMarker } from '@ggraphic/core';

// The bundler replaces `process.env.NODE_ENV`; outside one, `process` may not exist.
declare const process: { env: Record<string, string | undefined> };

/**
 * Simple text wrapping using character width estimation
 * @deprecated Use wrapTextAccurate() for accurate font-aware wrapping
 */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  charWidthRatio = 0.5
): string[] {
  return wrapLines(text, maxWidth, (value) => value.length * fontSize * charWidthRatio);
}

let measureContext: CanvasRenderingContext2D | null = null;
let measureContextResolved = false;

// One shared context: word-wrap loops measure per word candidate, and a fresh
// <canvas> + 2D context per call made each keystroke allocate hundreds of them.
// Ohne DOM (Tests, SSR) gibt es kein Canvas zum Messen — dann auf die
// Schätzung zurückfallen statt zu werfen.
function getMeasureContext(): CanvasRenderingContext2D | null {
  if (!measureContextResolved) {
    measureContextResolved = true;
    measureContext =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  return measureContext;
}

const checkedFaces = new Set<string>();
const seenRawFaces = new Set<string>();

// Safari stößt über ein Canvas allein kein Laden an: eine Schrift, die noch
// kein DOM-Text braucht, träfe nie ein und `loadingdone` (→ `useFontGeneration`)
// bliebe aus — der mit der Ersatzschrift gemessene Umbruch stünde dann fest.
// Je Familie+Schnitt einmal geprüft (die Messung läuft pro Wort); ein
// fehlgeschlagenes Laden wird bewusst nicht wiederholt, sonst hämmerte jede
// Messung auf eine kaputte URL.
function requestFace(fontSize: number, fontFamily: string, style: string, text: string): void {
  if (typeof document === 'undefined' || !document.fonts) return;
  const rawKey = `${fontFamily}:${style}`;
  if (seenRawFaces.has(rawKey)) return;
  seenRawFaces.add(rawKey);
  const family = primaryFontFamily(fontFamily);
  const key = `${family}:${style}`;
  if (checkedFaces.has(key)) return;
  checkedFaces.add(key);
  try {
    const spec = `${style} ${fontSize}px "${family}"`;
    if (document.fonts.check(spec, text)) return;
    void document.fonts
      .load(spec, text)
      .then((faces) => {
        if (faces.length > 0) notifyFontLoaded();
      })
      .catch(() => undefined);
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn(
        `[textUtils] Font "${family}" (${style}) not loaded, measurements may use fallback. This warning appears once per font.`
      );
    }
  } catch {
    // Eine Messung darf nie an der Schriftanfrage scheitern.
  }
}

/**
 * Asks the browser to load a family's face now, before anything draws with it: what a person
 * picks from a list (the font role picker) would otherwise show in the fallback font until a
 * first measurement happens to ask. A family is asked for once per style; a repaint follows
 * when the face arrives (`useFontGeneration`).
 */
export function requestFontFace(fontFamily: string, fontStyle: string = 'normal'): void {
  requestFace(16, fontFamily, fontStyle, 'Aa');
}

/**
 * Measure actual text width using Canvas 2D context
 * Uses browser's font rendering engine for accurate measurements
 *
 * @param text - The text to measure
 * @param fontSize - Font size in pixels
 * @param fontFamily - Font family name (e.g., 'Raleway', 'Instrument Sans')
 * @param fontStyle - CSS font style (e.g., 'normal', 'bold', 'italic', 'bold italic')
 */
export function measureTextWidthWithFont(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontStyle: string = 'normal'
): number {
  const ctx = getMeasureContext();
  if (!ctx) {
    // Fallback to estimation if canvas unavailable
    return text.length * fontSize * 0.5;
  }

  // Build CSS font string (e.g., "bold italic 90px Raleway, Arial, sans-serif")
  const resolved = resolveFontFamily(fontFamily);
  ctx.font = `${fontStyle} ${fontSize}px ${resolved}, Arial, sans-serif`;
  requestFace(fontSize, resolved, fontStyle, text);

  return ctx.measureText(text).width;
}

/**
 * Konva-`fontStyle` für einen Lauf: Blockstil plus die Marks des Laufs.
 * Konva kennt genau die vier Werte `normal`, `bold`, `italic`, `bold italic`.
 *
 * **Kursiv schlägt fett.** Keine unserer Schriften hat einen Fett-Kursiv-
 * Schnitt, und die beiden Seiten lösen `bold italic` gegensätzlich auf:
 * der Browser nimmt den Kursivschnitt und fettet ihn synthetisch (gemessen:
 * `bold italic` ist exakt so breit wie `italic`), `@napi-rs/canvas` nimmt den
 * Fettschnitt und neigt ihn. Dieselbe Zeile wäre damit ~5 % verschieden breit
 * und bräche in Vorschau und Export an anderer Stelle um — genau das, was der
 * geteilte Umbruch verhindern soll. Also fragen beide Seiten nur `italic` an;
 * ein kursives Wort in einem fetten Block ist dann nicht fett, aber überall
 * gleich. Ausnahme Fraunces, das einen echten Fett-Kursiv-Schnitt hat: siehe
 * `runFont`.
 */
export function fontStyleForRun(
  baseStyle: string,
  style: RunStyle
): 'normal' | 'bold' | 'italic' | 'bold italic' {
  if (style.italic || baseStyle.includes('italic')) return 'italic';
  return style.bold || baseStyle.includes('bold') ? 'bold' : 'normal';
}

/**
 * The string handed to Konva (and the canvas `font` shorthand) for a text: `fontStyle` plus an
 * optional numeric `fontWeight`. A `fontWeight` wins over the bold part of `fontStyle`; italic
 * stays from `fontStyle`. Without a weight it is `fontStyle` as it was (`'normal'` when absent).
 */
export function konvaFontStyle(
  fontStyle: string | null | undefined,
  fontWeight: number | null | undefined
): string {
  if (fontWeight === undefined || fontWeight === null) return fontStyle || 'normal';
  return fontStyle?.includes('italic') ? `italic ${fontWeight}` : String(fontWeight);
}

/** The plate a text draws: the flat `markerFill`/`markerColor` over the nested `marker`. */
export function effectiveMarker(text: {
  marker?: TextMarker | null;
  markerFill?: string | null;
  markerColor?: string | null;
}): TextMarker | undefined {
  const { marker, markerFill, markerColor } = text;
  if (!markerFill && !markerColor) return marker ?? undefined;
  return {
    padX: 0.18,
    padY: 0.04,
    ...marker,
    fill: markerFill ?? marker?.fill ?? '#FFFFFF',
    color: markerColor ?? marker?.color ?? '#000000',
  };
}

/** The accent a text draws: the flat `accentFill` over the nested `accent`. */
export function effectiveAccent(text: {
  accent?: TextAccent | null;
  accentFill?: string | null;
}): TextAccent | undefined {
  const { accent, accentFill } = text;
  if (!accentFill) return accent ?? undefined;
  return { ...accent, fill: accentFill };
}

/**
 * The family that carries the bold cut of `family`, when a registered brand
 * declares it as a family of its own (`BrandFonts.boldFamilies`):
 * `font-weight: bold` on the regular family would hit no face and be faked.
 */
function boldFamilyOf(family: string): string | null {
  for (const brand of registeredBrands()) {
    const bold = brand.fonts.boldFamilies?.[family];
    if (bold) return bold;
  }
  return null;
}

/** Schrift und Schnitt eines Laufs — Messung und Zeichnung fragen beide hier. */
export function runFont(
  fontFamily: string,
  baseStyle: string,
  style: RunStyle,
  accent: TextAccent | null | undefined,
  fontWeight?: number | null
): { fontFamily: string; fontStyle: string } {
  // Eine eigene Passagenfarbe färbt nur: die Akzentschrift der Vorlage gehört
  // zur Vorlagenfarbe. Sonst verschöbe ein eingefärbter Buchstabe den Umbruch.
  const asAccent = !!style.accent && !!accent && !style.accentColor;
  const family = aliasFontFamily(asAccent ? (accent?.fontFamily ?? fontFamily) : fontFamily);
  const requested = asAccent ? (accent?.fontStyle ?? baseStyle) : baseStyle;
  const bold = !!style.bold || requested.includes('bold');
  const italic = !!style.italic || requested.includes('italic');
  if (fontWeight !== undefined && fontWeight !== null) {
    // A numeric weight replaces the bold part of the style; a bold mark or accent never lightens it.
    const weight =
      style.bold || (asAccent && requested.includes('bold'))
        ? Math.max(fontWeight, 700)
        : fontWeight;
    const weightBoldFamily = weight >= 600 && !italic ? boldFamilyOf(family) : null;
    if (weightBoldFamily) return { fontFamily: weightBoldFamily, fontStyle: 'normal' };
    return { fontFamily: family, fontStyle: konvaFontStyle(italic ? 'italic' : 'normal', weight) };
  }
  if (bold && italic && hasRealBoldItalic(family)) {
    return { fontFamily: family, fontStyle: 'bold italic' };
  }
  const boldFamily = boldFamilyOf(family);
  if (bold && !italic && boldFamily) return { fontFamily: boldFamily, fontStyle: 'normal' };
  // Every other run: italic wins, so the browser and the server renderer pick
  // the same face (see `fontStyleForRun`).
  return { fontFamily: family, fontStyle: fontStyleForRun(requested, style) };
}

/**
 * Bindet eine konkrete Schrift an eine Messfunktion für `listLayout` — je
 * Lauf mit dessen Stil, denn ein fettes Wort ist breiter, und der Umbruch
 * muss das wissen. Vier mögliche Stile, darum ein kleiner Cache je
 * Kombination statt eines Canvas je Messung.
 *
 * `fontGeneration` ist der Stand von `document.fonts`, gegen den gemessen
 * wird (`useFontGeneration`). Er steht im Cache-Schlüssel, damit er ein
 * echter Eingang der Messung ist — nur so bleibt er im Memo des Aufrufers
 * eine Abhängigkeit, die der React-Compiler nicht wegkürzt.
 */
export function runMeasurer(
  fontSize: number,
  fontFamily: string,
  fontStyle: string = 'normal',
  fontGeneration = 0,
  accent: TextAccent | null = null,
  fontWeight: number | null = null,
  letterSpacing: number | null = null
): MeasureRun {
  const cache = new Map<string, number>();
  const measured: MeasureWidth = (text, size, family, style) => {
    const key = `${fontGeneration}:${family}:${style}:${text}`;
    let width = cache.get(key);
    if (width === undefined) {
      width = measureTextWidthWithFont(text, size, family, style);
      cache.set(key, width);
    }
    return width;
  };
  return createRunMeasurer(
    measured,
    fontSize,
    fontFamily,
    fontStyle,
    accent,
    fontWeight,
    letterSpacing
  );
}

/** Measures `text` in px under one concrete family and style (canvas in the browser). */
export type MeasureWidth = (
  text: string,
  fontSize: number,
  fontFamily: string,
  fontStyle: string
) => number;

/**
 * `runMeasurer` with the glyph measure injected: the same run-font choice (`runFont`) as the
 * renderer, a different source of widths. The render gate passes a table-backed one, so it
 * lays text out with the renderer's own code and never needs a canvas.
 */
export function createRunMeasurer(
  measureWidth: MeasureWidth,
  fontSize: number,
  fontFamily: string,
  fontStyle: string = 'normal',
  accent: TextAccent | null = null,
  fontWeight: number | null = null,
  letterSpacing: number | null = null
): MeasureRun {
  // Konva adds `letterSpacing` px after every code point, the last one included.
  const spacing = (letterSpacing ?? 0) * fontSize;
  return (text, style) => {
    const run = runFont(fontFamily, fontStyle, style, accent, fontWeight);
    const width = measureWidth(text, fontSize, run.fontFamily, run.fontStyle);
    return spacing === 0 ? width : width + spacing * [...text].length;
  };
}

/**
 * Wrap text using accurate font measurement
 * This produces line breaks that match actual Konva text rendering
 *
 * Bricht auch an `\n`, rechnet den Einzug einer Aufzählung und die Breite
 * fetter Läufe mit — die Zeilenzahl ist genau das, was die Auto-Fit-Schleifen
 * der Vorlagen auswerten. Die Marker stehen in den gelieferten Zeilen wieder
 * vorn, Auszeichnungsmarker sind entfernt, damit Aufrufer, die die Strings
 * zeichnen statt sie zu zählen, sich nicht ändern müssen.
 */
export function wrapTextAccurate(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontFamily: string,
  fontStyle: string = 'normal',
  fontWeight: number | null = null,
  letterSpacing: number | null = null
): string[] {
  const measure = runMeasurer(fontSize, fontFamily, fontStyle, 0, null, fontWeight, letterSpacing);
  return layoutRichTextBlock(text, maxWidth, measure).map((line) => {
    const body = line.runs.map((run) => run.text).join('');
    return line.marker ? `${line.marker} ${body}` : body;
  });
}
