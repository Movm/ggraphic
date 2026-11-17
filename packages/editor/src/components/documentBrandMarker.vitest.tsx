// SPDX-License-Identifier: AGPL-3.0-only
/**
 * A text without a marker style of its own draws the default marker of the
 * brand of its DOCUMENT. The registry's first pack is the other one in the
 * test (as the German one is in a host with several), so a document of
 * `PACK_B` drew the first pack's boxes. The brand reaches the Konva tree
 * through `GenericCanvas`, which every mount of a page shares (the editor
 * shell, an embedded canvas, the offscreen preview and export roots).
 */
import { cleanup, render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { registerBrandPacks } from '../brand/brandRegistry.js';
import { ConfigCanvas } from './ConfigCanvas.js';
import { StandaloneCanvas } from './StandaloneCanvas.js';
import { registerTemplates } from '../templates/registry.js';

import { brandTestConfig } from '../testing/documentBrandConfig.js';
import { PACK_A, PACK_B } from '../testing/documentBrandPacks.js';

import type { AnyCanvasConfig } from '../configs/types.js';

const B_BOX = PACK_B.markers.swatches[0]!.color;
const A_BOX = PACK_A.markers.swatches[0]!.color;

const inB = brandTestConfig('brand-b', PACK_B) as unknown as AnyCanvasConfig;
const plain = brandTestConfig('brand-none') as unknown as AnyCanvasConfig;

beforeAll(() => {
  registerBrandPacks([PACK_A, PACK_B]);
  registerTemplates({ id: 'brand-b', load: () => Promise.resolve(inB) });
  // jsdom has no FontFaceSet; the editor waits on it before it draws text.
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      check: () => true,
      load: async () => [],
      ready: Promise.resolve(),
      status: 'loaded',
      addEventListener() {},
      removeEventListener() {},
    },
  });
});

afterEach(() => {
  cleanup();
  for (const stage of [...Konva.stages]) stage.destroy();
});

/** The fill colours of the rects the page paints once its marker run is on the stage. */
async function fills(): Promise<string[]> {
  let found: string[] = [];
  await waitFor(
    () => {
      const stage = Konva.stages[0];
      const texts = stage?.find('Text').map((node) => (node as Konva.Text).text().trim()) ?? [];
      expect(texts).toContain('frei');
      found = stage!
        .find('Rect')
        .map((rect) => (rect as Konva.Rect).fill())
        .filter((fill): fill is string => typeof fill === 'string');
    },
    { timeout: 10_000 }
  );
  return found;
}

describe('the default marker of a page', () => {
  it('is the one of the document pack on a page that names it', async () => {
    render(<ConfigCanvas config={inB} initialProps={{}} preview />);
    const painted = await fills();
    expect(painted).toContain(B_BOX);
    expect(painted).not.toContain(A_BOX);
  });

  it('is the one of the document pack through StandaloneCanvas, the offscreen root of previews', async () => {
    render(<StandaloneCanvas configId="brand-b" initialProps={{}} preview />);
    expect(await fills()).toContain(B_BOX);
  });

  it('is the first pack on a page that names no brand', async () => {
    render(<ConfigCanvas config={plain} initialProps={{}} preview />);
    const painted = await fills();
    expect(painted).toContain(A_BOX);
    expect(painted).not.toContain(B_BOX);
  });
});
