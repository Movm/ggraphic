// SPDX-License-Identifier: MPL-2.0
/**
 * Shared by the per-kind guard tests (`brand/bindableFields.vitest.ts`,
 * `templates/templateGeometry.vitest.ts`): every kind built by its own factory,
 * and a "populated" variant that also sets the optional numbers of its type.
 */
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

export { registerAssetCatalog };

export type Fields = Record<string, unknown>;

/** A catalogue with one Kawaii and one SVG graphic, so `createIllustration` runs without a host. */
export const CATALOG: CanvasAssetCatalog = {
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
export async function defaults(): Promise<Record<string, Fields[]>> {
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

  installFailingImage();
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

export function installFailingImage() {
  (globalThis as { Image?: unknown }).Image = FailingImage;
}

/**
 * Every optional number (and number array) of the kinds that carry any, set to a
 * value. A kind without optional numbers is left out.
 */
const POPULATED: Record<string, Fields> = {
  additionalTexts: {
    rotation: 1,
    scale: 1,
    opacity: 1,
    lineHeight: 1.2,
    strokeWidth: 2,
    shadowBlur: 3,
    shadowOffsetX: 4,
    shadowOffsetY: 5,
    shadowOpacity: 0.5,
  },
  shapeInstances: {
    cornerRadius: 6,
    textGrowth: 7,
    strokeWidth: 2,
    dash: [4, 2],
    shadowBlur: 3,
    shadowOffsetX: 4,
    shadowOffsetY: 5,
    shadowOpacity: 0.5,
  },
  frameInstances: {
    borderDash: [4, 2],
    shadowBlur: 3,
    shadowOffsetX: 4,
    shadowOffsetY: 5,
    tilt: 2,
    aspectRatioLock: 1.5,
  },
  userImageInstances: {
    blur: 2,
    shadowBlur: 3,
    shadowOffsetX: 4,
    shadowOffsetY: 5,
    shadowOpacity: 0.5,
    brightness: 0.1,
    contrast: 10,
    saturation: 1,
    hue: 10,
    temperature: 10,
    tintStrength: 0.5,
    vignette: 0.3,
    cropZoom: 1.2,
    panX: 0.1,
    panY: 0.1,
    cropRotation: 3,
  },
  iconStates: { opacity: 1 },
  circleBadgeInstances: { opacity: 1 },
};

/** `defaults()` with the optional numbers of each kind set (`POPULATED`). */
export async function populated(): Promise<Record<string, Fields[]>> {
  const kinds = await defaults();
  return Object.fromEntries(
    Object.entries(kinds).map(([key, list]) => [
      key,
      list.map((instance) => ({ ...instance, ...POPULATED[key] })),
    ])
  );
}
