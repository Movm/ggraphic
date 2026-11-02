// SPDX-License-Identifier: MPL-2.0
// The writer end to end: the model becomes a .pptx through `#pptxgenjs` (the npm package here,
// the bundled browser build in the published package, #133).
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { writePptx } from './writePptx.js';

import type { PptxDeckModel } from './types.js';

const model: PptxDeckModel = {
  page: { width: 1920, height: 1080 },
  slides: [
    {
      background: { color: '#0f2352' },
      items: [
        {
          kind: 'shape',
          id: 'box',
          shape: 'rect',
          fill: '#f5822a',
          rectRadius: null,
          shadow: null,
          box: { x: 100, y: 100, width: 400, height: 200 },
          rotation: 0,
          opacity: 1,
        },
      ],
      notes: 'Speaker note',
      unknownKeys: [],
    },
  ],
};

describe('writePptx', () => {
  it('writes a deck with the slide, its shape and its notes', async () => {
    const { blob, skipped } = await writePptx(model, {
      rasterize: async () => null,
      loadImage: async () => null,
      title: 'Deck',
    });
    expect(skipped).toEqual([]);

    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const slide = strFromU8(files['ppt/slides/slide1.xml']);
    expect(slide).toContain('F5822A');
    expect(slide).toContain('0F2352');
    const notes = Object.keys(files).find((path) =>
      /^ppt\/notesSlides\/notesSlide1\.xml$/.test(path)
    );
    expect(notes && strFromU8(files[notes])).toContain('Speaker note');
  });
});
