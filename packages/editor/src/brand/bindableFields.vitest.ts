// SPDX-License-Identifier: MPL-2.0
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BINDABLE_FIELDS, EXEMPT_FIELDS, type Exempt } from './bindableFields.js';
import { pagePersistedStateKeys } from '../collab/pageElementStateKeys.js';
import { type ShapeInstance } from '../utils/shapes.js';
import { registerAssetCatalog, type CanvasAssetCatalog } from '@ggraphic/editor/utils/canvasAssets';

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

const COLOUR = /^#|^rgba?\(/;

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

describe('bindable fields', () => {
  let kinds: Record<string, Fields[]>;
  beforeAll(async () => {
    registerAssetCatalog(CATALOG);
    kinds = await defaults();
  });
  afterAll(() => {
    registerAssetCatalog({ assets: [], isInstanceSrc: () => false });
    delete (globalThis as { Image?: unknown }).Image;
  });

  it('every colour or font field of every kind is bindable or exempt', () => {
    const unlisted: string[] = [];
    for (const [stateKey, instances] of Object.entries(kinds)) {
      const known = new Set([
        ...(BINDABLE_FIELDS[stateKey] ?? []),
        ...Object.keys(EXEMPT_FIELDS[stateKey] ?? {}),
      ]);
      for (const instance of instances) {
        for (const [field, value] of Object.entries(instance)) {
          const isColour = typeof value === 'string' && COLOUR.test(value);
          if ((isColour || field === 'fontFamily') && !known.has(field)) {
            unlisted.push(`${stateKey}.${field}`);
          }
        }
      }
    }
    expect([...new Set(unlisted)]).toEqual([]);
  });

  it('lists a kind only if the editor has it', () => {
    const known = new Set([...Object.keys(kinds), 'assetInstances', 'page']);
    for (const stateKey of [...Object.keys(BINDABLE_FIELDS), ...Object.keys(EXEMPT_FIELDS)]) {
      expect(known, stateKey).toContain(stateKey);
    }
  });

  it('never lists a field as both bindable and exempt', () => {
    for (const [stateKey, exempt] of Object.entries(EXEMPT_FIELDS)) {
      for (const field of Object.keys(exempt)) {
        expect(BINDABLE_FIELDS[stateKey] ?? [], `${stateKey}.${field}`).not.toContain(field);
      }
    }
  });

  it('lists only page fields the page state persists', () => {
    const persisted = pagePersistedStateKeys();
    expect(BINDABLE_FIELDS['page']!.filter((field) => !persisted.includes(field))).toEqual([]);
  });

  it('a dead exempt entry does not type-check', () => {
    // @ts-expect-error `noSuchField` is not a field of a shape
    const dead: Exempt<ShapeInstance> = { noSuchField: 'x' };
    expect(Object.keys(dead)).toEqual(['noSuchField']);
  });
});
