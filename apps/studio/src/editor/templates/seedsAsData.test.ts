// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The three starter designs now ship as template files (`@ggraphic/templates-open`). Placed on the
 * Studio brand they must give the page the old code seeds gave (`__golden__/code-seeds.json`, written
 * from `seedPageState` before the change), within 1 px, apart from the `templateRef` and `groups`
 * that placing adds and the intended differences listed in `NARROWED`.
 */
import { deriveSchemes, type SchemeId } from '@ggraphic/core';
import { instantiateTemplatePage } from '@ggraphic/core';
import { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { TEMPLATE_GEOMETRY } from '@ggraphic/editor/templates/templateGeometry';
import { readTemplateFile } from '@ggraphic/schema';
import { OPEN_TEMPLATES } from '@ggraphic/templates-open';
import { afterEach, describe, expect, it } from 'vitest';

import { studioBrand } from '../../brand';
import { logoSizeOf, rememberLogoSize } from '../../logoSize';
import { fontFallbackFor } from './typography';

import golden from './__golden__/code-seeds.json';

type Obj = Record<string, unknown>;

const SEED_SCHEME: Record<string, SchemeId> = {
  'studio-headline': 'primary',
  'studio-quote': 'light',
  'studio-number': 'secondary',
};
const IDS = Object.keys(SEED_SCHEME);

/**
 * The intended differences from the code seeds: text boxes narrowed to 45 % of the safe frame
 * so that they clear a logo box of up to 40 % of the canvas width (render gate, layout extremes).
 */
const NARROWED: Record<string, readonly string[]> = {
  'studio-headline': ['body', 'cta'],
  'studio-quote': ['subline'],
  'studio-number': ['subline'],
};
const NARROWED_TO = 0.45;

const LOGO = '/test-logo.png';
const brands = {
  plain: studioBrand,
  logo: { ...studioBrand, logo: { src: LOGO, label: 'Test' } },
} as const;

afterEach(() => registerBrandPacks([studioBrand]));

function templateFile(id: string) {
  for (const raw of OPEN_TEMPLATES) {
    const read = readTemplateFile(raw);
    if (read.status === 'ok' && read.template.id === id) return read;
  }
  throw new Error(`no template ${id}`);
}

const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Equal when every number is within 1 px of its partner and everything else is identical. */
function closeTo(actual: unknown, expected: unknown, path: string): string[] {
  if (typeof actual === 'number' && typeof expected === 'number')
    return Math.abs(actual - expected) <= 1 ? [] : [`${path}: ${actual} vs ${expected}`];
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length)
      return [`${path}: length ${actual.length} vs ${expected.length}`];
    return actual.flatMap((a, i) => closeTo(a, expected[i], `${path}[${i}]`));
  }
  if (isObj(actual) && isObj(expected)) {
    const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
    return [...keys].flatMap((k) => closeTo(actual[k], expected[k], `${path}.${k}`));
  }
  return Object.is(actual, expected)
    ? []
    : [`${path}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`];
}

/** An absent shape list and an empty one are the same page; so are an absent image list and an empty one. */
function tidy(state: Obj): Obj {
  const out: Obj = { ...state };
  out['shapeInstances'] ??= [];
  if (Array.isArray(out['userImageInstances']) && out['userImageInstances'].length === 0)
    delete out['userImageInstances'];
  return out;
}

function placed(id: string, brandKey: keyof typeof brands): Obj {
  rememberLogoSize(LOGO, 400, 100);
  const result = instantiateTemplatePage(templateFile(id).template, {
    brand: brands[brandKey],
    canvas: { width: 1080, height: 1350 },
    format: '4:5',
    geometry: TEMPLATE_GEOMETRY,
    fontFallback: fontFallbackFor,
    schemeId: SEED_SCHEME[id] ?? null,
    logoSizeOf,
  });
  if (!result.ok) throw new Error(`${id}: ${result.reason}`);
  const { templateRef: _ref, groups: _groups, ...rest } = result.state;
  return tidy(rest);
}

const texts = (state: Obj) => state['additionalTexts'] as Obj[];
const byId = (list: Obj[], id: string) => list.find((e) => e['id'] === id) as Obj;

describe('the studio seeds as template files', () => {
  for (const [brandKey, goldenSet] of [
    ['plain', golden.plain],
    ['logo', golden.logo],
  ] as const) {
    it.each(IDS)(`%s matches the code seed on the ${brandKey} brand`, (id) => {
      const expected = tidy(structuredClone((goldenSet as Record<string, unknown>)[id]) as Obj);
      for (const textId of NARROWED[id] ?? []) {
        const text = byId(texts(expected), textId);
        // The code seeds gave every one of them the full 886 px of the 4:5 safe frame.
        expect(text['width']).toBe(886);
        text['width'] = Math.round(886 * NARROWED_TO);
      }
      expect(closeTo(placed(id, brandKey), expected, id)).toEqual([]);
    });
  }

  it('narrows the boxes that sit in the logo band to 399 px', () => {
    for (const [id, textIds] of Object.entries(NARROWED)) {
      for (const textId of textIds) {
        expect(byId(texts(placed(id, 'plain')), textId)['width']).toBe(399);
      }
    }
  });

  it('binds the big number to the accent role of the secondary world', () => {
    const number = byId(texts(placed('studio-number', 'plain')), 'number');
    const secondary = deriveSchemes(studioBrand).find((s) => s.id === 'secondary');
    const accent = (secondary?.roles as unknown as Obj)['accent'];
    expect(number['bind']).toMatchObject({ fill: { ref: 'accent' } });
    expect(number['fill']).toBe(accent);
    expect((number['bind'] as { fill: { value: string } }).fill.value).toBe(accent);
  });

  it('leaves no logo on a brand without one', () => {
    for (const id of IDS) expect(placed(id, 'plain')['userImageInstances']).toBeUndefined();
  });
});
