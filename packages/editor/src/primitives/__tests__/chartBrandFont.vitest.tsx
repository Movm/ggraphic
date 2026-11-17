// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The chart SVG is drawn as an image, and an SVG image cannot load web fonts, so its labels came
 * out in the system sans. The chart now carries the brand body font as a data-URL `@font-face`
 * in a `<style>` of its own, so the canvas and an exported SVG draw the same face.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { brandDefault, type BrandFontFace } from '@ggraphic/core';
import { render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DocumentBrandContext } from '../../brand/documentBrand.js';
import { CanvasEditorProvider } from '../../CanvasEditorProvider.js';
import { inlineSvg } from '../../export/svg/inlineSvg.js';
import { type FontFile } from '../../export/fonts/fontFiles.js';
import { createChartInstance } from '../../utils/chartUtils.js';
import { chartFontCss, cssString, fontFaceCss } from '../chartFont.js';
import { CanvasStage } from '../CanvasStage.js';
import { ChartPrimitive, renderChartImage } from '../ChartPrimitive.js';

const fontsourceDir = path.dirname(
  createRequire(import.meta.url).resolve('@fontsource/instrument-sans/package.json')
);
const fontsourceFile = (name: string, ext: 'woff' | 'woff2' = 'woff2') =>
  new Uint8Array(readFileSync(path.join(fontsourceDir, 'files', `${name}.${ext}`)));

const REGULAR = fontsourceFile('instrument-sans-latin-400-normal');
const BOLD = fontsourceFile('instrument-sans-latin-700-normal');
const LATIN_EXT = fontsourceFile('instrument-sans-latin-ext-400-normal');

const face = (family: string, weight: number, src: string): BrandFontFace => ({
  family,
  src,
  weight,
});
const bytesByUrl = (files: Record<string, Uint8Array>) => async (url: string) => files[url] ?? null;

const chart = createChartInstance('bar', 480, 320);

/** What `renderChartImage` hands the browser: the `src` of the image it builds. */
let sources: string[] = [];
const RealImage = window.Image;
class CapturingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(value: string) {
    sources.push(value);
    queueMicrotask(() => this.onload?.());
  }
}
const svgText = () => {
  const src = sources.at(-1)!;
  return decodeURIComponent(src.slice(src.indexOf(',') + 1));
};
const svgRoot = () => new DOMParser().parseFromString(svgText(), 'image/svg+xml').documentElement;

beforeAll(() => {
  // The chart is rendered by a root of its own, outside `act`.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  return () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  window.Image = RealImage;
  sources = [];
});
const capture = () => {
  sources = [];
  window.Image = CapturingImage as unknown as typeof Image;
};

describe('chart svg: brand body font', () => {
  it('embeds the brand body font', async () => {
    const family = 'Chart Brand Sans';
    const css = await chartFontCss(family, {
      brandFaces: [face(family, 400, 'r'), face(family, 700, 'b')],
      fetchBytes: bytesByUrl({ r: REGULAR, b: BOLD }),
    });
    capture();
    await renderChartImage(chart, { family, css });

    const svg = svgText();
    expect(svg).toContain('<style');
    expect(svg).toContain('@font-face');
    expect(svg).toContain(`font-family:"${family}"`);
    expect(svg).toContain('src:url(data:font/woff2;base64,');
    expect(svgRoot().getAttribute('font-family')).toMatch(/^"Chart Brand Sans", sans-serif$/);
  });

  it('declares the regular and the bold cut with their own weights and bytes', async () => {
    const family = 'Chart Two Cuts';
    const css = await chartFontCss(family, {
      brandFaces: [face(family, 400, 'r'), face(family, 700, 'b')],
      fetchBytes: bytesByUrl({ r: REGULAR, b: BOLD }),
    });
    const rules = css!.split('@font-face').slice(1);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toContain('font-weight:400');
    expect(rules[1]).toContain('font-weight:700');
    expect(rules[0]).not.toEqual(rules[1]);
  });

  it('keeps today’s sans-serif when no file resolves', async () => {
    const family = 'Chart Missing Sans';
    const css = await chartFontCss(family, { fetchBytes: async () => null });
    expect(css).toBeNull();
    capture();
    await renderChartImage(chart, { family, css });
    expect(svgText()).not.toContain('<style');
    expect(svgRoot().getAttribute('font-family')).toBe('sans-serif');
  });

  it('survives the export’s inlining with the font and the family in place', async () => {
    const family = 'Chart Inlined Sans';
    const css = await chartFontCss(family, {
      brandFaces: [face(family, 400, 'r')],
      fetchBytes: bytesByUrl({ r: REGULAR }),
    });
    capture();
    await renderChartImage(chart, { family, css });
    const inlined = inlineSvg(svgText(), 'chart1');
    expect(inlined).not.toBeNull();
    expect(inlined!.inner).toContain('@font-face');
    expect(inlined!.inner).toContain('data:font/woff2;base64,');
    expect(inlined!.attrs['font-family']).toBe(`"${family}", sans-serif`);
  });
});

describe('ChartPrimitive: the font it draws in', () => {
  it('is the body font of the document brand, found through the host font service', async () => {
    const family = 'Chart Wired Sans';
    const brand = { ...brandDefault, fonts: { ...brandDefault.fonts, body: family } };
    const load = vi.fn(async () => REGULAR);
    Konva.autoDrawEnabled = false;
    // The fake image cannot be drawn on Konva's node canvas; only the SVG it is given is under test.
    vi.spyOn(Konva.Image.prototype, 'drawScene').mockImplementation(function (this: Konva.Image) {
      return this;
    });
    capture();
    const noop = () => {};
    render(
      <DocumentBrandContext.Provider value={brand}>
        <CanvasEditorProvider services={{ exportFonts: { load } }}>
          <CanvasStage ref={createRef()} width={600} height={600} responsive={false}>
            <ChartPrimitive
              chart={createChartInstance('bar', 480, 320)}
              isSelected={false}
              onSelect={noop}
              onDragEnd={noop}
              onTransformEnd={noop}
            />
          </CanvasStage>
        </CanvasEditorProvider>
      </DocumentBrandContext.Provider>
    );
    await waitFor(() => expect(sources.length).toBeGreaterThan(0), { timeout: 4000 });
    expect(svgText()).toContain(`font-family:"${family}"`);
    expect(load).toHaveBeenCalledWith({ family, weight: 400, style: 'normal' });
  });
});

describe('chartFontCss', () => {
  it('writes one rule per unicode-range file and one for the bold weight that falls back to it', async () => {
    const family = 'Chart Split Sans';
    const rule = (src: string, range: string) => ({
      style: {
        getPropertyValue: (name: string) =>
          ({
            'font-family': `"${family}"`,
            'font-weight': '400',
            src: `url(${src}) format("woff2")`,
            'unicode-range': range,
          })[name] ?? '',
      },
    });
    const css = await chartFontCss(family, {
      cssRules: () => [rule('latin', 'U+0000-00FF, U+0131'), rule('ext', 'U+0100-02BA')],
      fetchBytes: bytesByUrl({ latin: REGULAR, ext: LATIN_EXT }),
    });
    // Weight 700 resolves to the same two files; they are written once.
    const rules = css!.split('@font-face').slice(1);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toContain('unicode-range:U+0-FF,U+131');
    expect(rules[1]).toContain('unicode-range:U+100-2BA');
  });

  it('names the format by what the bytes are', async () => {
    const family = 'Chart Woff Sans';
    const css = await chartFontCss(family, {
      brandFaces: [face(family, 400, 'r')],
      fetchBytes: bytesByUrl({ r: fontsourceFile('instrument-sans-latin-400-normal', 'woff') }),
    });
    expect(css).toContain('src:url(data:font/woff;base64,');
    expect(css).toContain("format('woff')");
  });

  it('builds the font once per family, and tries again after a miss', async () => {
    const family = 'Chart Cached Sans';
    const fetchBytes = vi.fn(bytesByUrl({ r: REGULAR }));
    const deps = { brandFaces: [face(family, 400, 'r')], fetchBytes };
    const first = await chartFontCss(family, deps);
    const calls = fetchBytes.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    expect(await chartFontCss(family, deps)).toBe(first);
    expect(fetchBytes).toHaveBeenCalledTimes(calls);

    const late = 'Chart Late Sans';
    const lateDeps = { brandFaces: [face(late, 400, 'r')] };
    expect(await chartFontCss(late, { ...lateDeps, fetchBytes: async () => null })).toBeNull();
    expect(
      await chartFontCss(late, { ...lateDeps, fetchBytes: bytesByUrl({ r: REGULAR }) })
    ).toContain('@font-face');
  });
});

/** A font file with just what `fontFaceCss` reads. */
const file = (
  header: number[],
  extra: Partial<Pick<FontFile, 'embeddable' | 'ranges'>> & { wght?: [number, number] } = {}
): FontFile =>
  ({
    bytes: new Uint8Array([...header, 1, 2, 3]),
    font: extra.wght ? { variationAxes: { wght: { min: extra.wght[0], max: extra.wght[1] } } } : {},
    embeddable: extra.embeddable ?? 'yes',
    ranges: extra.ranges ?? null,
  }) as unknown as FontFile;
const TTF = [0, 1, 0, 0];
const OTF = [0x4f, 0x54, 0x54, 0x4f];

describe('fontFaceCss', () => {
  it('names TrueType and OpenType files by their header', () => {
    const css = fontFaceCss('F', [
      { weight: 400, file: file(TTF) },
      { weight: 700, file: file(OTF) },
    ]);
    expect(css).toContain("src:url(data:font/ttf;base64,AAEAAAECAw==) format('truetype')");
    expect(css).toContain("src:url(data:font/otf;base64,T1RUTwECAw==) format('opentype')");
  });

  it('declares a variable font once, for the range of its weight axis', () => {
    const variable = file(TTF, { wght: [100, 900] });
    const css = fontFaceCss('F', [
      { weight: 400, file: variable },
      { weight: 700, file: variable },
    ]);
    expect(css!.match(/@font-face/g)).toHaveLength(1);
    expect(css).toContain('font-weight:100 900');
  });

  it('leaves out a font whose licence keeps it out of the file', () => {
    expect(
      fontFaceCss('F', [{ weight: 400, file: file(TTF, { embeddable: 'outlines-only' }) }])
    ).toBeNull();
    expect(
      fontFaceCss('F', [{ weight: 400, file: file(TTF, { embeddable: 'bitmap-only' }) }])
    ).toBeNull();
  });

  it('leaves out a file it cannot name', () => {
    expect(fontFaceCss('F', [{ weight: 400, file: file([9, 9, 9, 9]) }])).toBeNull();
  });

  it('quotes and escapes the family so it cannot leave the string', () => {
    const family = 'Evil"}; @import url(https://x.example/a.css); \\ \n';
    const css = fontFaceCss(family, [{ weight: 400, file: file(TTF) }])!;
    expect(css).toContain(`font-family:${cssString(family)}`);
    expect(cssString(family)).toBe('"Evil\\"}; @import url(https://x.example/a.css); \\\\ \\a "');
    // Past the closing quote of the family comes the next declaration, not the payload.
    expect(css).toMatch(/^@font-face\{font-family:"(?:[^"\\]|\\.)*";font-style:normal;/);
  });
});
