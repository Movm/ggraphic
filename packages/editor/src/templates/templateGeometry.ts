// SPDX-License-Identifier: MPL-2.0
/**
 * How each element kind's numbers move when a template is placed on a page of
 * another size (axes: x, y, w, h, font size `s`, icon scale `k`). Every top-level
 * number of a kind is either here or in `UNSCALED_FIELDS` with the reason it stays;
 * `templateGeometry.vitest.ts` builds each kind by its factory and goes red on a
 * number that is in neither. Keyed by `stateKey`, as `BINDABLE_FIELDS` is.
 */
import type { GateAdapter, GeometryTable } from '@ggraphic/core';

import { BINDABLE_FIELDS } from '../brand/bindableFields.js';

export const TEMPLATE_GEOMETRY: GeometryTable = {
  additionalTexts: { x: 'x', y: 'y', width: 'w', fontSize: 's', letterSpacing: 's' },
  shapeInstances: { x: 'x', y: 'y', width: 'w', height: 'h', cornerRadius: 's' },
  userImageInstances: { x: 'x', y: 'y', width: 'w', height: 'h' },
  chartInstances: { x: 'x', y: 'y', width: 'w', height: 'h' },
  iconStates: { x: 'x', y: 'y', scale: 'k' },
  frameInstances: {
    x: 'x',
    y: 'y',
    width: 'w',
    height: 'h',
    borderWidth: 's',
    cornerRadius: 's',
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
const INSIDE_FRAME = 'relative to the frame; follows the frame, not the page';

export const UNSCALED_FIELDS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  iconStates: { rotation: ANGLE, opacity: OPACITY },
  additionalTexts: { rotation: ANGLE, scale: RATIO, opacity: OPACITY, lineHeight: RATIO },
  shapeInstances: {
    rotation: ANGLE,
    scaleX: RATIO,
    scaleY: RATIO,
    opacity: OPACITY,
  },
  frameInstances: {
    rotation: ANGLE,
    scaleX: RATIO,
    scaleY: RATIO,
    opacity: OPACITY,
    imageOffsetX: INSIDE_FRAME,
    imageOffsetY: INSIDE_FRAME,
    imageScale: RATIO,
  },
  illustrationInstances: { rotation: ANGLE, opacity: OPACITY },
  circleBadgeInstances: { rotation: ANGLE, scale: RATIO, opacity: OPACITY },
  pillBadgeInstances: { rotation: ANGLE, scale: RATIO, opacity: OPACITY },
  userImageInstances: { rotation: ANGLE, scale: RATIO, opacity: OPACITY },
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
