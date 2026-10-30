// SPDX-License-Identifier: MPL-2.0
/**
 * The gate's line count against the renderer's own layout, measured with the real fonts.
 *
 * Reference: Konva's real `Text` for the plain path, `layoutRichTextBlock` with canvas widths
 * for the rich path, each routed as `CanvasText` routes, over fonts loaded into
 * `@napi-rs/canvas` from the @fontsource files the Studio ships. The gate's count must never be
 * below the reference. Canvas and Konva are used only here.
 */
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type KonvaNs from 'konva';
import type * as NapiCanvas from '@napi-rs/canvas';
import { layoutRichTextBlock, type MeasureRun } from '@ggraphic/schema';
import { describe, expect, it } from 'vitest';

import { usesRichText } from '../utils/textRouting.js';
import { konvaFontStyle, runFont } from '../utils/textUtils.js';
import { TEMPLATE_GATE_ADAPTER as adapter } from './templateGeometry.js';

const req = createRequire(import.meta.url);
const { createCanvas, GlobalFonts } = req('@napi-rs/canvas') as typeof NapiCanvas;
const konvaModule = req('konva/lib/index.js') as { default?: unknown };
const Konva = (konvaModule.default ?? konvaModule) as typeof KonvaNs;
// Konva in node needs a canvas factory.
Konva.Util.createCanvasElement = () => {
  const canvas = createCanvas(300, 150) as unknown as HTMLCanvasElement;
  (canvas as unknown as { style: object }).style = {};
  return canvas;
};

const FAMILIES = {
  Raleway: 'raleway',
  Fraunces: 'fraunces',
  'Instrument Sans': 'instrument-sans',
  'Bricolage Grotesque': 'bricolage-grotesque',
  Anton: 'anton',
};
const studio = createRequire(
  join(dirname(fileURLToPath(import.meta.url)), '../../../../apps/studio/package.json')
);
const subsets: Record<string, string[]> = {};
for (const [family, pkg] of Object.entries(FAMILIES)) {
  const dir = join(dirname(studio.resolve(`@fontsource/${pkg}/package.json`)), 'files');
  subsets[family] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.woff2'))) {
    const m = new RegExp(`^${pkg}-([a-z-]+)-(400|500|600|700|800)-(normal|italic)\\.woff2$`).exec(
      file
    );
    if (!m) continue;
    if (!subsets[family]!.includes(m[1]!)) subsets[family]!.push(m[1]!);
    GlobalFonts.registerFromPath(join(dir, file), `${family}__${m[1]}`);
  }
}
const stack = (family: string) => subsets[family]!.map((s) => `"${family}__${s}"`).join(', ');
const ctx = createCanvas(10, 10).getContext('2d');
const realWidth = (text: string, family: string, style: string, size: number) => {
  ctx.font = `${style} ${size}px ${stack(family)}`;
  return ctx.measureText(text).width;
};

interface Sample {
  text: string;
  family: string;
  fontStyle: string;
  fontWeight?: number;
  size: number;
  width: number;
  letterSpacing: number;
}

/** What the canvas draws: Konva's `Text` or the rich layout, routed as `CanvasText` routes. */
function referenceLines(s: Sample): number {
  const measure: MeasureRun = (text, style) => {
    const run = runFont(s.family, s.fontStyle, style, null, s.fontWeight);
    return realWidth(text, run.fontFamily, run.fontStyle, s.size);
  };
  if (usesRichText({ text: s.text, width: s.width }, measure)) {
    return layoutRichTextBlock(s.text, s.width, measure).length;
  }
  const node = new Konva.Text({
    text: s.text,
    fontFamily: stack(s.family),
    fontStyle: konvaFontStyle(s.fontStyle, s.fontWeight),
    fontSize: s.size,
    width: s.width,
    letterSpacing: s.letterSpacing,
    wrap: 'word',
  });
  return node.textArr.length;
}

const gateLines = (s: Sample): number =>
  adapter.lineCount('additionalTexts', {
    text: s.text,
    fontFamily: s.family,
    fontStyle: s.fontStyle,
    ...(s.fontWeight === undefined ? {} : { fontWeight: s.fontWeight }),
    fontSize: s.size,
    width: s.width,
    letterSpacing: s.letterSpacing,
  });

const sample = (text: string, over: Partial<Sample> = {}): Sample => ({
  text,
  family: 'Raleway',
  fontStyle: 'bold',
  size: 60,
  width: 500,
  letterSpacing: 0,
  ...over,
});

describe('gate line count against the renderer layout (real fonts)', () => {
  it.each([
    ['wide capitals', sample('WWWWW '.repeat(6).trim(), { size: 100, width: 900 })],
    ['wide lowercase', sample('mmmmm '.repeat(6).trim(), { size: 100, width: 900 })],
    [
      'overlong words (hyphenated)',
      sample('Gemeinschaftsgartenverein Klimaschutzprogramm Bundesverfassungsgericht', {
        width: 400,
      }),
    ],
    ['one long compound', sample('Donaudampfschifffahrtsgesellschaftskapitän', { width: 300 })],
    ['a url', sample('https://www.example.org/very/long/path?with=query&and=more')],
    [
      'a dashed list',
      sample(
        '- Erster Punkt mit ziemlich langem Text der umbricht\n- Zweiter Punkt der ebenfalls lang ist und umbricht\n- Dritter',
        { width: 600 }
      ),
    ],
    [
      'an ordered list',
      sample(
        '1. Eins zwei drei vier fünf sechs sieben acht\n2. neun zehn elf zwölf dreizehn vierzehn\n10. fünfzehn sechzehn siebzehn achtzehn'
      ),
    ],
    [
      'a negative letter spacing on a list',
      sample(
        '1. Eins zwei drei vier fünf sechs sieben acht\n2. neun zehn elf zwölf dreizehn vierzehn',
        { letterSpacing: -6 }
      ),
    ],
    [
      'bold marks',
      sample('**FETT FETT FETT FETT FETT FETT FETT FETT FETT FETT FETT FETT**', {
        width: 900,
        letterSpacing: -6,
      }),
    ],
    [
      'accent marks',
      sample('==Akzent Akzent Akzent Akzent Akzent Akzent Akzent==', {
        width: 700,
        letterSpacing: -6,
      }),
    ],
    [
      'marker marks',
      sample('++Marker++ ++Marker++ ++Marker++ ++Marker++ ++Marker++', { width: 700 }),
    ],
    ['leading spaces', sample('          X', { width: 200, letterSpacing: 8 })],
    ['inner spaces', sample('A          B', { width: 200 })],
  ])('is not below the reference: %s', (_name, s) => {
    for (const family of Object.keys(FAMILIES)) {
      for (const fontStyle of ['normal', 'bold', 'italic', 'bold italic']) {
        for (const letterSpacing of [0, 8, -6]) {
          const v = { ...s, family, fontStyle, letterSpacing: s.letterSpacing || letterSpacing };
          expect(gateLines(v), JSON.stringify(v)).toBeGreaterThanOrEqual(referenceLines(v));
        }
      }
    }
  });

  it.each([100, 300, 400, 500, 600, 700, 800, 900])(
    'is not below the reference at fontWeight %d (Bricolage Grotesque, Anton)',
    (fontWeight) => {
      for (const family of ['Bricolage Grotesque', 'Anton']) {
        for (const text of [
          'WWWWW '.repeat(6).trim(),
          'Gemeinschaftsgartenverein Klimaschutzprogramm Bundesverfassungsgericht',
          'Kein Platz für Hass und Hetze in unserer Stadt',
        ]) {
          const v = { ...sample(text, { size: 80, width: 600 }), family, fontWeight };
          expect(gateLines(v), JSON.stringify(v)).toBeGreaterThanOrEqual(referenceLines(v));
        }
      }
    }
  );

  it('is not below the reference on 3000 seeded random texts', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const alphabet =
      'abcdefghijklmnopqrstuvwxyzäöüßABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜWWWmm@—-.,:!?0123456789';
    const families = Object.keys(FAMILIES);
    const styles = ['normal', 'bold', 'italic', 'bold italic'];
    const under: string[] = [];
    for (let i = 0; i < 3000; i++) {
      const words = Array.from({ length: 1 + Math.floor(rnd() * 12) }, () =>
        Array.from(
          { length: 1 + Math.floor(rnd() * 14) },
          () => alphabet[Math.floor(rnd() * alphabet.length)]
        ).join('')
      );
      let text = words.join(rnd() < 0.15 ? '  ' : ' ');
      const kind = rnd();
      if (kind < 0.1) text = `- ${text}\n- ${words.slice(0, 3).join(' ')}`;
      else if (kind < 0.2) text = `**${text}**`;
      else if (kind < 0.25) text = ` ${text}`;
      const s: Sample = {
        text,
        family: families[Math.floor(rnd() * families.length)]!,
        fontStyle: styles[Math.floor(rnd() * 4)]!,
        letterSpacing: [0, 0, 3, -3][Math.floor(rnd() * 4)]!,
        width: 80 + Math.floor(rnd() * 900),
        size: 40 + Math.floor(rnd() * 60),
      };
      const real = referenceLines(s);
      const gate = gateLines(s);
      if (gate < real) under.push(`${gate} < ${real}: ${JSON.stringify(s).slice(0, 160)}`);
    }
    expect(under.slice(0, 5)).toEqual([]);
    // 3000 real Konva layouts take about 5 s on a CI runner: past the 5 s default, so its own budget.
  }, 60_000);
});
