// SPDX-License-Identifier: AGPL-3.0-only
/**
 * An upload's durable URL is not an undo step (#161). The file is placed at once with a `blob:`
 * preview, and the upload's URL arrives later. Undo and redo must never bring the preview back:
 * it is revoked, and a saved document would keep a URL that means nothing after the session.
 */
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { GenericCanvas, type GenericCanvasRef } from '../GenericCanvas.js';
import { loadCanvasConfig } from '../../configs/configLoader.js';
import { createUserImageActions } from '../../configs/factory/actionFactories.js';
import { AutoSaveStoreProvider } from '../../stores/AutoSaveStoreProvider.js';

import '../../testing/fixtureTemplates';

import type * as StoreModule from '../../stores/createCanvasEditorStore.js';
import type { CanvasEditorStoreApi } from '../../stores/createCanvasEditorStore.js';
import type { UserImageInstance } from '../../utils/userImageUtils.js';

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

const BLOB = 'blob:http://localhost/preview-1';
const DURABLE = 'https://media.example/upload-1.jpg';
const revoked: string[] = [];

// jsdom loads no images: the placement's size probe gets one that loads at once. Only that one,
// the canvas draws real images.
const realImage = globalThis.Image;
class LoadedImage {
  naturalWidth = 1200;
  naturalHeight = 900;
  width = 1200;
  height = 900;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin: string | null = null;
  constructor() {
    globalThis.Image = realImage;
  }
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
beforeAll(() => {
  URL.createObjectURL = () => BLOB;
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };
});
afterAll(() => {
  URL.createObjectURL = original.create;
  URL.revokeObjectURL = original.revoke;
});

type UploadActions = {
  placeUserImageFromFile: (file: File) => Promise<string>;
  updateUserImage: (id: string, partial: Partial<UserImageInstance>) => void;
  removeUserImage: (id: string) => void;
  discardPlacedUserImage: (id: string) => void;
};

async function mountCanvas() {
  const poster = await loadCanvasConfig('fixture-poster');
  const config = {
    ...poster,
    createActions: (...args: Parameters<typeof poster.createActions>) => {
      const [getState, setState, saveToHistory, debouncedSaveToHistory, , history] = args;
      return {
        ...poster.createActions(...args),
        ...createUserImageActions(
          getState as () => { userImageInstances: UserImageInstance[] },
          setState as never,
          saveToHistory,
          debouncedSaveToHistory,
          1080,
          1350,
          history
        ),
      };
    },
  };
  const live: { state: Record<string, unknown>; actions: Record<string, unknown> } = {
    state: {},
    actions: {},
  };
  const ref = createRef<GenericCanvasRef>();
  stores.length = 0;

  await act(async () => {
    render(
      <AutoSaveStoreProvider>
        <GenericCanvas
          forwardedRef={ref}
          config={config as never}
          initialProps={{}}
          onExport={() => {}}
          onCancel={() => {}}
          autoSave={false}
          onLiveState={(state, actions) => {
            live.state = state;
            live.actions = actions;
          }}
        />
      </AutoSaveStoreProvider>
    );
  });

  const store = stores[stores.length - 1] as CanvasEditorStoreApi;
  await vi.waitFor(() => expect(store.getState().history).toHaveLength(1));
  const actions = () => live.actions as unknown as UploadActions;
  const images = () => live.state.userImageInstances as UserImageInstance[];
  const historyJson = () => JSON.stringify(store.getState().history);
  return { ref, actions, images, historyJson, store };
}

const file = () => {
  globalThis.Image = LoadedImage as unknown as typeof Image;
  return new File(['x'], 'qa-upload.jpg', { type: 'image/jpeg' });
};

describe('the upload URL swap (#161)', () => {
  it('replaces the preview in the history: undo removes the image, redo brings the durable URL', async () => {
    const { ref, actions, images, historyJson, store } = await mountCanvas();

    let id = '';
    await act(async () => {
      id = await actions().placeUserImageFromFile(file());
    });
    expect(images()[0]?.src).toBe(BLOB);
    const steps = store.getState().history.length;

    // The upload ends long after any debounce window.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      actions().updateUserImage(id, { src: DURABLE });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    expect(images()[0]?.src).toBe(DURABLE);
    expect(store.getState().history).toHaveLength(steps);
    expect(historyJson()).not.toContain('blob:');
    expect(revoked).toContain(BLOB);

    await act(async () => {
      ref.current!.undo!();
    });
    expect(images()).toHaveLength(0);

    await act(async () => {
      ref.current!.redo!();
    });
    expect(images()[0]?.src).toBe(DURABLE);
  }, 90_000);

  it('swaps the preview in the redo entries when the image was undone during the upload', async () => {
    const { ref, actions, images, historyJson } = await mountCanvas();

    let id = '';
    await act(async () => {
      id = await actions().placeUserImageFromFile(file());
    });
    await act(async () => {
      ref.current!.undo!();
    });
    expect(images()).toHaveLength(0);

    await act(async () => {
      actions().updateUserImage(id, { src: DURABLE });
    });
    expect(historyJson()).not.toContain('blob:');

    await act(async () => {
      ref.current!.redo!();
    });
    expect(images()[0]?.src).toBe(DURABLE);
  }, 90_000);
});

describe('a failed upload (#170)', () => {
  it('takes the image out of the history: no undo step brings the revoked preview back', async () => {
    const { ref, actions, images, historyJson, store } = await mountCanvas();
    const before = store.getState().history.length;

    let id = '';
    await act(async () => {
      id = await actions().placeUserImageFromFile(file());
    });
    await act(async () => {
      actions().discardPlacedUserImage(id);
    });

    expect(images()).toHaveLength(0);
    expect(revoked).toContain(BLOB);
    expect(historyJson()).not.toContain('blob:');
    expect(store.getState().history).toHaveLength(before);
    expect(store.getState().canUndo()).toBe(false);

    await act(async () => {
      ref.current!.undo!();
    });
    expect(images()).toHaveLength(0);
  }, 90_000);

  it('drops the preview from the redo entries when the image was undone during the upload', async () => {
    const { ref, actions, images, historyJson, store } = await mountCanvas();

    let id = '';
    await act(async () => {
      id = await actions().placeUserImageFromFile(file());
    });
    await act(async () => {
      ref.current!.undo!();
    });
    await act(async () => {
      actions().discardPlacedUserImage(id);
    });

    expect(historyJson()).not.toContain('blob:');
    expect(store.getState().canRedo()).toBe(false);
    await act(async () => {
      ref.current!.redo!();
    });
    expect(images()).toHaveLength(0);
  }, 90_000);

  it('leaves a user delete undoable', async () => {
    const { ref, actions, images } = await mountCanvas();

    let id = '';
    await act(async () => {
      id = await actions().placeUserImageFromFile(file());
    });
    await act(async () => {
      actions().updateUserImage(id, { src: DURABLE });
    });
    await act(async () => {
      actions().removeUserImage(id);
    });
    expect(images()).toHaveLength(0);

    await act(async () => {
      ref.current!.undo!();
    });
    expect(images()[0]?.src).toBe(DURABLE);
  }, 90_000);
});
