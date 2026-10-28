// SPDX-License-Identifier: MPL-2.0
/**
 * How each element kind's numbers move when a template is placed on a page of
 * another size (axes: x, y, w, h, font size `s`, icon scale `k`). Every top-level
 * number of a kind is either here or in `UNSCALED_FIELDS` with the reason it stays;
 * `templateGeometry.vitest.ts` builds each kind by its factory and goes red on a
 * number (or number array) that is in neither; the guard runs over the factory default
 * and a populated fixture that sets every optional number. Keyed by `stateKey`, as `BINDABLE_FIELDS` is.
 */
import type { GateAdapter, GeometryTable } from '@ggraphic/core';

import { BINDABLE_FIELDS } from '../brand/bindableFields.js';

export const TEMPLATE_GEOMETRY: GeometryTable = {
  additionalTexts: {
    x: 'x',
    y: 'y',
    width: 'w',
    fontSize: 's',
    letterSpacing: 's',
    strokeWidth: 's',
    shadowBlur: 's',
    shadowOffsetX: 's',
    shadowOffsetY: 's',
  },
  shapeInstances: {
    x: 'x',
    y: 'y',
    width: 'w',
    height: 'h',
    cornerRadius: 's',
    textGrowth: 's',
    strokeWidth: 's',
    // A number array: every element is a px length and scales like `s`.
    dash: 's',
    shadowBlur: 's',
    shadowOffsetX: 's',
    shadowOffsetY: 's',
  },
  userImageInstances: {
    x: 'x',
    y: 'y',
    width: 'w',
    height: 'h',
    blur: 's',
    shadowBlur: 's',
    shadowOffsetX: 's',
    shadowOffsetY: 's',
  },
  chartInstances: { x: 'x', y: 'y', width: 'w', height: 'h' },
  iconStates: { x: 'x', y: 'y', scale: 'k' },
  frameInstances: {
    x: 'x',
    y: 'y',
    width: 'w',
    height: 'h',
    borderWidth: 's',
    cornerRadius: 's',
    // Px inside the frame (`coverPhotoRect` adds them to the centred photo's position).
    imageOffsetX: 's',
    imageOffsetY: 's',
    // A number array: every element is a px length and scales like `s`.
    borderDash: 's',
    shadowBlur: 's',
    shadowOffsetX: 's',
    shadowOffsetY: 's',
  },
  illustrationInstances: { x: 'x', y: 'y', scale: 'k' },
  circleBadgeInstances: { x: 'x', y: 'y', radius: 's' },
  pillBadgeInstances: {
    x: 'x',
    y: 'y',
    fontSize: 's',
    paddingX: 's',
    paddingY: 's',
    cornerRadius: 's',
  },
  page: {},
};

/** stateKey → numeric field → why it stays as it is. */
const RATIO = 'ratio; independent of the page size';
const ANGLE = 'angle; independent of the page size';
const OPACITY = 'opacity; independent of the page size';
const SHADOW_OPACITY = 'opacity; independent of the page size';
const ADJUSTMENT = 'image adjustment (a filter strength or a share); independent of the page size';

export const UNSCALED_FIELDS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  iconStates: { rotation: ANGLE, opacity: OPACITY },
  additionalTexts: {
    rotation: ANGLE,
    scale: RATIO,
    opacity: OPACITY,
    lineHeight: RATIO,
    shadowOpacity: SHADOW_OPACITY,
  },
  shapeInstances: {
    rotation: ANGLE,
    scaleX: RATIO,
    scaleY: RATIO,
    opacity: OPACITY,
    shadowOpacity: SHADOW_OPACITY,
  },
  frameInstances: {
    rotation: ANGLE,
    scaleX: RATIO,
    scaleY: RATIO,
    opacity: OPACITY,
    imageScale: RATIO,
    tilt: ANGLE,
    aspectRatioLock: RATIO,
  },
  illustrationInstances: { rotation: ANGLE, opacity: OPACITY },
  circleBadgeInstances: { rotation: ANGLE, scale: RATIO, opacity: OPACITY },
  pillBadgeInstances: { rotation: ANGLE, scale: RATIO, opacity: OPACITY },
  userImageInstances: {
    rotation: ANGLE,
    scale: RATIO,
    opacity: OPACITY,
    shadowOpacity: SHADOW_OPACITY,
    brightness: ADJUSTMENT,
    contrast: ADJUSTMENT,
    saturation: ADJUSTMENT,
    hue: ADJUSTMENT,
    temperature: ADJUSTMENT,
    tintStrength: ADJUSTMENT,
    vignette: ADJUSTMENT,
    cropZoom: ADJUSTMENT,
    panX: ADJUSTMENT,
    panY: ADJUSTMENT,
    cropRotation: ANGLE,
  },
  chartInstances: { scale: RATIO, rotation: ANGLE, opacity: OPACITY },
};

type El = Readonly<Record<string, unknown>>;
const num = (el: El, field: string, fallback = 0): number => {
  const v = el[field];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
};

/** Editor icons are drawn 120 px across at scale 1, centred on their x/y (as `boundsOf`). */
const ICON_SIZE = 120;

export const TEMPLATE_GATE_ADAPTER: GateAdapter = {
  geometry: TEMPLATE_GEOMETRY,
  colorFields: BINDABLE_FIELDS,
  box(stateKey, el, lines) {
    const x = num(el, 'x');
    const y = num(el, 'y');
    switch (stateKey) {
      case 'additionalTexts':
        // Scale and rotation are ignored on purpose: the gate checks the laid-out text
        // against its own width, not where a transform puts it.
        return {
          x,
          y,
          width: num(el, 'width'),
          height: num(el, 'fontSize') * num(el, 'lineHeight', 1.2) * lines,
        };
      case 'shapeInstances': {
        const width = num(el, 'width') * num(el, 'scaleX', 1);
        const height = num(el, 'height') * num(el, 'scaleY', 1);
        return { x: x - width / 2, y: y - height / 2, width, height };
      }
      case 'chartInstances':
      case 'userImageInstances':
        return { x, y, width: num(el, 'width'), height: num(el, 'height') };
      case 'iconStates': {
        const size = ICON_SIZE * num(el, 'scale', 1);
        return { x: x - size / 2, y: y - size / 2, width: size, height: size };
      }
      default:
        return null;
    }
  },
  text(stateKey, el) {
    if (stateKey !== 'additionalTexts') return null;
    const style = el['fontStyle'];
    return {
      fill: typeof el['fill'] === 'string' ? el['fill'] : '',
      fontSize: num(el, 'fontSize'),
      bold: typeof style === 'string' && style.includes('bold'),
    };
  },
  fill(stateKey, el) {
    if (stateKey !== 'shapeInstances') return null;
    return typeof el['fill'] === 'string' ? el['fill'] : null;
  },
};
