// SPDX-License-Identifier: MPL-2.0
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ASSET_FIELDS,
  TEMPLATE_GATE_ADAPTER,
  TEMPLATE_GEOMETRY,
  UNSCALED_FIELDS,
} from './templateGeometry.js';
import { CATALOG, defaults, populated, registerAssetCatalog, type Fields } from './testKinds.js';

/** Numbers a type declares that no factory sets and nothing yet reads. */
// `letterSpacing` is a planned field of text; listed now so templates can carry it.
const NOT_ON_THE_TYPE: Record<string, readonly string[]> = {
  additionalTexts: ['letterSpacing'],
};

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
    expect(cover('shapeInstances', { fill: '#000', opacity: 0.9 })).toEqual({ kind: 'unknown' });
    expect(cover('shapeInstances', { fill: '#000', fillGradient: { stops: [] } })).toEqual({
      kind: 'unknown',
    });
    expect(cover('shapeInstances', { fill: '#000', blendMode: 'multiply' })).toEqual({
      kind: 'unknown',
    });
    expect(cover('additionalTexts', { fill: '#000' })).toBeNull();
    for (const key of ['userImageInstances', 'frameInstances', 'chartInstances', 'iconStates']) {
      expect(cover(key, {})).toEqual({ kind: 'unknown' });
    }
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
