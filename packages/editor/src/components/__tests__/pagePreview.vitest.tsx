// SPDX-License-Identifier: MPL-2.0
/**
 * `PagePreview` draws one page read-only and reports a PNG once the page is
 * settled. Against the real fixture template: the report must come through the
 * same GenericCanvas the editor stages use, not a second renderer.
 */
import { render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';

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
// Konva's PNG export composes layers with a drawImage the napi context rejects
// for jsdom canvases; pixels are not under test, the call and its scale are.
const toDataURL = vi
  .spyOn(Konva.Stage.prototype, 'toDataURL')
  .mockReturnValue('data:image/png;base64,iVBORw0KGgo=');

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
    // The stage turns the 200 px target into a region and ratio; their product is the PNG width.
    const options = toDataURL.mock.calls[0]![0] as { width: number; pixelRatio: number };
    expect(Math.floor(options.width * options.pixelRatio)).toBe(200);
  });
});
