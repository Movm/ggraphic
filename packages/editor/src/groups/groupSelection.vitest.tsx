// SPDX-License-Identifier: MPL-2.0
/**
 * Page groups in the editor: a click on a member selects the group, ungroup
 * and delete write `groups` in one history step, and a duplicated page keeps
 * groups that point at its own element ids.
 */
import { act, render } from '@testing-library/react';
import { useCallback, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { describe, expect, it, vi } from 'vitest';

import { duplicatePageById, readPages, seedPagesIfEmpty } from '@ggraphic/editor/collab/pagesDoc';
import { useCanvasHistorySetup } from '@ggraphic/editor/hooks/useCanvasHistorySetup';
import { useCanvasInteractions } from '@ggraphic/editor/hooks/useCanvasInteractions';
import { CanvasStoreProvider, useCanvasStore } from '@ggraphic/editor/stores/CanvasStoreProvider';
import { CANVAS_COMMANDS, commandForKey } from '@ggraphic/editor/utils/canvasCommandRegistry';
import { createCanvasCommands, type CanvasCommands } from '@ggraphic/editor/utils/canvasCommands';

import { readGroups, type PageGroup } from './pageGroups.js';

import type { BaseCanvasState } from '@ggraphic/editor/configs/factory/baseTypes';
import type { LayoutResult } from '@ggraphic/editor/configs/types';
import type { CanvasEditorStoreApi } from '@ggraphic/editor/stores/createCanvasEditorStore';
import type { CanvasItem } from '@ggraphic/editor/utils/canvasLayerManager';

type Text = { id: string; text: string; x: number; y: number };
type PageState = {
  additionalTexts: Text[];
  layerOrder: string[];
  groups: PageGroup[];
};

const texts = (...ids: string[]): Text[] => ids.map((id, i) => ({ id, text: id, x: i, y: i }));

interface Harness {
  store: CanvasEditorStoreApi;
  commands: CanvasCommands;
  click: (id: string) => void;
  state: () => PageState;
}

function Page({ initial, onReady }: { initial: PageState; onReady: (h: Harness) => void }) {
  const [state, setState] = useState<PageState>(initial);
  const stateRef = useRef(state);
  stateRef.current = state;
  const collect = useCallback(() => state, [state]);
  const { saveToHistory, runHistoryBatch } = useCanvasHistorySetup<PageState>(
    collect,
    (restored) => setState(restored),
    500,
    false
  );
  const store = useCanvasStore();
  const getGroups = useCallback(() => readGroups(stateRef.current), []);
  const { selectElement } = useCanvasInteractions({
    stageRef: { current: null },
    marqueeEnabled: false,
    getGroups,
  });
  const commands = useMemo(
    () =>
      createCanvasCommands<BaseCanvasState>({
        store,
        getState: () => stateRef.current as unknown as BaseCanvasState,
        setState: (next) =>
          setState((prev) =>
            typeof next === 'function'
              ? (next(prev as never) as unknown as PageState)
              : { ...prev, ...(next as Partial<PageState>) }
          ),
        saveToHistory: (s) => saveToHistory(s as unknown as PageState),
        runHistoryBatch,
        getActions: () => ({
          removeAdditionalText: (id: string) =>
            setState((prev) => ({
              ...prev,
              additionalTexts: prev.additionalTexts.filter((t) => t.id !== id),
              layerOrder: prev.layerOrder.filter((i) => i !== id),
            })),
        }),
        template: () => null,
        getRenderList: () =>
          stateRef.current.additionalTexts.map(
            (data) => ({ id: data.id, type: 'additional-text', data }) as unknown as CanvasItem
          ),
        getStage: () => null,
        logicalScale: () => 1,
        getElements: () => [],
        getLayout: () => ({}) as LayoutResult,
        isReadOnly: () => false,
        getPageSize: () => ({ width: 1000, height: 500 }),
      }),
    [store, saveToHistory, runHistoryBatch]
  );
  onReady({ store, commands, click: selectElement, state: () => state });
  return null;
}

async function mount(groups: PageGroup[], ids = ['a', 'b', 'c']): Promise<() => Harness> {
  let h!: Harness;
  await act(async () => {
    render(
      <CanvasStoreProvider>
        <Page
          initial={{ additionalTexts: texts(...ids), layerOrder: ids, groups }}
          onReady={(x) => (h = x)}
        />
      </CanvasStoreProvider>
    );
  });
  await vi.waitFor(() => expect(h.store.getState().history).toHaveLength(1));
  return () => h;
}

const selected = (h: Harness) => h.store.getState().selectedLayerIds;

describe('page groups in the editor', () => {
  it('clicking a member selects the whole group', async () => {
    const h = await mount([{ id: 'g', elementIds: ['a', 'b'] }]);
    act(() => h().click('a'));
    expect(selected(h())).toEqual(['a', 'b']);
  });

  it('clicking an ungrouped element selects it alone', async () => {
    const h = await mount([{ id: 'g', elementIds: ['a', 'b'] }]);
    act(() => h().click('c'));
    expect(selected(h())).toEqual(['c']);
  });

  it('a second click selects the member alone', async () => {
    const h = await mount([{ id: 'g', elementIds: ['a', 'b'] }]);
    act(() => h().click('a'));
    act(() => h().click('b'));
    expect(selected(h())).toEqual(['b']);
  });

  it('ungroup removes the group and keeps the elements', async () => {
    const h = await mount([{ id: 'g', elementIds: ['a', 'b'] }]);
    act(() => h().click('a'));
    expect(h().commands.capabilities().canUngroup).toBe(true);
    act(() => h().commands.ungroup());
    expect(h().state().groups).toEqual([]);
    expect(
      h()
        .state()
        .additionalTexts.map((t) => t.id)
    ).toEqual(['a', 'b', 'c']);
  });

  it('ungroup does nothing unless the selection holds a whole group', async () => {
    const h = await mount([{ id: 'g', elementIds: ['a', 'b'] }]);
    act(() => h().store.getState().setSelectedLayers(['a']));
    expect(h().commands.capabilities().canUngroup).toBe(false);
    act(() => h().commands.ungroup());
    expect(h().state().groups).toHaveLength(1);
  });

  it('deleting a member keeps the rest grouped until one is left', async () => {
    const h = await mount([{ id: 'g', elementIds: ['a', 'b', 'c'] }]);
    act(() => h().store.getState().setSelectedLayers(['a']));
    await act(async () => h().commands.remove());
    expect(h().state().groups).toEqual([{ id: 'g', elementIds: ['b', 'c'] }]);
    act(() => h().store.getState().setSelectedLayers(['b']));
    await act(async () => h().commands.remove());
    expect(h().state().groups).toEqual([]);
    expect(
      h()
        .state()
        .additionalTexts.map((t) => t.id)
    ).toEqual(['c']);
  });

  it('undo restores the group in one step', async () => {
    const h = await mount([{ id: 'g', elementIds: ['a', 'b', 'c'] }]);
    act(() => h().store.getState().setSelectedLayers(['a']));
    await act(async () => h().commands.remove());
    expect(h().state().groups[0]!.elementIds).toEqual(['b', 'c']);
    await act(async () => h().store.getState().undo());
    expect(h().state().groups).toEqual([{ id: 'g', elementIds: ['a', 'b', 'c'] }]);
    expect(
      h()
        .state()
        .additionalTexts.map((t) => t.id)
    ).toEqual(['a', 'b', 'c']);
  });

  it("a duplicated page's groups point at the duplicate's ids", () => {
    const doc = new Y.Doc();
    const state = {
      additionalTexts: texts('a', 'b'),
      groups: [{ id: 'g', elementIds: ['a', 'b'] }],
    };
    seedPagesIfEmpty(doc, [{ id: 'p1', configId: 'free', state }]);
    expect(duplicatePageById(doc, 'p1', 'copy')).toBe(true);
    const copy = readPages(doc)[1]!.state as typeof state;
    const live = new Set(copy.additionalTexts.map((t) => t.id));
    expect(copy.groups).toHaveLength(1);
    expect(copy.groups[0]!.elementIds.every((id) => live.has(id))).toBe(true);
  });

  it('the ungroup shortcut is listed in the command registry', () => {
    expect(CANVAS_COMMANDS.ungroup.shortcut).toEqual({
      key: 'g',
      mod: true,
      shift: true,
      alsoKeys: [],
    });
    const press = { key: 'G', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false };
    expect(commandForKey(press)).toBe('ungroup');
  });
});
