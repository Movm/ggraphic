// SPDX-License-Identifier: MPL-2.0
/**
 * Die Schriftrolle eines freien Textes geht von der Leiste über die Seite zur Aktion des Hosts —
 * und die Leiste erfährt von der Seite, ob es diese Aktion gibt (ohne sie keine Auswahl).
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { createRef, useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  GenericCanvas,
  type GenericCanvasRef,
  type ToolbarStateReport,
} from '@ggraphic/editor/components/GenericCanvas';
import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import { FloatingFontRoleControl } from '@ggraphic/editor/components/TopBar/modules/FloatingFontRoleControl';
import { messages } from '@ggraphic/editor/i18n/messages';
import { AutoSaveStoreProvider } from '@ggraphic/editor/stores/AutoSaveStoreProvider';

import '../../testing/fixtureTemplates';

import type * as StoreModule from '@ggraphic/editor/stores/createCanvasEditorStore';
import type { CanvasEditorStoreApi } from '@ggraphic/editor/stores/createCanvasEditorStore';
import type { FloatingModuleState } from '@ggraphic/editor/hooks/useFloatingModuleState';

const stores = vi.hoisted(() => [] as unknown[]);
vi.mock('@ggraphic/editor/stores/createCanvasEditorStore', async (importOriginal) => {
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

afterEach(cleanup);

let base: Awaited<ReturnType<typeof loadCanvasConfig>>;
beforeAll(async () => {
  base = await loadCanvasConfig('fixture-poster');
}, 120_000);

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

/** The fixture page, with or without the host's font role action. */
async function mount(setAdditionalTextFontRole?: (id: string, role: string) => void) {
  const config = {
    ...base,
    createActions: (...args: unknown[]) => ({
      ...(base.createActions as (...a: unknown[]) => Record<string, unknown>)(...args),
      ...(setAdditionalTextFontRole ? { setAdditionalTextFontRole } : {}),
    }),
  };
  const ref = createRef<GenericCanvasRef>();
  const report = { current: null as ToolbarStateReport | null };
  await act(async () => {
    render(
      <AutoSaveStoreProvider>
        <GenericCanvas
          forwardedRef={ref}
          config={config as never}
          initialProps={{ additionalTexts: [TEXT] }}
          onExport={() => {}}
          onCancel={() => {}}
          autoSave={false}
          onToolbarStateChange={(state) => {
            report.current = state;
          }}
        />
      </AutoSaveStoreProvider>
    );
  });
  await vi.waitFor(() => expect(report.current).not.toBeNull());
  return { ref, report };
}

describe('the font role through the canvas', () => {
  it('reaches the host action for a free text, and the toolbar is told the host has one', async () => {
    const setAdditionalTextFontRole = vi.fn();
    const { ref, report } = await mount(setAdditionalTextFontRole);
    expect(report.current!.canChangeFontRole).toBe(true);
    act(() => ref.current!.handleFontRoleChange!('t1', 'condensed'));
    expect(setAdditionalTextFontRole).toHaveBeenCalledExactlyOnceWith('t1', 'condensed');
  }, 90_000);

  it('tells the toolbar there is no font role when the host has no such action', async () => {
    const { ref, report } = await mount();
    expect(report.current!.canChangeFontRole).toBe(false);
    expect(() => act(() => ref.current!.handleFontRoleChange!('t1', 'condensed'))).not.toThrow();
  }, 90_000);
});

type Text = typeof TEXT & { bind?: Record<string, { ref: string; value: string }> };

describe('the picker in the bar follows the text it shows', () => {
  /** The fixture page with a host action that really writes the font, as the Studio's does. */
  async function mountWithPicker() {
    const config = {
      ...base,
      createActions: (
        getState: () => { additionalTexts: Text[] },
        setState: (change: (prev: { additionalTexts: Text[] }) => unknown) => void,
        saveToHistory: () => void,
        ...rest: unknown[]
      ) => ({
        ...(base.createActions as (...a: unknown[]) => Record<string, unknown>)(
          getState,
          setState,
          saveToHistory,
          ...rest
        ),
        setAdditionalTextFontRole: (id: string, role: string) => {
          const family = role === 'condensed' ? 'Anton' : 'Bricolage Grotesque';
          setState((prev) => ({
            ...prev,
            additionalTexts: prev.additionalTexts.map((t) =>
              t.id === id
                ? {
                    ...t,
                    fontFamily: `${family}, Arial, sans-serif`,
                    bind: { fontFamily: { ref: `font.${role}`, value: family } },
                  }
                : t
            ),
          }));
          saveToHistory();
        },
      }),
    };
    const ref = createRef<GenericCanvasRef>();
    // What the bar does: it keeps the module the page reports and draws the picker from it.
    function Bar() {
      const [module, setModule] = useState<FloatingModuleState | null>(null);
      return (
        <>
          <AutoSaveStoreProvider>
            <GenericCanvas
              forwardedRef={ref}
              config={config as never}
              initialProps={{
                additionalTexts: [
                  {
                    ...TEXT,
                    fontFamily: 'Bricolage Grotesque, Arial, sans-serif',
                    bind: { fontFamily: { ref: 'font.headline', value: 'Bricolage Grotesque' } },
                  },
                ],
              }}
              onExport={() => {}}
              onCancel={() => {}}
              autoSave={false}
              onToolbarStateChange={(state: ToolbarStateReport) =>
                setModule(state.activeFloatingModule)
              }
            />
          </AutoSaveStoreProvider>
          {module?.data.isInstanceText && (
            <FloatingFontRoleControl
              text={{ fontFamily: module.data.fontFamily ?? '', bind: module.data.bind }}
              onChange={() => {}}
            />
          )}
        </>
      );
    }
    stores.length = 0;
    await act(async () => {
      render(<Bar />);
    });
    const store = stores[stores.length - 1] as CanvasEditorStoreApi;
    await vi.waitFor(() => expect(store.getState().history).toHaveLength(1));
    await act(async () => store.getState().setSelectedElement('t1'));
    const picker = () =>
      screen.getByRole('combobox', { name: messages().topBar.fontRole }) as HTMLSelectElement;
    return { ref, picker };
  }

  it('shows the new role after a pick, and the old one again after undo', async () => {
    const { ref, picker } = await mountWithPicker();
    expect(picker().value).toBe('headline');

    await act(async () => ref.current!.handleFontRoleChange!('t1', 'condensed'));
    expect(picker().value).toBe('condensed');

    await act(async () => ref.current!.undo!());
    expect(picker().value).toBe('headline');

    await act(async () => ref.current!.redo!());
    expect(picker().value).toBe('condensed');
  }, 90_000);
});
