// SPDX-License-Identifier: MPL-2.0
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ASSET_FIELDS,
  TEMPLATE_GATE_ADAPTER,
  createTemplateGateAdapter,
  illustrationLookup,
  TEMPLATE_GEOMETRY,
  UNSCALED_FIELDS,
} from './templateGeometry.js';
import type { IllustrationDef } from '../utils/illustrations/types.js';
import { CATALOG, defaults, populated, registerAssetCatalog, type Fields } from './testKinds.js';

/** Numbers a type declares that no factory sets and nothing yet reads. */
const NOT_ON_THE_TYPE: Record<string, readonly string[]> = {};

const isNumeric = (value: unknown): boolean =>
  (typeof value === 'number' && Number.isFinite(value)) ||
  (Array.isArray(value) && value.length > 0 && value.every((v) => Number.isFinite(v)));

describe('template geometry', () => {
  let kinds: Record<string, Fields[]>;
  let filled: Record<string, Fields[]>;
  beforeAll(async () => {
    registerAssetCatalog(CATALOG);
    kinds = await defaults();
    filled = await populated();
  });
  afterAll(() => {
    registerAssetCatalog({ assets: [], isInstanceSrc: () => false });
    delete (globalThis as { Image?: unknown }).Image;
  });

  it('every numeric field of every kind is scaled or deliberately unscaled', () => {
    const unlisted: string[] = [];
    for (const group of [kinds, filled]) {
      for (const [stateKey, instances] of Object.entries(group)) {
        const known = new Set([
          ...Object.keys(TEMPLATE_GEOMETRY[stateKey] ?? {}),
          ...Object.keys(UNSCALED_FIELDS[stateKey] ?? {}),
        ]);
        for (const instance of instances) {
          for (const [field, value] of Object.entries(instance)) {
            if (isNumeric(value) && !known.has(field)) unlisted.push(`${stateKey}.${field}`);
          }
        }
      }
    }
    expect([...new Set(unlisted)]).toEqual([]);
  });

  it('lists no dead field and no field twice', () => {
    const dead: string[] = [];
    for (const stateKey of new Set([
      ...Object.keys(TEMPLATE_GEOMETRY),
      ...Object.keys(UNSCALED_FIELDS),
    ])) {
      if (stateKey === 'page') continue;
      const instances = filled[stateKey] ?? [];
      if (!instances.length) {
        dead.push(stateKey);
        continue;
      }
      const geometry = Object.keys(TEMPLATE_GEOMETRY[stateKey] ?? {});
      const unscaled = Object.keys(UNSCALED_FIELDS[stateKey] ?? {});
      for (const field of [...geometry, ...unscaled]) {
        if (NOT_ON_THE_TYPE[stateKey]?.includes(field)) continue;
        if (!instances.some((i) => isNumeric(i[field]))) dead.push(`${stateKey}.${field}`);
      }
      for (const field of geometry) {
        if (unscaled.includes(field)) dead.push(`${stateKey}.${field} twice`);
      }
    }
    expect(dead).toEqual([]);
  });

  it('exempts only the numbers that are not on the type yet', () => {
    // A bogus exemption would hide a dead entry; each one must really be listed.
    for (const [stateKey, fields] of Object.entries(NOT_ON_THE_TYPE)) {
      for (const field of fields) {
        expect(Object.keys(TEMPLATE_GEOMETRY[stateKey] ?? {}), `${stateKey}.${field}`).toContain(
          field
        );
        expect(filled[stateKey]!.some((i) => field in i)).toBe(false);
      }
    }
  });

  it('the page has no scaled fields', () => {
    expect(TEMPLATE_GEOMETRY['page']).toEqual({});
  });

  it("the adapter's text box is fontSize x lineHeight x lines", () => {
    // The box ignores the text's scale and rotation on purpose: the gate checks the
    // laid-out text against its own width, not where a transform puts it.
    const text = { x: 10, y: 20, width: 300, fontSize: 40, lineHeight: 1.5 };
    expect(TEMPLATE_GATE_ADAPTER.box('additionalTexts', text, 2)).toEqual({
      x: 10,
      y: 20,
      width: 300,
      height: 120,
    });
  });

  it('the adapter reads text only from the kinds that have it', () => {
    const text = { fill: '#fff', fontSize: 30, fontStyle: 'bold' };
    expect(TEMPLATE_GATE_ADAPTER.text('additionalTexts', text)).toEqual({
      fill: '#fff',
      fontSize: 30,
      bold: true,
      opacity: 1,
    });
    expect(TEMPLATE_GATE_ADAPTER.text('shapeInstances', text)).toBeNull();
    // A text's own gradient is drawn over its flat fill, so the fill is not what to judge.
    expect(
      TEMPLATE_GATE_ADAPTER.text('additionalTexts', { ...text, fillGradient: { stops: [] } })
    ).toMatchObject({ notCheckable: 'text gradient not checkable' });
    expect(
      TEMPLATE_GATE_ADAPTER.text('additionalTexts', { ...text, fillGradient: null })
    ).not.toHaveProperty('notCheckable');
    expect(
      TEMPLATE_GATE_ADAPTER.text('pillBadgeInstances', {
        textColor: '#fff',
        backgroundColor: '#000',
        fontSize: 20,
        opacity: 0.5,
      })
    ).toEqual({ fill: '#fff', fontSize: 20, bold: false, opacity: 0.5, ground: '#000' });
    expect(
      TEMPLATE_GATE_ADAPTER.text('circleBadgeInstances', {
        textColor: '#fff',
        backgroundColor: '#000',
        textLines: [
          { fontSize: 30, fontWeight: 'bold' },
          { fontSize: 20, fontWeight: 'normal' },
        ],
      })
    ).toEqual({ fill: '#fff', fontSize: 20, bold: false, opacity: 1, ground: '#000' });
  });

  it('only a flat, opaque shape is a ground', () => {
    const cover = (key: string, el: Fields) => TEMPLATE_GATE_ADAPTER.cover(key, el);
    expect(cover('shapeInstances', { fill: '#000', opacity: 1 })).toEqual({
      kind: 'solid',
      fill: '#000',
    });
    expect(cover('shapeInstances', { fill: '#000', opacity: 0.9 })).toEqual({
      kind: 'veil',
      fill: '#000000',
      alpha: 0.9,
    });
    expect(cover('shapeInstances', { fill: '#000', fillGradient: { stops: [] } })).toEqual({
      kind: 'unknown',
    });
    expect(cover('shapeInstances', { fill: '#000', blendMode: 'multiply' })).toEqual({
      kind: 'unknown',
    });
    expect(cover('additionalTexts', { fill: '#000' })).toBeNull();
    for (const key of ['frameInstances', 'chartInstances', 'iconStates']) {
      expect(cover(key, {})).toEqual({ kind: 'unknown' });
    }
  });

  it('cover() maps photo, duotone photo, shade shape, veil shape and keeps unknown for tint, blend and rotation', () => {
    const cover = (key: string, el: Fields) => TEMPLATE_GATE_ADAPTER.cover(key, el);
    const unknown = { kind: 'unknown' };
    const image = 'userImageInstances';
    expect(cover(image, { src: '/p.png' })).toEqual({
      kind: 'photo',
      low: '#000000',
      high: '#ffffff',
    });
    expect(cover(image, { duotoneLow: '#0b1d12', duotoneHigh: '#e8f5ec' })).toEqual({
      kind: 'photo',
      low: '#0b1d12',
      high: '#e8f5ec',
    });
    // One duotone colour alone does nothing; the photo keeps its full range.
    expect(cover(image, { duotoneLow: '#0b1d12' })).toEqual({
      kind: 'photo',
      low: '#000000',
      high: '#ffffff',
    });
    expect(cover(image, { tint: '#00ff00', tintStrength: 0.5 })).toEqual(unknown);
    expect(cover(image, { tintStrength: 0.5 })).toEqual(unknown);
    expect(cover(image, { blendMode: 'multiply' })).toEqual(unknown);
    expect(cover(image, { rotation: 10 })).toEqual(unknown);
    expect(cover(image, { opacity: 0.5 })).toEqual(unknown);
    expect(cover(image, { mask: 'kreis' })).toEqual(unknown);
    const duo = { duotoneLow: '#000000', duotoneHigh: '#444444' };
    // The duotone runs after the other colour filters, so they keep its range; a vignette does not.
    expect(cover(image, { ...duo, brightness: 0.4, contrast: 7, grayscale: true })).toEqual({
      kind: 'photo',
      ...{ low: '#000000', high: '#444444' },
    });
    expect(cover(image, { ...duo, vignette: 0.3 })).toEqual(unknown);

    expect(cover('shapeInstances', { fill: '#101820', shade: 'bottom' })).toEqual({
      kind: 'shade',
      fill: '#101820',
      direction: 'bottom',
    });
    expect(cover('shapeInstances', { fill: '#101820', shade: 'top', opacity: 0.5 })).toEqual(
      unknown
    );
    expect(cover('shapeInstances', { fill: '#10182080', shade: 'top' })).toEqual(unknown);
    expect(cover('shapeInstances', { fill: '#101820', shade: 'top', rotation: 5 })).toEqual(
      unknown
    );
    // Only a plain rectangle fills its box.
    expect(cover('shapeInstances', { type: 'rect', fill: '#000', opacity: 1 })).toEqual({
      kind: 'solid',
      fill: '#000',
    });
    for (const shape of [{ type: 'circle' }, { type: 'star' }, { type: 'rect', cornerRadius: 8 }]) {
      expect(cover('shapeInstances', { fill: '#000', ...shape })).toEqual(unknown);
      expect(cover('shapeInstances', { fill: '#000', opacity: 0.5, ...shape })).toEqual(unknown);
      expect(cover('shapeInstances', { fill: '#000', shade: 'top', ...shape })).toEqual(unknown);
    }
    expect(cover('shapeInstances', { fill: '#000000', opacity: 0.35 })).toEqual({
      kind: 'veil',
      fill: '#000000',
      alpha: 0.35,
    });
    const veil = cover('shapeInstances', { fill: '#00000080', opacity: 0.5 });
    expect(veil).toMatchObject({ kind: 'veil', fill: '#000000' });
    expect(veil && 'alpha' in veil ? veil.alpha : 0).toBeCloseTo(0.25, 2);
    expect(cover('shapeInstances', { fill: '#000', opacity: 0.5, blendMode: 'multiply' })).toEqual(
      unknown
    );
  });

  it('colorFields holds no font or image field', () => {
    for (const fields of Object.values(TEMPLATE_GATE_ADAPTER.colorFields)) {
      expect(fields.filter((f) => f === 'src' || f.startsWith('font'))).toEqual([]);
    }
    expect(TEMPLATE_GATE_ADAPTER.colorFields['shapeInstances']).toContain('fill');
  });

  it('reads the nested colours of gradients, accent, marker and charts', () => {
    const nested = (key: string, el: Fields) => TEMPLATE_GATE_ADAPTER.nestedColors(key, el);
    expect(
      nested('shapeInstances', { fillGradient: { stops: [{ color: '#111' }, { color: '#222' }] } })
    ).toEqual([
      { field: 'fillGradient', value: '#111' },
      { field: 'fillGradient', value: '#222' },
    ]);
    expect(
      nested('additionalTexts', { accent: { fill: '#a' }, marker: { fill: '#b', color: '#c' } })
    ).toEqual([
      { field: 'accent', value: '#a' },
      { field: 'marker', value: '#b' },
      { field: 'marker', value: '#c' },
    ]);
    expect(nested('chartInstances', { colors: ['#1', '#2'] })).toEqual([
      { field: 'colors', value: '#1' },
      { field: 'colors', value: '#2' },
    ]);
  });

  it('every image-source string field of every kind is an asset field', () => {
    const missing: string[] = [];
    for (const group of [kinds, filled]) {
      for (const [stateKey, instances] of Object.entries(group)) {
        for (const el of instances) {
          for (const field of Object.keys(el)) {
            const looksLikeImage = /(^|[a-z])(src|url|image)$/i.test(field) || field === 'src';
            if (
              looksLikeImage &&
              typeof el[field] === 'string' &&
              !(ASSET_FIELDS[stateKey] ?? []).includes(field)
            ) {
              missing.push(`${stateKey}.${field}`);
            }
          }
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
    expect(ASSET_FIELDS).toEqual(TEMPLATE_GATE_ADAPTER.assetFields);
  });
});

const DEFS: IllustrationDef[] = [
  { id: 'cat', name: 'Cat', tags: [], source: 'kawaii' },
  { id: 'op-1', name: 'Peep', filename: 'a.svg', tags: [], source: 'openpeeps' },
  { id: 'gph-1', name: 'Gopher', filename: 'g.svg', tags: [], source: 'gophers' },
];
const adapter = createTemplateGateAdapter(illustrationLookup(DEFS));
const refs = adapter.assetRefs;

describe('template gate adapter: assets named by id', () => {
  it('names an illustration by the set its id resolves to, not by the declared source', () => {
    expect(
      refs('illustrationInstances', { source: 'gophers', illustrationId: 'gph-1' }, 'i')
    ).toEqual([{ kind: 'illustration', id: 'gophers:gph-1' }]);
    // The renderer ignores `source`: this draws the gopher.
    expect(
      refs('illustrationInstances', { source: 'openpeeps', illustrationId: 'gph-1' }, 'i')
    ).toEqual([{ kind: 'illustration', id: 'gophers:gph-1' }]);
    expect(refs('illustrationInstances', { source: 'kawaii', illustrationId: 'cat' }, 'i')).toEqual(
      [{ kind: 'illustration', id: 'kawaii:cat' }]
    );
  });

  it('fails closed on an id it cannot resolve, or a kawaii claim for a non-kawaii id', () => {
    expect(
      refs('illustrationInstances', { source: 'openpeeps', illustrationId: 'nope' }, 'i')
    ).toEqual([{ kind: 'illustration', id: 'unresolved:nope' }]);
    expect(
      refs('illustrationInstances', { source: 'kawaii', illustrationId: 'gph-1' }, 'i')
    ).toEqual([{ kind: 'illustration', id: 'unresolved:gph-1' }]);
    expect(
      TEMPLATE_GATE_ADAPTER.assetRefs('illustrationInstances', { illustrationId: 'cat' }, 'i')
    ).toEqual([{ kind: 'illustration', id: 'unresolved:cat' }]);
  });

  it('names a sticker or an emoji by its asset id', () => {
    expect(refs('assetInstances', { assetId: 'asset:abc' }, 'a')).toEqual([
      { kind: 'sticker', id: 'asset:abc' },
    ]);
    expect(refs('assetInstances', { assetId: 'emoji-1f600' }, 'a')).toEqual([
      { kind: 'emoji', id: 'emoji-1f600' },
    ]);
  });

  it('names a bundled icon by its catalogue id, a copy by its iconId', () => {
    expect(refs('iconStates', {}, 'tabler:tree')).toEqual([{ kind: 'icon', id: 'tabler:tree' }]);
    expect(refs('iconStates', { iconId: 'lucide:sun' }, 'copy-1')).toEqual([
      { kind: 'icon', id: 'lucide:sun' },
    ]);
  });

  it('refuses a stored external svg copy: it cannot be checked against the set offline', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
    const source = { kind: 'iconify', prefix: 'tabler', name: 'home' };
    expect(refs('iconStates', { iconId: 'iconify:tabler:home', svg, source }, 'x')).toEqual([
      { kind: 'stored-svg', id: 'iconify:tabler:home' },
    ]);
    // Declared tabler, id says fa6-solid, svg arbitrary.
    expect(
      refs('iconStates', { iconId: 'iconify:fa6-solid:house', svg, source }, 'x').map((r) => r.kind)
    ).toEqual(['stored-svg']);
    expect(refs('iconStates', { iconId: 'iconify:mdi:home' }, 'x')).toEqual([
      { kind: 'icon', id: 'mdi:home' },
    ]);
  });

  it('names nothing for kinds without an id-based asset', () => {
    expect(refs('shapeInstances', {}, 's')).toEqual([]);
  });
});

describe('font width tables', () => {
  it('match the installed fonts (regenerate with node scripts/generate-font-widths.mjs)', () => {
    const script = fileURLToPath(
      new URL('../../../../scripts/generate-font-widths.mjs', import.meta.url)
    );
    expect(() => execFileSync('node', [script, '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});

describe('template gate adapter: line count of a text', () => {
  const lines = TEMPLATE_GATE_ADAPTER.lineCount;
  const text = (over: Record<string, unknown>) => ({
    text: 'Hello',
    width: 900,
    fontSize: 100,
    fontFamily: 'Raleway',
    fontStyle: 'bold',
    ...over,
  });
  const check = (over: Record<string, unknown>) =>
    TEMPLATE_GATE_ADAPTER.text('additionalTexts', text(over))?.boundsProblem ?? null;

  it('counts explicit breaks', () => {
    expect(lines('additionalTexts', text({ text: 'a\nb\nc' }))).toBe(3);
    expect(lines('shapeInstances', { text: 'a\nb' })).toBe(1);
  });

  it('is an upper bound for wide glyphs (the shipped fonts measured at 1.05 em for W, 0.93 for m)', () => {
    // Reviewer's measurements at 100 px bold in 900 px: six lines each.
    expect(lines('additionalTexts', text({ text: 'WWWWW '.repeat(6).trim() }))).toBe(6);
    expect(lines('additionalTexts', text({ text: 'mmmmm '.repeat(6).trim() }))).toBe(6);
    expect(
      lines('additionalTexts', text({ text: 'Add the details here: what, when and where.' }))
    ).toBeLessThanOrEqual(4);
  });

  it('adds letter spacing per character and breaks a long word on a character boundary', () => {
    const tight = lines('additionalTexts', text({ text: 'aaaaaaaaaaaaaaaa', width: 1300 }));
    const spaced = lines(
      'additionalTexts',
      text({ text: 'aaaaaaaaaaaaaaaa', width: 1300, letterSpacing: 0.3 })
    );
    expect(spaced).toBeGreaterThan(tight);
    expect(lines('additionalTexts', text({ text: 'W'.repeat(30), width: 1000 }))).toBe(4);
  });

  it('measures with the table of the text font and its weight', () => {
    expect(check({})).toBeNull();
    expect(check({ fontFamily: 'Raleway, Arial, sans-serif' })).toBeNull();
    // A legacy family is aliased first.
    expect(check({ fontFamily: 'PT Sans' })).toBeNull();
  });

  it('is not checkable for a font without a table, or a code point the fonts do not cover', () => {
    expect(check({ fontFamily: 'Comic Sans' })).toContain('text width not checkable');
    expect(check({ fontFamily: '' })).toContain('text width not checkable');
    expect(check({ text: '気候保護は今すぐ必要です' })).toContain('text width not checkable');
    expect(check({ text: 'Hallo 😀' })).toContain('text width not checkable');
  });

  it('is not checkable when rotated', () => {
    expect(check({ rotation: 90, text: 'a' })).toBe('rotated, not checkable');
    expect(check({ rotation: 0, text: 'a' })).toBeNull();
  });

  it('treats a rotated shape as a ground of unknown paint', () => {
    const shape = { fill: '#ffffff', opacity: 1, rotation: 45 };
    expect(TEMPLATE_GATE_ADAPTER.cover('shapeInstances', shape)).toEqual({ kind: 'unknown' });
    expect(TEMPLATE_GATE_ADAPTER.cover('shapeInstances', { ...shape, rotation: 0 })).toEqual({
      kind: 'solid',
      fill: '#ffffff',
    });
  });
});

describe('template gate adapter: badges', () => {
  const pill = (over: Record<string, unknown> = {}) => ({
    x: 100,
    y: 50,
    text: 'aaaa',
    fontSize: 20,
    fontFamily: 'Raleway',
    fontStyle: 'bold',
    paddingX: 10,
    paddingY: 5,
    scale: 2,
    ...over,
  });
  const box = (el: Record<string, unknown>) =>
    TEMPLATE_GATE_ADAPTER.box('pillBadgeInstances', el, 1)!;

  it('gives a pill its padded, scaled box from its top-left', () => {
    const b = box(pill());
    expect([b.x, b.y, b.height]).toEqual([100, 50, (20 + 10) * 2]);
    expect(b.width).toBeGreaterThanOrEqual((4 * 0.5 * 20 + 20) * 2);
  });

  it('is an upper bound for a wide pill text (WWWWWWWW at 100 px bold is 842 px)', () => {
    expect(
      box(pill({ text: 'WWWWWWWW', fontSize: 100, paddingX: 0, paddingY: 0, scale: 1 })).width
    ).toBeGreaterThanOrEqual(842);
  });

  it('boxes a pill with its real line count', () => {
    expect(box(pill({ text: 'A\nB\nC', scale: 1 })).height).toBe(3 * 20 + 10);
  });

  it('is not checkable when rotated or when the text cannot be measured', () => {
    const problem = (el: Record<string, unknown>) =>
      TEMPLATE_GATE_ADAPTER.text('pillBadgeInstances', el)?.boundsProblem ?? null;
    expect(problem(pill())).toBeNull();
    expect(problem(pill({ rotation: 15 }))).toBe('rotated, not checkable');
    expect(problem(pill({ text: '😀' }))).toContain('text width not checkable');
  });

  describe('circle', () => {
    const circle = (lines: Record<string, unknown>[], over: Record<string, unknown> = {}) => ({
      x: 100,
      y: 100,
      radius: 100,
      scale: 1,
      textLines: lines,
      ...over,
    });
    const line = (over: Record<string, unknown> = {}) => ({
      text: 'Neu',
      yOffset: 0,
      fontFamily: 'Raleway',
      fontSize: 40,
      fontWeight: 'bold',
      ...over,
    });
    const problem = (el: Record<string, unknown>) =>
      TEMPLATE_GATE_ADAPTER.text('circleBadgeInstances', el)?.boundsProblem ?? null;

    it('gives its disc, centred', () => {
      expect(
        TEMPLATE_GATE_ADAPTER.box(
          'circleBadgeInstances',
          { x: 100, y: 100, radius: 30, scale: 2 },
          1
        )
      ).toEqual({ x: 40, y: 40, width: 120, height: 120 });
    });

    it('keeps a line inside the disc', () => {
      expect(problem(circle([line()]))).toBeNull();
    });

    it('fails a line that wraps, leaves the disc at a corner, or is rotated', () => {
      expect(problem(circle([line({ text: 'WWWWWWWWWW' })]))).toContain('disc');
      expect(problem(circle([line({ text: 'Wahlkreis', yOffset: 85 })]))).toContain('disc');
      expect(problem(circle([line()], { rotation: 30 }))).toBe('rotated, not checkable');
    });
  });
});

describe('bundled illustration sets', () => {
  it('have unique ids across all sets, so the gate lookup agrees with the renderer', async () => {
    const sets = await Promise.all(
      [
        'kawaii',
        'gophers',
        'humaaans',
        'illlustrations',
        'opendoodles',
        'openpeeps',
        'transhumans',
      ].map(
        (name) =>
          import(`../utils/illustrations/${name}.ts`) as Promise<Record<string, { id: string }[]>>
      )
    );
    const ids = sets.flatMap((mod) =>
      Object.values(mod)
        .flat()
        .map((def) => def.id)
    );
    expect(ids.length).toBeGreaterThan(100);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });
});

describe('template gate adapter: what the renderer scales, turns and draws', () => {
  const A = TEMPLATE_GATE_ADAPTER;
  const text = { text: 'Hello', width: 400, fontSize: 40, fontFamily: 'Raleway', lineHeight: 1.2 };

  it('scales a text box and its type size by `scale`', () => {
    expect(A.box('additionalTexts', { ...text, scale: 3 }, 2)).toEqual({
      x: 0,
      y: 0,
      width: 1200,
      height: 40 * 1.2 * 2 * 3,
    });
    expect(A.text('additionalTexts', { ...text, scale: 0.3 })?.fontSize).toBeCloseTo(12);
  });

  it('scales badges and charts too', () => {
    const pill = { text: 'Neu', fontSize: 20, fontFamily: 'Raleway', scale: 2 };
    expect(A.text('pillBadgeInstances', pill)?.fontSize).toBe(40);
    const circle = { radius: 50, scale: 2, textLines: [{ fontSize: 10, text: '' }] };
    expect(A.text('circleBadgeInstances', circle)?.fontSize).toBe(20);
    expect(A.box('chartInstances', { x: 10, y: 10, width: 100, height: 50, scale: 3 }, 1)).toEqual({
      x: 10,
      y: 10,
      width: 300,
      height: 150,
    });
  });

  it('boxes a rotated shape by the extent of the turned rectangle, about its centre', () => {
    const shape = { x: 500, y: 500, width: 800, height: 20, scaleX: 1, scaleY: 1, rotation: 90 };
    const box = A.box('shapeInstances', shape, 1)!;
    expect(box.width).toBeCloseTo(20);
    expect(box.height).toBeCloseTo(800);
    expect([box.x, box.y].map(Math.round)).toEqual([490, 100]);
  });

  it('wraps a text as the renderer draws it, whatever wrap, padding or richText it carries', () => {
    // The renderer passes none of the three to the text node: word wrap, no padding, routed by content.
    const long = { ...text, text: 'Klimaschutz jetzt '.repeat(8).trim(), width: 300 };
    const drawn = A.lineCount('additionalTexts', long);
    expect(drawn).toBeGreaterThan(1);
    for (const over of [{ wrap: 'none' }, { wrap: 'char' }, { padding: 40 }, { richText: true }]) {
      expect(A.lineCount('additionalTexts', { ...long, ...over }), JSON.stringify(over)).toBe(
        drawn
      );
    }
  });

  it('scales a user image about its top-left', () => {
    const image = { x: 10, y: 20, width: 100, height: 50, scale: 2 };
    expect(A.box('userImageInstances', image, 1)).toEqual({
      x: 10,
      y: 20,
      width: 200,
      height: 100,
    });
  });

  it('boxes a rotated icon by the extent of the turned square, about its centre', () => {
    const flat = A.box('iconStates', { x: 500, y: 500, scale: 1, rotation: 0 }, 1)!;
    const turned = A.box('iconStates', { x: 500, y: 500, scale: 1, rotation: 45 }, 1)!;
    expect(turned.width).toBeCloseTo(flat.width * Math.SQRT2);
    expect(turned.x + turned.width / 2).toBeCloseTo(500);
  });

  it('refuses to place a rotated image, frame or chart', () => {
    for (const key of ['userImageInstances', 'frameInstances', 'chartInstances']) {
      expect(A.boundsProblem?.(key, { rotation: 45 })).toBe('rotated, not checkable');
      expect(A.boundsProblem?.(key, { rotation: 0 })).toBeNull();
    }
  });

  it('reads a bold weight from the word or from a number of 600 or more', () => {
    const bold = (fontStyle: string) => A.text('additionalTexts', { ...text, fontStyle })?.bold;
    expect([bold('bold'), bold('800'), bold('600 italic'), bold('bold italic')]).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect([bold('normal'), bold('500'), bold('italic'), bold('')]).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it('does not measure a code point a face does not draw in its own font', () => {
    const check = (over: Record<string, unknown>) =>
      A.text('additionalTexts', { ...text, ...over })?.boundsProblem ?? null;
    // U+0230 is in Raleway normal but not in Raleway italic; the class covers both styles.
    expect(check({ text: 'Ȱ' })).toContain('text width not checkable');
    // Combining marks of Instrument Sans lie outside every CSS unicode-range of the Studio.
    expect(check({ text: 'é', fontFamily: 'Instrument Sans' })).toContain('not checkable');
    expect(check({ text: 'Fußball', fontFamily: 'Instrument Sans' })).toBeNull();
  });
});
