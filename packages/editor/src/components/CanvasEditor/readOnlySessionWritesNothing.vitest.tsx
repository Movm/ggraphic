// SPDX-License-Identifier: AGPL-3.0-only
/**
 * A viewer's session (`readOnly`) on a collaborative document writes nothing into it, through
 * the real shell with its pages mounted: the shell derives `collaborative.canWrite` from
 * `readOnly`, so the open does not lift a version 3 document either (review of #211, finding 1).
 * The same document opened by an editing session is lifted.
 */
import { act, render } from '@testing-library/react';
import Konva from 'konva';
import { describe, expect, it, vi } from 'vitest';
import type * as Y from 'yjs';

import { CanvasEditorProvider } from '../../CanvasEditorProvider.js';
import { CanvasEditorShell } from './CanvasEditorShell.js';
import {
  PAGE_ID,
  SHAPES,
  isStructured,
  schemaVersionOf,
  shape,
  v3Doc,
} from '../../collab/__tests__/elementStorageKit.js';

vi.stubGlobal(
  'matchMedia',
  vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
);
vi.spyOn(Konva.Stage.prototype, 'toDataURL').mockReturnValue('data:,');
Element.prototype.scrollIntoView ??= () => {};

const settle = async (ms = 20) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

async function mountShell(doc: Y.Doc, readOnly: boolean) {
  await act(async () => {
    render(
      <CanvasEditorProvider services={{}}>
        <CanvasEditorShell
          initialConfigId="fixture-poster"
          initialProps={{}}
          onExport={() => {}}
          onCancel={() => {}}
          collaborative={{ ydoc: doc, isSynced: true }}
          readOnly={readOnly}
        />
      </CanvasEditorProvider>
    );
  });
  for (let i = 0; i < 50 && Konva.stages.length < 1; i++) await settle();
  expect(Konva.stages.length).toBeGreaterThan(0);
  await settle(100);
}

const v3 = () =>
  v3Doc([
    {
      id: PAGE_ID,
      configId: 'fixture-poster',
      state: { [SHAPES]: [shape('s1', 100)], layerOrder: ['s1'] },
    },
  ]);

describe('the shell on a collaborative document', () => {
  it('a readOnly session writes nothing, and does not lift', async () => {
    const doc = v3();
    const writes: Uint8Array[] = [];
    doc.on('update', (u: Uint8Array) => writes.push(u));
    await mountShell(doc, true);
    expect(writes).toEqual([]);
    expect(isStructured(doc, SHAPES)).toBe(false);
    expect(schemaVersionOf(doc)).toBe(3);
  }, 90_000);

  it('an editing session lifts on open', async () => {
    const doc = v3();
    await mountShell(doc, false);
    expect(isStructured(doc, SHAPES)).toBe(true);
    expect(schemaVersionOf(doc)).toBe(4);
  }, 90_000);
});
