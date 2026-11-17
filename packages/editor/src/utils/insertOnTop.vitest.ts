// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from 'vitest';

import { brandTestConfig, type BrandTestState } from '../testing/documentBrandConfig.js';
import { buildCanvasItems, buildSortedRenderList, withInsertsOnTop } from './canvasLayerManager.js';

/** A page driven by the config's own actions, the way the canvas binds them. */
function page(layerOrder?: string[]) {
  const config = brandTestConfig('insert-on-top');
  let state: BrandTestState = {
    ...config.createInitialState({}),
    ...(layerOrder ? { layerOrder } : {}),
  };
  const saveToHistory = vi.fn();
  const actions = config.createActions(
    () => state,
    (partial) => {
      const prev = state;
      const next =
        typeof partial === 'function' ? partial(prev) : ({ ...prev, ...partial } as BrandTestState);
      state = withInsertsOnTop(config, prev, next);
    },
    saveToHistory,
    vi.fn(),
    {}
  );
  const renderIds = () =>
    buildSortedRenderList(buildCanvasItems(config, state), state.layerOrder ?? []).map(
      (item) => item.id
    );
  return { actions, renderIds, saveToHistory, getState: () => state };
}

describe('inserts land on top', () => {
  it('draws a new icon above an older chart on a page nobody reordered', () => {
    const { actions, renderIds, getState } = page();
    actions.addChart('bar');
    actions.toggleIcon('home', true);
    const ids = renderIds();
    const icon = getState().selectedIcons[0]!;
    const chart = getState().chartInstances[0]!.id;
    expect(ids.at(-1)).toBe(icon);
    expect(ids.indexOf(chart)).toBeLessThan(ids.indexOf(icon));
  });

  it('keeps the existing order and adds on top when layerOrder is set', () => {
    const { actions, renderIds, getState } = page(['text-1', 'background']);
    actions.addChart('bar');
    const chart = getState().chartInstances[0]!.id;
    const before = renderIds();
    actions.toggleIcon('home', true);
    const after = renderIds();
    expect(after.slice(0, -1)).toEqual(before);
    expect(after.at(-1)).toBe(getState().selectedIcons[0]);
    expect(after).toContain(chart);
  });

  it('leaves template elements and background planes where they were', () => {
    const { actions, renderIds } = page();
    actions.addChart('bar');
    actions.toggleIcon('home', true);
    expect(renderIds()[0]).toBe('background');
  });

  it('writes no history entry of its own', () => {
    const { actions, saveToHistory } = page();
    actions.addChart('bar');
    expect(saveToHistory).toHaveBeenCalledTimes(1);
    actions.toggleIcon('home', true);
    expect(saveToHistory).toHaveBeenCalledTimes(2);
  });

  it('does not touch layerOrder when nothing was inserted', () => {
    const { actions, getState } = page();
    actions.addChart('bar');
    actions.updateChart(getState().chartInstances[0]!.id, { x: 5 });
    const order = getState().layerOrder;
    actions.updateChart(getState().chartInstances[0]!.id, { x: 6 });
    expect(getState().layerOrder).toBe(order);
  });
});
