// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The rasteriser of the PDF writer tests: it replays the ops onto an `@napi-rs/canvas` canvas
 * with `replayScene`, which is what the editor does with a browser canvas. It keeps the calls it
 * was given, so a test can see what the writer asked for.
 */
import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas';

import { rebaseOps } from '../../scene/rebaseOps.js';
import { replayScene } from '../../scene/replayScene.js';
import { emptyReport } from '../../scene/types.js';

import type { RasterBox, RasterizeOps } from '../pdfContent.js';
import type { SceneImageSource, SceneOp } from '../../scene/types.js';

export interface RasterCall {
  ops: SceneOp[];
  box: RasterBox;
  pixelRatio: number;
}

/** The sources an op list draws from, as `replayScene` wants them decoded. */
function* sourcesOf(ops: readonly SceneOp[]): Generator<SceneImageSource | Uint8Array> {
  for (const op of ops) {
    if (op.kind === 'image' && op.image.kind !== 'element') yield op.image;
    else if (op.kind === 'raster') {
      if (op.png) yield op.png;
      if (op.source) yield* sourcesOf(op.source);
    } else if (op.kind === 'group') yield* sourcesOf(op.ops);
    else if ((op.kind === 'path' || op.kind === 'text') && op.paint.type === 'pattern') {
      if (op.paint.image.kind !== 'element') yield op.paint.image;
    }
  }
}

export function napiRasterize(options: { returns?: 'png' | 'null' } = {}): {
  rasterize: RasterizeOps;
  calls: RasterCall[];
  /** Replays ops on a canvas the size of the box, for tests that look at pixels. */
  canvasOf: (ops: SceneOp[], box: RasterBox, pixelRatio: number) => Promise<Canvas>;
} {
  const calls: RasterCall[] = [];
  const canvasOf = async (ops: SceneOp[], box: RasterBox, pixelRatio: number) => {
    const canvas = createCanvas(
      Math.round(box.width * pixelRatio),
      Math.round(box.height * pixelRatio)
    );
    const images = new Map<SceneImageSource | Uint8Array, Awaited<ReturnType<typeof loadImage>>>();
    for (const source of sourcesOf(ops)) {
      if (images.has(source)) continue;
      const bytes =
        source instanceof Uint8Array
          ? source
          : source.kind === 'svg'
            ? Buffer.from(source.markup)
            : source.bytes;
      images.set(source, await loadImage(bytes));
    }
    replayScene(
      canvas.getContext('2d') as unknown as CanvasRenderingContext2D,
      {
        width: canvas.width,
        height: canvas.height,
        items: [{ elementId: null, label: null, ops: rebaseOps(ops, box, pixelRatio) }],
        report: emptyReport(),
      },
      {
        images: images as never,
        createCanvas: (width, height) => createCanvas(width, height) as never,
      }
    );
    return canvas;
  };
  const rasterize: RasterizeOps = async (ops, box, pixelRatio) => {
    calls.push({ ops, box, pixelRatio });
    if (options.returns === 'null') return null;
    return new Uint8Array(await (await canvasOf(ops, box, pixelRatio)).encode('png'));
  };
  return { rasterize, calls, canvasOf };
}
