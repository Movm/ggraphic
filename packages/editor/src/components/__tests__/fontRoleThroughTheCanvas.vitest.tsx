// SPDX-License-Identifier: MPL-2.0
/**
 * Die Schriftrolle eines freien Textes geht von der Leiste über die Seite zur Aktion des Hosts —
 * und die Leiste erfährt von der Seite, ob es diese Aktion gibt (ohne sie keine Auswahl).
 */
import { act, cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  GenericCanvas,
  type GenericCanvasRef,
  type ToolbarStateReport,
} from '@ggraphic/editor/components/GenericCanvas';
import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import { AutoSaveStoreProvider } from '@ggraphic/editor/stores/AutoSaveStoreProvider';

import '../../testing/fixtureTemplates';

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
