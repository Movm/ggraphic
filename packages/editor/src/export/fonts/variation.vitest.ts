// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { loadFontkit, type FontkitFont } from './glyphs.js';
import { variationInstance } from './variation.js';

/** A fontkit font with the members `variationInstance` reads; `getVariation` is a spy. */
function fakeVariable(over: Record<string, unknown> = {}) {
  const instance = { tag: 'instance', characterSet: [] } as unknown as FontkitFont;
  const getVariation = vi.fn((_settings: Record<string, number>) => instance);
  const font = {
    unitsPerEm: 1000,
    variationAxes: {
      wdth: { name: 'Width', min: 75, default: 100, max: 125 },
      wght: { name: 'Weight', min: 200, default: 400, max: 800 },
    },
    directory: { tables: { glyf: {} } },
    getVariation,
    ...over,
  } as unknown as FontkitFont;
  return { font, instance, getVariation };
}

describe('variationInstance', () => {
  it('leaves a font without a weight axis as it is', () => {
    const font = { variationAxes: {} } as unknown as FontkitFont;
    expect(variationInstance(font, 700)).toEqual({ font, variation: 'none' });
    const plain = {} as unknown as FontkitFont;
    expect(variationInstance(plain, 700)).toEqual({ font: plain, variation: 'none' });
  });

  it('leaves the default instance as it is', () => {
    const { font, getVariation } = fakeVariable();
    expect(variationInstance(font, 400)).toEqual({ font, variation: 'none' });
    expect(getVariation).not.toHaveBeenCalled();
  });

  it('takes the instance for the weight, every other axis at its default', () => {
    const { font, instance, getVariation } = fakeVariable();
    expect(variationInstance(font, 700)).toEqual({ font: instance, variation: 'instance' });
    expect(getVariation).toHaveBeenCalledWith({ wght: 700, wdth: 100 });
  });

  it('clamps the weight to the axis', () => {
    const { font, getVariation } = fakeVariable();
    variationInstance(font, 900);
    variationInstance(font, 100);
    expect(getVariation.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      { wght: 800, wdth: 100 },
      { wght: 200, wdth: 100 },
    ]);
  });

  it('builds one instance per font and weight', () => {
    const { font, getVariation } = fakeVariable();
    const a = variationInstance(font, 700);
    const b = variationInstance(font, 700);
    variationInstance(font, 600);
    expect(b.font).toBe(a.font);
    expect(getVariation).toHaveBeenCalledTimes(2);
  });

  it('says so when the instance cannot be made, and keeps the font', () => {
    const { font } = fakeVariable({
      getVariation: () => {
        throw new Error('Variations require a font with the fvar, gvar and glyf, or CFF2 tables.');
      },
    });
    expect(variationInstance(font, 700)).toEqual({ font, variation: 'default-only' });
  });

  it('does not instance a CFF2 font: its outlines are cubic, which the PDF subset cannot write', () => {
    const { font, getVariation } = fakeVariable({ directory: { tables: { CFF2: {} } } });
    expect(variationInstance(font, 700).variation).toBe('default-only');
    expect(getVariation).not.toHaveBeenCalled();
  });
});

// A real variable WOFF2 (wght 200..800, default 800); a missing package fails the run.
const bricolage = new Uint8Array(
  readFileSync(
    path.join(
      path.dirname(
        createRequire(import.meta.url).resolve(
          '@fontsource-variable/bricolage-grotesque/package.json'
        )
      ),
      'files',
      'bricolage-grotesque-latin-wght-normal.woff2'
    )
  )
);

describe('a variable WOFF2 face', () => {
  const open = async () => (await loadFontkit()).create(bricolage) as unknown as FontkitFont;

  it('is an instance at its default weight only; any other weight stays default-only', async () => {
    const font = await open();
    expect(Object.keys(font.variationAxes ?? {})).toEqual(['wght']);
    expect(variationInstance(font, 800)).toEqual({ font, variation: 'none' });
    expect(variationInstance(font, 400)).toEqual({ font, variation: 'default-only' });
  });
});
