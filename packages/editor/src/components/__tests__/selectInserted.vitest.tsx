// SPDX-License-Identifier: MPL-2.0
/**
 * An element added from the sidebar is selected, and only it (#162): before, the previous selection
 * stayed and the new element had to be found and clicked first.
 */
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GenericCanvas } from '../GenericCanvas.js';
import { loadCanvasConfig } from '../../configs/configLoader.js';
import { AutoSaveStoreProvider } from '../../stores/AutoSaveStoreProvider.js';

import '../../testing/fixtureTemplates';

import type * as StoreModule from '../../stores/createCanvasEditorStore.js';
import type { CanvasEditorStoreApi } from '../../stores/createCanvasEditorStore.js';

const stores = vi.hoisted(() => [] as unknown[]);
vi.mock('../../stores/createCanvasEditorStore.js', async (importOriginal) => {
  const original = await importOriginal<typeof StoreModule>();
  return {
    ...original,
    createCanvasEditorStore: (...args: Parameters<typeof original.createCanvasEditorStore>) => {
      const store = original.createCanvasEditorStore(...args);
      stores.push(store);
      return store;
    },
  };
});

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

type Actions = {
  addText: () => void;
  addShape: (type: string) => void;
  toggleIcon: (id: string, selected: boolean) => void;
  setBackgroundColor: (color: string) => void;
};
type ListState = Record<string, { id: string }[]> & { selectedIcons: string[] };

async function mountCanvas() {
  const config = await loadCanvasConfig('fixture-poster');
  const live = { state: {} as ListState, actions: {} as Actions };
  stores.length = 0;
  await act(async () => {
    render(
      <AutoSaveStoreProvider>
        <GenericCanvas
          config={config as never}
          initialProps={{}}
          onExport={() => {}}
          onCancel={() => {}}
          autoSave={false}
          onLiveState={(state, actions) => {
            live.state = state as ListState;
            live.actions = actions as unknown as Actions;
          }}
        />
      </AutoSaveStoreProvider>
    );
  });
  const store = stores[stores.length - 1] as CanvasEditorStoreApi;
  const selected = () => store.getState().selectedLayerIds;
  return { live, store, selected };
}

describe('an inserted element is selected (#162)', () => {
  it('selects a new text, then a new shape instead of the text, then a new icon', async () => {
    const { live, selected } = await mountCanvas();

    await act(async () => {
      live.actions.addText();
    });
    const text = live.state.additionalTexts!.at(-1)!.id;
    expect(selected()).toEqual([text]);

    await act(async () => {
      live.actions.addShape('rect');
    });
    const shape = live.state.shapeInstances!.at(-1)!.id;
    expect(selected()).toEqual([shape]);

    await act(async () => {
      live.actions.toggleIcon('home', true);
    });
    expect(selected()).toEqual([live.state.selectedIcons.at(-1)]);
  }, 90_000);

  it('leaves the selection alone for an edit that inserts nothing', async () => {
    const { live, store, selected } = await mountCanvas();
    await act(async () => {
      live.actions.addShape('rect');
    });
    const shape = live.state.shapeInstances!.at(-1)!.id;
    await act(async () => {
      store.getState().setSelectedLayers([]);
    });

    await act(async () => {
      live.actions.setBackgroundColor('#123456');
    });
    expect(selected()).toEqual([]);
    expect(live.state.shapeInstances!.map((s) => s.id)).toEqual([shape]);
  }, 90_000);
});
