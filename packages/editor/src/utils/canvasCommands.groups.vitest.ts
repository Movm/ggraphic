// SPDX-License-Identifier: MPL-2.0
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasClipboard } from '@ggraphic/editor/utils/canvasClipboard';
import { createCanvasEditorStore } from '@ggraphic/editor/stores/createCanvasEditorStore';
import { createCanvasCommands } from '@ggraphic/editor/utils/canvasCommands';

import type { BaseCanvasState } from '@ggraphic/editor/configs/factory/baseTypes';
import type { LayoutResult } from '@ggraphic/editor/configs/types';
import type { CanvasItem } from '@ggraphic/editor/utils/canvasLayerManager';

/** Copy and paste carry a grouped selection's group (page key `groups`, F0). */

type Text = { id: string; text: string; x: number; y: number };

function page(texts: Text[], groups: unknown[] = []) {
  let current = {
    additionalTexts: texts,
    layerOrder: texts.map((t) => t.id),
    groups,
  } as Record<string, unknown>;
  const announce = vi.fn<(text: string) => void>();
  const store = createCanvasEditorStore();
  const items = (): CanvasItem[] =>
    (current.additionalTexts as Text[]).map(
      (data) => ({ id: data.id, type: 'additional-text', data }) as unknown as CanvasItem
    );
  const commands = createCanvasCommands<BaseCanvasState>({
    store,
    getState: () => current as unknown as BaseCanvasState,
    setState: (next) => {
      current = typeof next === 'function' ? next(current as never) : { ...current, ...next };
    },
    saveToHistory: vi.fn(),
    runHistoryBatch: (fn) => fn(),
    getActions: () => ({
      removeAdditionalText: (id: string) => {
        current = {
          ...current,
          additionalTexts: (current.additionalTexts as Text[]).filter((t) => t.id !== id),
        };
      },
    }),
    template: () => null,
    getRenderList: items,
    getStage: () => null,
    logicalScale: () => 1,
    getElements: () => [],
    getLayout: () => ({}) as LayoutResult,
    isReadOnly: () => false,
    getPageSize: () => ({ width: 1000, height: 500 }),
    announce,
  });
  return {
    commands,
    announce,
    select: (...ids: string[]) => store.getState().setSelectedLayers(ids),
    state: () => current,
  };
}

const three = (): Text[] => [
  { id: 't1', text: 'Klimaschutz', x: 0, y: 0 },
  { id: 't2', text: 'Wärme', x: 10, y: 10 },
  { id: 't3', text: 'Verkehr', x: 20, y: 20 },
];
const blockRef = { id: 'block-a', version: 2 };

describe('copy and paste of a grouped selection', () => {
  beforeEach(() => CanvasClipboard.clear());

  it('recreates the group over the pasted elements, with a fresh id and the same blockRef', () => {
    const p = page(three(), [{ id: 'g1', blockRef, elementIds: ['t1', 't2'] }]);
    p.select('t1', 't2');
    p.commands.copy();
    p.commands.paste(null);

    const state = p.state() as {
      groups: { id: string; blockRef?: unknown; elementIds: string[] }[];
      additionalTexts: Text[];
    };
    expect(state.groups).toHaveLength(2);
    expect(state.groups[0]).toEqual({ id: 'g1', blockRef, elementIds: ['t1', 't2'] });
    const pasted = state.groups[1]!;
    expect(pasted.id).not.toBe('g1');
    expect(pasted.blockRef).toEqual(blockRef);
    const created = state.additionalTexts
      .map((t) => t.id)
      .filter((id) => !['t1', 't2', 't3'].includes(id));
    expect(created).toHaveLength(2);
    expect([...pasted.elementIds].sort()).toEqual([...created].sort());
  });

  it('pastes twice into two groups with different ids', () => {
    const p = page(three(), [{ id: 'g1', elementIds: ['t1', 't2'] }]);
    p.select('t1', 't2');
    p.commands.copy();
    p.commands.paste(null);
    p.commands.paste(null);
    const groups = (p.state() as { groups: { id: string }[] }).groups;
    expect(new Set(groups.map((g) => g.id)).size).toBe(3);
  });

  it('does not group a selection that holds only part of a group', () => {
    const p = page(three(), [{ id: 'g1', elementIds: ['t1', 't2'] }]);
    p.select('t1', 't3');
    p.commands.copy();
    p.commands.paste(null);
    expect((p.state() as { groups: unknown[] }).groups).toHaveLength(1);
  });

  it('adds no groups key to a page that had none', () => {
    const p = page(three());
    p.select('t1', 't2');
    p.commands.copy();
    p.commands.paste(null);
    expect((p.state() as { groups: unknown[] }).groups ?? []).toHaveLength(0);
  });
});
