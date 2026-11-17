// SPDX-License-Identifier: AGPL-3.0-only
/**
 * `PagePreview` draws one page read-only and reports a PNG once the page is
 * settled. Against the real fixture template: the report must come through the
 * same GenericCanvas the editor stages use, not a second renderer.
 */
import { render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { loadCanvasConfig } from '../../configs/configLoader.js';

import '../../testing/fixtureTemplates';
import { PagePreview } from '../PagePreview';

// jsdom loads no images: every `use-image` source counts as loaded.
vi.mock('use-image', async () => {
  const { Image, createCanvas } = await import('@napi-rs/canvas');
  const bitmap = new Image();
  bitmap.src = createCanvas(4, 4).toBuffer('image/png');
  return { default: (url: string) => (url ? [bitmap, 'loaded'] : [undefined, 'loading']) };
});

vi.spyOn(Konva.Node.prototype, 'cache').mockReturnThis();
// Konva's export composes layers with a drawImage the napi context rejects for
// jsdom canvases; pixels are not under test, the call, its scale and the
// encoder are. The PNG is encoded through `toBlob`, off the main thread.
const blob = { current: new Blob(['png'], { type: 'image/png' }) as Blob | null };
const toBlob = vi.fn((done: (result: Blob | null) => void) => done(blob.current));
const toCanvas = vi
  .spyOn(Konva.Stage.prototype, 'toCanvas')
  .mockImplementation(() => ({ toBlob, width: 1, height: 1 }) as unknown as HTMLCanvasElement);
const toDataURL = vi.spyOn(Konva.Stage.prototype, 'toDataURL');

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

let config: Awaited<ReturnType<typeof loadCanvasConfig>>;

beforeAll(async () => {
  config = await loadCanvasConfig('fixture-poster');
}, 120_000);

describe('PagePreview', () => {
  it('calls onRendered once with a PNG data URL', async () => {
    const onRendered = vi.fn();
    render(
      <PagePreview
        config={config as never}
        state={{ line1: 'Klimaschutz jetzt', line2: 'Gemeinsam handeln', line3: 'Zukunft sichern' }}
        width={200}
        onRendered={onRendered}
      />
    );
    await waitFor(() => expect(onRendered).toHaveBeenCalled(), { timeout: 3000 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(onRendered).toHaveBeenCalledTimes(1);
    expect(onRendered.mock.calls[0]![0]).toMatch(/^data:image\/png;base64,/);
    // Encoded by toBlob; the synchronous encoder would block a scrolling gallery.
    expect(toBlob).toHaveBeenCalledTimes(1);
    expect(toDataURL).not.toHaveBeenCalled();
    // The stage turns the 200 px target into a region and ratio; their product is the PNG width.
    const options = toCanvas.mock.calls[0]![0] as { width: number; pixelRatio: number };
    expect(Math.floor(options.width * options.pixelRatio)).toBe(200);
  });

  it('hands the canvas handle to onCanvas once, before the image is reported', async () => {
    const order: string[] = [];
    const onCanvas = vi.fn((canvas: { recordScene: unknown }) => {
      order.push(typeof canvas.recordScene === 'function' ? 'canvas' : 'no recordScene');
    });
    const onRendered = vi.fn(() => order.push('rendered'));
    render(
      <PagePreview
        config={config as never}
        state={{ line1: 'a', line2: 'b', line3: 'c' }}
        width={200}
        onRendered={onRendered}
        onCanvas={onCanvas}
      />
    );
    await waitFor(() => expect(onRendered).toHaveBeenCalled(), { timeout: 3000 });
    expect(onCanvas).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['canvas', 'rendered']);
  });

  it('calls onFailed, not onRendered, when the stage gives no image', async () => {
    blob.current = null;
    const onRendered = vi.fn();
    const onFailed = vi.fn();
    render(
      <PagePreview
        config={config as never}
        state={{ line1: 'a', line2: 'b', line3: 'c' }}
        width={200}
        onRendered={onRendered}
        onFailed={onFailed}
      />
    );
    await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(onRendered).not.toHaveBeenCalled();
    blob.current = new Blob(['png'], { type: 'image/png' });
  });
});
