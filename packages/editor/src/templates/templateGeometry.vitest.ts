// SPDX-License-Identifier: MPL-2.0
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerAssetCatalog, type CanvasAssetCatalog } from '@ggraphic/editor/utils/canvasAssets';

import { TEMPLATE_GATE_ADAPTER, TEMPLATE_GEOMETRY, UNSCALED_FIELDS } from './templateGeometry.js';
import {
  createAdditionalTextActions,
  createIconActions,
} from '../configs/factory/actionFactories.js';
import { createCircleBadgeInstance } from '../utils/circleBadgeUtils.js';
import { createChartInstance } from '../utils/chartUtils.js';
import { createFrameInstance } from '../utils/frameUtils.js';
import { createIllustration } from '../utils/illustrations/registry.js';
import { createPillBadgeInstance } from '../utils/pillBadgeUtils.js';
import { createShape } from '../utils/shapes.js';
import { createUserImageInstanceFromUrl } from '../utils/userImageUtils.js';

type Fields = Record<string, unknown>;

/** A catalogue with one Kawaii and one SVG graphic, so `createIllustration` runs without a host. */
const CATALOG: CanvasAssetCatalog = {
  assets: [],
  isInstanceSrc: () => false,
  illustrations: {
    loadKawaii: () => Promise.resolve([{ id: 'cat', name: 'Cat', tags: [], source: 'kawaii' }]),
    loadSvg: () =>
      Promise.resolve([
        { id: 'svg-1', name: 'One', filename: 'one.svg', source: 'opendoodles', tags: [] },
      ]),
    basePath: '/illustrations',
  },
};

// `Image` does not exist on the node lane; the factory then never resolves, so give it a failing one.
class FailingImage {
  crossOrigin = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_url: string) {
    queueMicrotask(() => this.onerror?.());
  }
}

/** The instance a kind starts with, by its own factory, per kind (both illustration sources). */
async function defaults(): Promise<Record<string, Fields[]>> {
  let icons: Record<string, Fields> = {};
  createIconActions<{ selectedIcons: string[]; iconStates: Record<string, never> }>(
    () => ({ selectedIcons: [], iconStates: {} }),
    (update) => {
      const next =
        typeof update === 'function' ? update({ selectedIcons: [], iconStates: {} }) : update;
      icons = next.iconStates as unknown as Record<string, Fields>;
    },
    () => {},
    () => {},
    1080,
    1350,
    { defaultColor: '#005538' }
  ).toggleIcon('tabler-sun', true);

  let texts: Fields[] = [];
  const textActions = createAdditionalTextActions<{ additionalTexts: never[] }>(
    () => ({ additionalTexts: [] }),
    (update) => {
      const next = typeof update === 'function' ? update({ additionalTexts: [] }) : update;
      texts = next.additionalTexts as unknown as Fields[];
    },
    () => {},
    () => {},
    1080,
    1350,
    '#ffffff'
  );
  textActions.addHeader();

  vi_globalImage();
  return {
    iconStates: Object.values(icons),
    shapeInstances: [createShape('rect', 0, 0, '#005538') as unknown as Fields],
    frameInstances: [createFrameInstance('circle', 0, 0) as unknown as Fields],
    additionalTexts: texts,
    illustrationInstances: [
      (await createIllustration('cat', 1080, 1350)) as unknown as Fields,
      (await createIllustration('svg-1', 1080, 1350)) as unknown as Fields,
    ],
    circleBadgeInstances: [createCircleBadgeInstance() as unknown as Fields],
    pillBadgeInstances: [createPillBadgeInstance() as unknown as Fields],
    userImageInstances: [
      (await createUserImageInstanceFromUrl('blob:x', 'x.png', 1080, 1350)) as unknown as Fields,
    ],
    chartInstances: [createChartInstance('bar', 1080, 1350) as unknown as Fields],
  };
}

function vi_globalImage() {
  (globalThis as { Image?: unknown }).Image = FailingImage;
}

/** Numbers a kind may carry that its factory leaves unset (optional on the type, or not yet there). */
const OPTIONAL: Record<string, readonly string[]> = {
  additionalTexts: ['letterSpacing', 'rotation', 'scale', 'opacity', 'lineHeight'],
  shapeInstances: ['cornerRadius'],
};

describe('template geometry', () => {
  let kinds: Record<string, Fields[]>;
  beforeAll(async () => {
    registerAssetCatalog(CATALOG);
    kinds = await defaults();
  });
  afterAll(() => {
    registerAssetCatalog({ assets: [], isInstanceSrc: () => false });
    delete (globalThis as { Image?: unknown }).Image;
  });

  it('every numeric field of every kind is scaled or deliberately unscaled', () => {
    const unlisted: string[] = [];
    for (const [stateKey, instances] of Object.entries(kinds)) {
      const known = new Set([
        ...Object.keys(TEMPLATE_GEOMETRY[stateKey] ?? {}),
        ...Object.keys(UNSCALED_FIELDS[stateKey] ?? {}),
      ]);
      for (const instance of instances) {
        for (const [field, value] of Object.entries(instance)) {
          if (typeof value === 'number' && Number.isFinite(value) && !known.has(field)) {
            unlisted.push(`${stateKey}.${field}`);
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
      const instances = kinds[stateKey] ?? [];
      if (!instances.length) {
        dead.push(stateKey);
        continue;
      }
      const geometry = Object.keys(TEMPLATE_GEOMETRY[stateKey] ?? {});
      const unscaled = Object.keys(UNSCALED_FIELDS[stateKey] ?? {});
      for (const field of geometry) {
        if (geometry.length && unscaled.includes(field)) dead.push(`${stateKey}.${field} twice`);
        if (OPTIONAL[stateKey]?.includes(field)) continue;
        if (!instances.some((i) => typeof i[field] === 'number')) dead.push(`${stateKey}.${field}`);
      }
      for (const field of unscaled) {
        if (OPTIONAL[stateKey]?.includes(field)) continue;
        if (!instances.some((i) => typeof i[field] === 'number')) dead.push(`${stateKey}.${field}`);
      }
    }
    expect(dead).toEqual([]);
  });

  it('the page has no scaled fields', () => {
    expect(TEMPLATE_GEOMETRY['page']).toEqual({});
  });

  it("the adapter's text box is fontSize x lineHeight x lines", () => {
    const text = { x: 10, y: 20, width: 300, fontSize: 40, lineHeight: 1.5 };
    expect(TEMPLATE_GATE_ADAPTER.box('additionalTexts', text, 2)).toEqual({
      x: 10,
      y: 20,
      width: 300,
      height: 120,
    });
  });

  it('the adapter reads text and fill only from the kinds that have them', () => {
    const text = { fill: '#fff', fontSize: 30, fontStyle: 'bold' };
    expect(TEMPLATE_GATE_ADAPTER.text('additionalTexts', text)).toEqual({
      fill: '#fff',
      fontSize: 30,
      bold: true,
    });
    expect(TEMPLATE_GATE_ADAPTER.text('shapeInstances', text)).toBeNull();
    expect(TEMPLATE_GATE_ADAPTER.fill('shapeInstances', { fill: '#000' })).toBe('#000');
    expect(TEMPLATE_GATE_ADAPTER.fill('additionalTexts', { fill: '#000' })).toBeNull();
  });
});
