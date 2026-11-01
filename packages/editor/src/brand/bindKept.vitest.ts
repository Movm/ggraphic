// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { applyOperation } from '../ai/applyOperation.js';
import { placeBlock, translateBlock, type LiftedBlock } from '../blocks/liftedBlock.js';

import { createShapeActions } from '../configs/factory/actionFactories.js';
import { carryInstanceState } from '../configs/factory/carryInstanceState.js';
import { duplicateElementInState, insertInstance } from '../utils/duplicateElement.js';
import { createShape } from '../utils/shapes.js';

import type { BaseCanvasState } from '../configs/factory/baseTypes.js';
import type { Bindings } from '@ggraphic/core';

/**
 * No writer of the editor core builds an instance field by field, so each
 * should hand `bind` on as it is. These tests keep it that way: one per writer.
 */

const BIND: Bindings = { fill: { ref: 'brand.primary', value: '#1d3557' } };

const shape = { ...createShape('rect', 10, 20, '#1d3557'), id: 'shape-1', bind: BIND };

/** One bound instance of every list kind, and an icon, under the keys the duplicator reads. */
function boundState() {
  const base = { x: 10, y: 20, bind: BIND };
  return {
    shapeInstances: [shape],
    additionalTexts: [{ id: 'text-1', ...base }],
    illustrationInstances: [{ id: 'ill-1', ...base }],
    assetInstances: [{ id: 'asset-1', ...base }],
    pillBadgeInstances: [{ id: 'pill-1', ...base }],
    circleBadgeInstances: [{ id: 'circle-1', ...base, textLines: [{ text: 'A' }] }],
    frameInstances: [{ id: 'frame-1', ...base, imageSrc: 'blob:abc' }],
    userImageInstances: [{ id: 'img-1', ...base, src: 'blob:def' }],
    chartInstances: [
      { id: 'chart-1', ...base, data: [{ name: 'a', value: 1 }], colors: ['#1D3557'] },
    ],
    selectedIcons: ['tabler-sun'],
    iconStates: { 'tabler-sun': { x: 10, y: 20, scale: 1, rotation: 0, bind: BIND } },
  } as unknown as BaseCanvasState;
}

const LISTS = [
  ['shape', 'shapeInstances', 'shape-1'],
  ['additional-text', 'additionalTexts', 'text-1'],
  ['illustration', 'illustrationInstances', 'ill-1'],
  ['asset', 'assetInstances', 'asset-1'],
  ['pill-badge', 'pillBadgeInstances', 'pill-1'],
  ['circle-badge', 'circleBadgeInstances', 'circle-1'],
  ['frame', 'frameInstances', 'frame-1'],
  ['user-image', 'userImageInstances', 'img-1'],
  ['chart', 'chartInstances', 'chart-1'],
] as const;

const listOf = (state: BaseCanvasState, key: string) =>
  (state as unknown as Record<string, { id: string; bind?: Bindings }[]>)[key]!;

describe('duplicate keeps bind', () => {
  it.each(LISTS)('on a %s', (_kind, key, id) => {
    const result = duplicateElementInState(boundState(), id)!;
    const copy = listOf(result.state, key).find((e) => e.id === result.newId)!;
    expect(copy.bind).toEqual(BIND);
  });

  it('on an icon', () => {
    const result = duplicateElementInState(boundState(), 'tabler-sun')!;
    expect(result.state.iconStates![result.newId]!.bind).toEqual(BIND);
  });
});

describe('paste keeps bind', () => {
  it.each(LISTS)('on a %s', (kind, key, id) => {
    const data = listOf(boundState(), key).find((e) => e.id === id)!;
    const { state, newId } = insertInstance(
      {} as BaseCanvasState,
      { type: kind, data } as Parameters<typeof insertInstance>[1]
    );
    expect(listOf(state, key).find((e) => e.id === newId)!.bind).toEqual(BIND);
  });
});

describe('AI update op keeps bind', () => {
  it('on a shape moved by update-element', () => {
    let state = { shapeInstances: [shape] };
    const actions = createShapeActions(
      () => state,
      (update) => {
        state = typeof update === 'function' ? update(state) : { ...state, ...update };
      },
      () => {},
      () => {},
      1080,
      1350
    );
    const result = applyOperation(
      { kind: 'update-element', elementId: 'shape-1', patch: { x: 99 } } as never,
      actions as never,
      () => state,
      { supportedOperations: ['update-element'], describeForAi: () => ({}) } as never
    );
    expect(result).toEqual({ ok: true });
    expect(state.shapeInstances[0]).toMatchObject({ x: 99, bind: BIND });
  });
});

describe('block lift keeps bind', () => {
  const full = boundState() as unknown as Record<string, unknown[]>;
  const block = {
    additionalTexts: full.additionalTexts,
    shapeInstances: full.shapeInstances,
    assetInstances: full.assetInstances,
    chartInstances: full.chartInstances,
    userImageInstances: full.userImageInstances,
    pillBadgeInstances: full.pillBadgeInstances,
    circleBadgeInstances: full.circleBadgeInstances,
    selectedIcons: ['tabler-sun'],
    iconStates: { 'tabler-sun': { x: 10, y: 20, scale: 1, rotation: 0, bind: BIND } },
    layerOrder: [],
    bounds: { x: 10, y: 20, width: 100, height: 100 },
  } as unknown as LiftedBlock;

  const LIFTED = [
    'additionalTexts',
    'shapeInstances',
    'assetInstances',
    'chartInstances',
    'userImageInstances',
    'pillBadgeInstances',
    'circleBadgeInstances',
  ] as const;

  it('through translateBlock', () => {
    const moved = translateBlock(block, 5, 5);
    for (const key of LIFTED) expect(moved[key][0]!.bind, key).toEqual(BIND);
    expect(moved.iconStates['tabler-sun']!.bind).toEqual(BIND);
  });

  it('through placeBlock', () => {
    const placed = placeBlock(block, { x: 500, y: 500 }, { width: 1080, height: 1350 });
    for (const key of LIFTED) expect(placed[key][0]!.bind, key).toEqual(BIND);
  });
});
