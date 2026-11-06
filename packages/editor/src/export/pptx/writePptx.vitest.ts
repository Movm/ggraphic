// SPDX-License-Identifier: AGPL-3.0-only
// The writer end to end: the model becomes a .pptx through `#pptxgenjs` (the npm package here,
// the bundled browser build in the published package, #133).
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';

import { fill, item, rect, solid } from '../scene/__fixtures__/exportSceneFixture.js';
import { emptyReport } from '../scene/types.js';
import { createVectorizer } from './vectorizeElement.js';
import { writePptx } from './writePptx.js';

import type { PptxDeckModel, PptxRasterRequest } from './types.js';

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

// ---------------------------------------------------------------------------------------------
// Raster requests: vector when the caller can, PNG otherwise

/** One transparent pixel. */
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
// A title with characters past Latin-1: the file must hold the same bytes the string encodes to.
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20" width="80" height="40"><title>Größe → ✓</title><rect width="40" height="20" fill="#00a050"/></svg>';

const star: PptxRasterRequest = {
  kind: 'raster',
  elementId: 'star',
  box: { x: 100, y: 100, width: 200, height: 100 },
  rotation: 30,
  reason: 'shape-path',
  boxExact: true,
};

const rasterModel: PptxDeckModel = {
  page: { width: 1920, height: 1080 },
  slides: [{ background: { color: null }, items: [star], notes: null, unknownKeys: [] }],
};

const slideOf = async (blob: Blob) => {
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  return { files, xml: strFromU8(files['ppt/slides/slide1.xml']!) };
};
const media = (files: Record<string, Uint8Array>) =>
  Object.keys(files).filter((path) => path.startsWith('ppt/media/'));

describe('writePptx raster requests', () => {
  it('become svg images when vectorize answers, with the png preview PowerPoint needs next to them', async () => {
    const rasterize = vi.fn(async () => ({
      dataUrl: PNG_DATA_URL,
      box: { x: 0, y: 0, width: 1, height: 1 },
    }));
    const vectorize = vi.fn(async () => ({
      svg: SVG,
      box: { x: 120, y: 90, width: 240, height: 120 },
    }));

    const { blob, skipped } = await writePptx(rasterModel, {
      rasterize,
      loadImage: async () => null,
      vectorize,
    });

    expect(skipped).toEqual([]);
    expect(vectorize).toHaveBeenCalledWith(star, 0);
    expect(rasterize).not.toHaveBeenCalled();
    const { files, xml } = await slideOf(blob);
    expect(xml).toContain('asvg:svgBlip');
    expect(xml.match(/<p:pic>/g)).toHaveLength(1);
    const svgFile = media(files).find((path) => path.endsWith('.svg'));
    expect(svgFile && strFromU8(files[svgFile]!)).toBe(SVG);
    expect(media(files).filter((path) => path.endsWith('.png'))).toHaveLength(1);
    // Where the box says, upright: the box is the rotated element's own bounds.
    const inch = (px: number) => Math.round((px * 13.333 * 914400) / 1920);
    expect(xml).toMatch(new RegExp(`<a:off x="${inch(120)}" y="${inch(90)}"/>`));
    expect(xml).toMatch(new RegExp(`<a:ext cx="${inch(240)}" cy="${inch(120)}"/>`));
    expect(xml).not.toContain('rot=');
  });

  it('keep the png raster path when vectorize answers null', async () => {
    const rasterize = vi.fn(async () => ({
      dataUrl: PNG_DATA_URL,
      box: { x: 120, y: 90, width: 240, height: 120 },
    }));
    const vectorize = vi.fn(async () => null);

    const { blob, skipped } = await writePptx(rasterModel, {
      rasterize,
      loadImage: async () => null,
      vectorize,
    });

    expect(skipped).toEqual([]);
    expect(rasterize).toHaveBeenCalledWith(star, 0);
    const { files, xml } = await slideOf(blob);
    expect(xml).not.toContain('asvg:svgBlip');
    expect(xml.match(/<p:pic>/g)).toHaveLength(1);
    expect(media(files).filter((path) => path.endsWith('.svg'))).toEqual([]);
    expect(media(files).filter((path) => path.endsWith('.png'))).toHaveLength(1);
  });

  it('fall back to the png when vectorize throws', async () => {
    const rasterize = vi.fn(async () => ({
      dataUrl: PNG_DATA_URL,
      box: { x: 0, y: 0, width: 10, height: 10 },
    }));

    const { blob } = await writePptx(rasterModel, {
      rasterize,
      loadImage: async () => null,
      vectorize: async () => {
        throw new Error('boom');
      },
    });

    expect(rasterize).toHaveBeenCalledTimes(1);
    expect((await slideOf(blob)).xml).not.toContain('asvg:svgBlip');
  });

  it('are asked for an image that cannot be loaded as well, not only for shapes', async () => {
    const picture: PptxDeckModel = {
      page: { width: 1920, height: 1080 },
      slides: [
        {
          background: { color: null },
          items: [
            {
              kind: 'image',
              id: 'photo',
              src: 'https://example.invalid/a.png',
              fit: 'cover',
              rounding: false,
              box: { x: 0, y: 0, width: 100, height: 100 },
              rotation: 0,
              opacity: 1,
            },
          ],
          notes: null,
          unknownKeys: [],
        },
      ],
    };
    const vectorize = vi.fn(async () => ({
      svg: SVG,
      box: { x: 0, y: 0, width: 100, height: 100 },
    }));

    await writePptx(picture, {
      rasterize: async () => null,
      loadImage: async () => null,
      vectorize,
    });

    // An image that cannot be loaded is asked for as a raster request of its own element.
    expect(vectorize).toHaveBeenCalledWith(expect.objectContaining({ elementId: 'photo' }), 0);
  });

  it('take their svg from the recording of the slide, at the box of the element', async () => {
    const vectorize = createVectorizer({
      recordPage: async () => ({
        width: 1920,
        height: 1080,
        items: [
          item(
            'star',
            'Star',
            fill(rect(0, 0, 200, 100), solid('#00a050'), { matrix: [1, 0, 0, 1, 120, 90] })
          ),
        ],
        report: emptyReport(),
      }),
      resolveDeps: (page) => ({
        page,
        fetchBytes: async () => null,
        reencode: async () => null,
        rasterizeElement: async () => null,
        rasterizeNode: async () => null,
        rasterizeOps: async () => null,
        rasterPixelRatio: 2,
      }),
      fontDeps: {},
    });
    const rasterize = vi.fn(async () => null);

    const { blob, skipped } = await writePptx(rasterModel, {
      rasterize,
      loadImage: async () => null,
      vectorize,
    });

    expect(skipped).toEqual([]);
    expect(rasterize).not.toHaveBeenCalled();
    const { files, xml } = await slideOf(blob);
    expect(xml).toContain('asvg:svgBlip');
    const svgFile = media(files).find((path) => path.endsWith('.svg'));
    expect(svgFile && strFromU8(files[svgFile]!)).toContain('viewBox="0 0 200 100"');
    const inch = (px: number) => Math.round((px * 13.333 * 914400) / 1920);
    expect(xml).toContain(`<a:off x="${inch(120)}" y="${inch(90)}"/>`);
  });

  it('are skipped, as before, when neither vector nor png can be had', async () => {
    const { skipped } = await writePptx(rasterModel, {
      rasterize: async () => null,
      loadImage: async () => null,
      vectorize: async () => null,
    });

    expect(skipped).toEqual(['1:star']);
  });
});
