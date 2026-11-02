// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Ein Text, der gerade getippt wird, steht auf der Zeichenfläche so, wie die Übernahme ihn
 * hinterlässt (Schrift, anliegende Platten) — aber nicht in der Seite: kein Seitenzustand, kein
 * Host-Callback (der Y.Doc, Speichern und Vorschaubilder hängen daran), kein Verlaufseintrag.
 * Erst das Übernehmen schreibt, in einem Schritt.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import Konva from 'konva';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { commitOpenTextEdit } from '../CanvasTextOverlay.js';
import { GenericCanvas } from '../GenericCanvas.js';
import { loadCanvasConfig } from '../../configs/configLoader.js';
import { AutoSaveStoreProvider } from '../../stores/AutoSaveStoreProvider.js';
import { captureStageImage } from '../../utils/captureStage.js';
import { createShape } from '../../utils/shapes.js';

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

vi.mock('../../utils/captureStage.js', () => ({
  captureStageImage: vi.fn(() => 'blob:fixture-capture'),
}));
// Das eigentliche Speichern (Share-Store, Netz) ist nicht Gegenstand hier.
vi.mock('../../hooks/useCanvasAutoSave.js', () => ({
  useCanvasAutoSave: () => ({ status: 'idle', shareToken: null, retry: async () => {} }),
}));

vi.mock('../RichTextField.js', () => ({
  RichTextField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Entwurf" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

afterEach(cleanup);

const PLATE_FILL = '#112233';
const TEXT = {
  id: 't1',
  text: 'Hallo',
  type: 'body',
  x: 100,
  y: 200,
  width: 600,
  fontSize: 48,
  fontFamily: 'Arial',
  fill: '#ffffff',
};
const PLATE = {
  ...createShape('rect', 80, 180, PLATE_FILL),
  id: 'plate-1',
  width: 100,
  height: 90,
};

/** What a host fits a text to: smaller and wider the longer it is. */
const fontFor = (text: string) => 60 - text.length * 2;
const plateFor = (text: string) => text.length * 20;

type Page = { additionalTexts: (typeof TEXT)[]; shapeInstances: (typeof PLATE)[] };

async function mountPage(autoSave = false) {
  const base = await loadCanvasConfig('fixture-poster');
  // The fixture template plus what the Studio's actions do: preview a draft without writing it,
  // and commit a text with its fitted size and plate in one state change.
  const config = {
    ...base,
    createActions: (
      getState: () => Page,
      setState: (change: (prev: Page) => Page) => void,
      ...rest: unknown[]
    ) => {
      const actions = (base.createActions as (...args: unknown[]) => Record<string, unknown>)(
        getState,
        setState,
        ...rest
      );
      return {
        ...actions,
        previewAdditionalText: (id: string, draft: string) => ({
          fontSize: fontFor(draft),
          overrides: {
            additionalTexts: getState().additionalTexts.map((t) =>
              t.id === id ? { ...t, fontSize: fontFor(draft) } : t
            ),
            shapeInstances: getState().shapeInstances.map((s) => ({
              ...s,
              width: plateFor(draft),
            })),
          },
        }),
        updateAdditionalText: (id: string, partial: { text?: string }) => {
          setState((prev) => ({
            ...prev,
            additionalTexts: prev.additionalTexts.map((t) =>
              t.id === id
                ? {
                    ...t,
                    ...partial,
                    ...(partial.text === undefined ? {} : { fontSize: fontFor(partial.text) }),
                  }
                : t
            ),
            shapeInstances: prev.shapeInstances.map((s) =>
              partial.text === undefined ? s : { ...s, width: plateFor(partial.text) }
            ),
          }));
          (rest[1] as (state?: Page) => void)(getState());
        },
      };
    },
  };

  const live: { state: Page; actions: Record<string, unknown> } = {
    state: { additionalTexts: [], shapeInstances: [] },
    actions: {},
  };
  const onAdditionalTextsChange = vi.fn();
  const onShapeInstancesChange = vi.fn();
  stores.length = 0;
  await act(async () => {
    render(
      <AutoSaveStoreProvider>
        <GenericCanvas
          config={config as never}
          initialProps={{ additionalTexts: [TEXT], shapeInstances: [PLATE] }}
          callbacks={{ onAdditionalTextsChange, onShapeInstancesChange }}
          onExport={() => {}}
          onCancel={() => {}}
          autoSave={autoSave}
          onLiveState={(state, actions) => {
            live.state = state as unknown as Page;
            live.actions = actions;
          }}
        />
      </AutoSaveStoreProvider>
    );
  });
  const store = stores[stores.length - 1] as CanvasEditorStoreApi;
  await vi.waitFor(() => expect(store.getState().history).toHaveLength(1));

  const stage = () => Konva.stages[Konva.stages.length - 1]!;
  const drawn = {
    fontSize: () => stage().findOne('#t1')!.getAttr('fontSize') as number,
    plateWidth: () =>
      stage()
        .find('Rect')
        .find((node) => node.getAttr('fill') === PLATE_FILL)!
        .getAttr('width') as number,
  };

  act(() => {
    stage().findOne('#t1')!.fire('dblclick');
  });
  const field = await screen.findByLabelText('Entwurf');
  const type = (value: string) => fireEvent.change(field, { target: { value } });
  const emitted = () =>
    [onAdditionalTextsChange, onShapeInstancesChange].flatMap((f) => f.mock.calls);

  return { live, store, drawn, type, emitted, onAdditionalTextsChange, onShapeInstancesChange };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 700));

describe('Vorschau beim Tippen auf der Seite', () => {
  it('zeigt Schrift und Platte des Entwurfs, ohne Seitenzustand, Host oder Verlauf zu berühren', async () => {
    const { live, store, drawn, type, emitted } = await mountPage();
    const before = live.state;
    const history = store.getState().history.length;
    expect(drawn.fontSize()).toBe(48);
    expect(drawn.plateWidth()).toBe(100);

    type('Hallo Welt');

    expect(drawn.fontSize()).toBe(fontFor('Hallo Welt'));
    expect(drawn.plateWidth()).toBe(plateFor('Hallo Welt'));
    // Nichts davon steht in der Seite: derselbe Zustand, nichts an den Host gemeldet.
    expect(live.state).toBe(before);
    expect(live.state.additionalTexts[0]!.fontSize).toBe(48);
    expect(live.state.shapeInstances[0]!.width).toBe(100);
    expect(emitted()).toEqual([]);

    // Auch der entprellte Verlaufsschritt bleibt aus.
    await act(settle);
    expect(store.getState().history).toHaveLength(history);
    expect(emitted()).toEqual([]);
  }, 90_000);

  it('schreibt beim Übernehmen einmal: Text, Schrift und Platte, ein Verlaufsschritt', async () => {
    const { live, store, drawn, type, emitted, onAdditionalTextsChange, onShapeInstancesChange } =
      await mountPage();
    const index = store.getState().historyIndex;

    type('Hallo');
    type('Hallo Welt');
    act(() => commitOpenTextEdit());

    expect(live.state.additionalTexts[0]).toMatchObject({
      text: 'Hallo Welt',
      fontSize: fontFor('Hallo Welt'),
    });
    expect(live.state.shapeInstances[0]!.width).toBe(plateFor('Hallo Welt'));
    // Die Seite zeigt dasselbe wie die Vorschau, es gibt keinen Sprung.
    expect(drawn.fontSize()).toBe(fontFor('Hallo Welt'));
    expect(drawn.plateWidth()).toBe(plateFor('Hallo Welt'));
    expect(onAdditionalTextsChange).toHaveBeenCalledTimes(1);
    expect(onShapeInstancesChange).toHaveBeenCalledTimes(1);
    expect(emitted()).toHaveLength(2);

    await act(settle);
    expect(store.getState().historyIndex).toBe(index + 1);
  }, 90_000);

  it('hinterlässt keine Spur, wenn der Entwurf unverändert abgeschlossen wird', async () => {
    const { live, store, drawn, type, emitted } = await mountPage();
    const before = live.state;
    const history = store.getState().history.length;

    type('Hallo Welt');
    type('Hallo');
    act(() => commitOpenTextEdit());

    expect(drawn.fontSize()).toBe(48);
    expect(drawn.plateWidth()).toBe(100);
    expect(live.state).toBe(before);
    expect(emitted()).toEqual([]);
    await act(settle);
    expect(store.getState().history).toHaveLength(history);
  }, 90_000);
});

describe('Vorschau beim Tippen und das Vorschaubild der Seite', () => {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('nimmt das Bild erst auf, wenn der Entwurf abgeschlossen ist', async () => {
    vi.mocked(captureStageImage).mockClear();
    const { live, type } = await mountPage(true);
    type('Hallo Welt');
    await act(async () => {
      (live.actions['setBackgroundColor'] as (color: string) => void)('#123456');
    });

    await act(() => wait(1700));
    expect(captureStageImage).not.toHaveBeenCalled();

    type('Hallo');
    act(() => commitOpenTextEdit());
    await act(() => wait(1700));
    expect(captureStageImage).toHaveBeenCalledTimes(1);
  }, 90_000);
});
