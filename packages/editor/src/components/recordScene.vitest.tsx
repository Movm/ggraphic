// SPDX-License-Identifier: AGPL-3.0-only
/**
 * `GenericCanvasRef.recordScene` against a real template: the page-root group, the item groups
 * `CanvasRenderLayer` builds and the layer labels have to meet in what the export gets.
 */
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { GenericCanvas, type GenericCanvasRef } from './GenericCanvas.js';
import { loadCanvasConfig } from '../configs/configLoader.js';
import { AutoSaveStoreProvider } from '../stores/AutoSaveStoreProvider.js';
import { installNapiStageBridge } from '../testing/napiStageBridge.js';

import '../testing/fixtureTemplates.js';

vi.mock('use-image', async () => {
  const { Image, createCanvas } = await import('@napi-rs/canvas');
  const bitmap = new Image();
  bitmap.src = createCanvas(4, 4).toBuffer('image/png');
  return { default: (url: string) => (url ? [bitmap, 'loaded'] : [undefined, 'loading']) };
});

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

let config: Awaited<ReturnType<typeof loadCanvasConfig>>;
let restoreBridge: () => void;

beforeAll(async () => {
  restoreBridge = installNapiStageBridge();
  config = await loadCanvasConfig('fixture-poster');
}, 120_000);
afterAll(() => restoreBridge());

async function mount() {
  const ref = createRef<GenericCanvasRef>();
  render(
    <AutoSaveStoreProvider>
      <GenericCanvas
        config={config as never}
        initialProps={{
          line1: 'Klimaschutz jetzt',
          line2: 'Gemeinsam handeln',
          line3: 'Zukunft sichern',
        }}
        onExport={() => {}}
        onCancel={() => {}}
        callbacks={{}}
        forwardedRef={ref}
        preview
      />
    </AutoSaveStoreProvider>
  );
  await act(async () => {});
  return ref.current!;
}

describe('GenericCanvasRef.recordScene', () => {
  it('records the template page at its format size, with the element labels', async () => {
    const canvas = await mount();

    const scene = await canvas.recordScene({ page: 2 });

    // The format, not the rounded size of the stage it is shown on.
    expect([scene?.width, scene?.height]).toEqual([1080, 1350]);
    expect(scene?.items.map((item) => [item.elementId, item.label])).toEqual([
      ['background-color', 'Hintergrund'],
      ['ornament', 'Bild'],
      ['line1-text', 'Text: Klimaschutz jetzt'],
      ['line2-text', 'Text: Gemeinsam handeln'],
      ['line3-text', 'Text: Zukunft sichern'],
    ]);
    const text = scene?.items[2]?.ops[0];
    expect(text).toMatchObject({ kind: 'text', text: 'Klimaschutz jetzt' });
    expect(scene?.report.rasterIslands).toEqual([]);
    expect(scene?.report.unknownCalls).toEqual([]);
  });

  it('leaves the background out when transparent', async () => {
    const canvas = await mount();

    const scene = await canvas.recordScene({ page: 1, transparent: true });

    expect(scene?.items.map((item) => item.elementId)).toEqual([
      'ornament',
      'line1-text',
      'line2-text',
      'line3-text',
    ]);
  });
});
