// SPDX-License-Identifier: AGPL-3.0-only
// The PDF drawn by pdf.js, against the scene replayed on a canvas: the two have to agree. This is
// the proof that what the writer says in operators is what the scene says in ops. Both are drawn
// on @napi-rs/canvas (pdf.js picks it up in node), so they share a rasteriser; what is compared
// is geometry, paint and compositing, not the anti-aliasing of two different engines.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { createCanvas, GlobalFonts, loadImage, type Canvas } from '@napi-rs/canvas';
import { beforeAll, describe, expect, it } from 'vitest';

import { diffPixels } from '../../testing/pixelDiff.js';
import { resolveFontFiles, type FontFileSet } from '../fonts/fontFiles.js';
import {
  base,
  bitmap,
  fill,
  FIXTURE_FACE,
  item,
  rect,
  sceneOf,
  solid,
  textOp,
} from '../scene/__fixtures__/exportSceneFixture.js';
import { IDENTITY } from '../scene/matrix.js';
import { replayScene } from '../scene/replayScene.js';
import { renderPage } from './__fixtures__/inspectPdf.js';
import { napiRasterize } from './__fixtures__/napiRasterize.js';
import { writePdf } from './writePdf.js';

import type {
  ClipPath,
  ColorStop,
  ExportScene,
  Paint,
  PathCommand,
  SceneImageSource,
  SceneOp,
  StrokeStyle,
} from '../scene/types.js';

const fontsourceDir = path.dirname(
  createRequire(import.meta.url).resolve('@fontsource/instrument-sans/package.json')
);
const latinBytes = new Uint8Array(
  readFileSync(path.join(fontsourceDir, 'files', 'instrument-sans-latin-400-normal.woff2'))
);

const W = 300;
const H = 200;
let set: FontFileSet;
let fonts: ReadonlyMap<string, FontFileSet>;
let png: Uint8Array;

beforeAll(async () => {
  set = await resolveFontFiles(FIXTURE_FACE, {
    brandFaces: [{ family: FIXTURE_FACE.family, src: 'latin.woff2' }],
    fetchBytes: async () => latinBytes,
  });
  fonts = new Map([['Instrument Sans|400|normal', set]]);
  // The reference draws text with the same face.
  GlobalFonts.register(Buffer.from(latinBytes), FIXTURE_FACE.family);
  // A checkerboard of an opaque and a half transparent colour.
  const tile = createCanvas(8, 8);
  const ctx = tile.getContext('2d');
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#336699' : 'rgba(204, 51, 0, 0.5)';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  png = new Uint8Array(await tile.encode('png'));
});

const scene = (...ops: SceneOp[]): ExportScene => ({
  ...sceneOf(item('a', null, ...ops)),
  width: W,
  height: H,
});

/** The scene as the PDF has it, and as a canvas replay has it, both on white. */
async function bothWays(
  input: ExportScene
): Promise<{ pdf: Canvas; reference: Canvas; islands: number }> {
  const raster = napiRasterize();
  const { bytes, report } = await writePdf([input], {
    mode: 'digital',
    fonts,
    rasterize: raster.rasterize,
    rasterPixelRatio: 2,
  });
  const pdf = await renderPage(bytes, 0, 1);

  const reference = createCanvas(W, H);
  const ctx = reference.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const images = new Map<SceneImageSource | Uint8Array, Awaited<ReturnType<typeof loadImage>>>();
  const collect = async (ops: readonly SceneOp[]) => {
    for (const op of ops) {
      if (op.kind === 'group') await collect(op.ops);
      const source =
        op.kind === 'image'
          ? op.image
          : (op.kind === 'path' || op.kind === 'text') && op.paint.type === 'pattern'
            ? op.paint.image
            : null;
      if (source && source.kind === 'bitmap') images.set(source, await loadImage(source.bytes));
    }
  };
  for (const entry of input.items) await collect(entry.ops);
  replayScene(ctx as unknown as CanvasRenderingContext2D, input, {
    images: images as never,
    createCanvas: (width, height) => createCanvas(width, height) as never,
  });
  return { pdf, reference, islands: report.rasterIslands.length };
}

/** Share of pixels that differ by more than `tolerance` in some channel. */
function differing(a: Canvas, b: Canvas, tolerance = 40): number {
  const read = (canvas: Canvas) => canvas.getContext('2d').getImageData(0, 0, W, H).data;
  return diffPixels(read(a), read(b), W, H, tolerance).share;
}

const stops = (...entries: [number, string, number?][]): ColorStop[] =>
  entries.map(([offset, hex, alpha = 1]) => ({ offset, hex, alpha }));
const line = (width: number, extra: Partial<StrokeStyle> = {}): StrokeStyle => ({
  width,
  cap: 'butt',
  join: 'miter',
  miterLimit: 10,
  dash: [],
  dashOffset: 0,
  ...extra,
});
const stroked = (
  commands: PathCommand[],
  paint: Paint,
  stroke: StrokeStyle,
  over = {}
): SceneOp => ({
  ...fill(commands, paint, over),
  mode: 'stroke',
  stroke,
});

// ---------------------------------------------------------------------------------------------

describe('the pdf looks like the scene', () => {
  it('shapes, strokes, rules, curves, alpha and rotation', async () => {
    const turn = 0.4;
    const input = scene(
      fill(rect(10, 10, 60, 40), solid('#336699')),
      stroked(
        rect(90, 10, 60, 40),
        solid('#cc3300'),
        line(6, { cap: 'round', join: 'round', dash: [10, 6], dashOffset: 2 })
      ),
      {
        ...fill(
          [
            { op: 'M', x: 170, y: 10 },
            { op: 'L', x: 230, y: 10 },
            { op: 'L', x: 200, y: 50 },
            { op: 'Z' },
            { op: 'M', x: 180, y: 15 },
            { op: 'L', x: 220, y: 15 },
            { op: 'L', x: 200, y: 40 },
            { op: 'Z' },
          ],
          solid('#009955')
        ),
        rule: 'evenodd',
      },
      fill(rect(10, 70, 60, 40), solid('#336699', 0.5), { alpha: 0.5 }),
      fill(
        [
          { op: 'M', x: 100, y: 70 },
          { op: 'Q', x1: 160, y1: 70, x: 160, y: 120 },
          { op: 'C', x1: 160, y1: 150, x2: 100, y2: 150, x: 100, y: 120 },
          { op: 'Z' },
        ],
        solid('#7733aa')
      ),
      stroked(rect(0, 0, 60, 40), solid('#aa7700'), line(5), {
        matrix: [Math.cos(turn), Math.sin(turn), -Math.sin(turn), Math.cos(turn), 200, 100],
      })
    );
    const { pdf, reference } = await bothWays(input);
    expect(differing(pdf, reference)).toBeLessThan(0.0005);
  });

  it('linear, radial, fading and hard stop gradients, filled and stroked', async () => {
    const linear: Paint = {
      type: 'linear',
      x0: 10,
      y0: 10,
      x1: 110,
      y1: 60,
      stops: stops([0, '#00a050'], [0.5, '#ffffff'], [1, '#c03000']),
    };
    const radial: Paint = {
      type: 'radial',
      x0: 200,
      y0: 40,
      r0: 5,
      x1: 220,
      y1: 40,
      r1: 40,
      stops: stops([0, '#ff0000'], [1, '#0000ff']),
    };
    const fading: Paint = {
      type: 'linear',
      x0: 10,
      y0: 0,
      x1: 110,
      y1: 0,
      stops: stops([0, '#000000', 1], [1, '#000000', 0]),
    };
    const hard: Paint = {
      type: 'linear',
      x0: 150,
      y0: 100,
      x1: 250,
      y1: 100,
      stops: stops([0, '#ff0000'], [0.5, '#ff0000'], [0.5, '#0000ff'], [1, '#0000ff']),
    };
    const input = scene(
      fill(rect(10, 10, 100, 50), linear),
      fill(rect(160, 0, 100, 80), radial),
      fill(rect(10, 80, 100, 40), fading),
      fill(rect(150, 100, 100, 40), hard),
      stroked(rect(10, 140, 100, 40), linear, line(8))
    );
    const { pdf, reference } = await bothWays(input);
    expect(differing(pdf, reference)).toBeLessThan(0.0005);
  });

  it('patterns, clips, group alpha and shadows', async () => {
    const tile: SceneImageSource = bitmap(png, 8, 8);
    const clip: ClipPath = {
      matrix: IDENTITY,
      commands: [
        { op: 'M', x: 150, y: 90 },
        { op: 'L', x: 280, y: 90 },
        { op: 'L', x: 280, y: 190 },
        { op: 'Z' },
      ],
      rule: 'nonzero',
    };
    const input = scene(
      fill(rect(10, 10, 100, 60), {
        type: 'pattern',
        image: tile,
        repeat: 'repeat',
        matrix: [1, 0, 0, 1, 3, 2],
      }),
      fill(rect(150, 20, 130, 130), solid('#008888'), { clips: [clip] }),
      {
        ...base({ alpha: 0.5 }),
        kind: 'group',
        ops: [
          fill(rect(10, 100, 60, 40), solid('#ff0000')),
          fill(rect(40, 110, 60, 30), solid('#0000ff')),
        ],
        shadow: null,
      },
      {
        ...fill(rect(120, 150, 20, 20), solid('#ff0000')),
        shadow: { hex: '#000000', alpha: 0.6, blur: 6, offsetX: 4, offsetY: 5 },
      }
    );
    const { pdf, reference, islands } = await bothWays(input);
    expect(islands).toBe(1);
    expect(differing(pdf, reference)).toBeLessThan(0.0005);
  });

  it('paints inside a transparency group: gradients, patterns and a soft mask keep their place', async () => {
    const tile: SceneImageSource = bitmap(png, 8, 8);
    const gradient: Paint = {
      type: 'linear',
      x0: 120,
      y0: 0,
      x1: 220,
      y1: 0,
      stops: stops([0, '#ff0000'], [1, '#0000ff']),
    };
    const fading: Paint = {
      type: 'linear',
      x0: 120,
      y0: 0,
      x1: 220,
      y1: 0,
      stops: stops([0, '#000000', 1], [1, '#000000', 0]),
    };
    const input = scene({
      ...base({ alpha: 0.6 }),
      kind: 'group',
      ops: [
        fill(rect(10, 20, 80, 60), {
          type: 'pattern',
          image: tile,
          repeat: 'repeat',
          matrix: [1, 0, 0, 1, 3, 2],
        }),
        fill(rect(120, 20, 100, 60), gradient, { matrix: [1, 0, 0, 1, 0, 10] }),
        fill(rect(120, 110, 100, 60), fading, { matrix: [1, 0, 0, 1, 0, 5] }),
      ],
      shadow: null,
    });
    const { pdf, reference } = await bothWays(input);
    expect(differing(pdf, reference)).toBeLessThan(0.0005);
  });

  it('text, set at the positions the scene gives', async () => {
    const file = set.files[0]!;
    const value = 'Hallo "Welt": Ä';
    let x = 10;
    // Not exactly the font's own advances (the browser kerns and rounds): some glyphs are set a
    // little further on, so the writer has to move them.
    const xs = Array.from(value, (char, index) => {
      const here = x;
      x +=
        (file.font.glyphForCodePoint(char.codePointAt(0)!).advanceWidth * 24) /
          file.font.unitsPerEm +
        (index % 3) * 1.5;
      return here;
    });
    const font = { ...FIXTURE_FACE, size: 24 };
    const filled = textOp(value, { xs, y: 30, font, paint: solid('#102030') });
    const outlined = {
      ...textOp(value, { xs, y: 70, font, paint: solid('#cc0000') }),
      mode: 'stroke' as const,
      stroke: line(1),
    };
    const { pdf, reference } = await bothWays(scene(filled, outlined));

    // Where the ink is: the two have to put it in the same place, to the pixel.
    const inkBox = (canvas: Canvas) => {
      const data = canvas.getContext('2d').getImageData(0, 0, W, H).data;
      let [x0, y0, x1, y1] = [W, H, -1, -1];
      for (let i = 0; i < data.length; i += 4) {
        if (data[i]! + data[i + 1]! + data[i + 2]! < 600) {
          const px = (i / 4) % W;
          const py = Math.floor(i / 4 / W);
          [x0, y0, x1, y1] = [
            Math.min(x0, px),
            Math.min(y0, py),
            Math.max(x1, px),
            Math.max(y1, py),
          ];
        }
      }
      return [x0, y0, x1, y1];
    };
    const [a, b] = [inkBox(pdf), inkBox(reference)];
    a.forEach((edge, index) => expect(Math.abs(edge - b[index]!)).toBeLessThanOrEqual(1));
    // Two engines draw glyph edges differently; the letters agree to within that.
    expect(differing(pdf, reference)).toBeLessThan(0.03);
  });
});
