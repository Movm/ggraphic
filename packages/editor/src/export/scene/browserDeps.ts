// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The browser's half of `ResolveDeps`: reading the bytes behind an image url, re-encoding an image
 * through a canvas, and drawing the ops of a raster island. `resolveScene` runs without a page and
 * is handed these (`CanvasEditorShell`); a test hands it its own.
 *
 * Every function answers a failure with null: the caller decides what a missing picture costs.
 */
import { multiply } from './matrix.js';
import { replayScene, type ReplayCanvas } from './replayScene.js';
import { emptyReport, type Matrix, type SceneImageSource, type SceneOp } from './types.js';

import type { ImageByteDeps } from './imageBytes.js';

/** A canvas to draw on, and how to read what was drawn. */
export interface RasterSurface {
  canvas: CanvasImageSource & ReplayCanvas;
  context: CanvasRenderingContext2D;
  encode: (type: 'image/png' | 'image/jpeg', quality?: number) => Promise<Uint8Array | null>;
}

export type CreateSurface = (width: number, height: number) => RasterSurface | null;

export const browserSurface: CreateSurface = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  return {
    canvas,
    context,
    encode: async (type, quality) => {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, type, quality)
      );
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    },
  };
};

export const fetchImageBytes: ImageByteDeps['fetchBytes'] = async (url) => {
  const response = await fetch(url);
  if (!response.ok) return null;
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    mime: response.headers.get('content-type') ?? '',
  };
};

const JPEG_QUALITY = 0.92;

function hasTransparentPixel(context: CanvasRenderingContext2D, width: number, height: number) {
  const { data } = context.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 255) return true;
  return false;
}

/** The browser decodes (and turns a JPEG by its EXIF orientation), the canvas encodes again. */
export const reencodeImage: ImageByteDeps['reencode'] = async (bytes, mime, opaque) => {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }));
  try {
    const { width, height } = bitmap;
    const surface = browserSurface(width, height);
    if (!surface) return null;
    surface.context.drawImage(bitmap, 0, 0);
    const jpeg = opaque ?? !hasTransparentPixel(surface.context, width, height);
    const type = jpeg ? 'image/jpeg' : 'image/png';
    const encoded = await surface.encode(type, jpeg ? JPEG_QUALITY : undefined);
    return encoded && { bytes: encoded, mime: type, width, height };
  } finally {
    bitmap.close();
  }
};

/** The picture behind a source, as `replayScene` draws it; null if it cannot be read. */
export type DecodeImage = (
  source: SceneImageSource | Uint8Array
) => Promise<CanvasImageSource | null>;

/** The browser reads the file: a bitmap by `createImageBitmap`, an SVG as an `Image`. */
export const browserDecode: DecodeImage = async (source) => {
  try {
    if (source instanceof Uint8Array) {
      return await createImageBitmap(new Blob([source as BlobPart], { type: 'image/png' }));
    }
    if (source.kind === 'bitmap') {
      return await createImageBitmap(new Blob([source.bytes as BlobPart], { type: source.mime }));
    }
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source.markup)}`;
    await image.decode();
    return image;
  } catch {
    return null;
  }
};

/** What `ops` draw from beyond themselves: image sources, tiles of patterns, pixels of rasters. */
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

/**
 * `ops` as a PNG of `box` (page px) at `pixelRatio`: they are replayed onto a canvas, each moved
 * by the same transform. An op's matrix and clips are absolute, so the transform is multiplied
 * into every one of them rather than set on the context; a group is composited in a buffer of
 * output px, so its children take the group's matrix too and the group itself keeps none. The
 * pictures the ops draw (a photo that casts a shadow, an SVG the PDF writer cannot convert) are
 * decoded first, once each.
 */
export async function rasterizeOps(
  ops: SceneOp[],
  box: { x: number; y: number; width: number; height: number },
  pixelRatio: number,
  createSurface: CreateSurface = browserSurface,
  decode: DecodeImage = browserDecode
): Promise<Uint8Array | null> {
  const width = Math.ceil(box.width * pixelRatio);
  const height = Math.ceil(box.height * pixelRatio);
  if (width <= 0 || height <= 0) return null;
  const surface = createSurface(width, height);
  if (!surface) return null;
  const images = new Map<SceneImageSource | Uint8Array, CanvasImageSource>();
  for (const source of sourcesOf(ops)) {
    if (images.has(source)) continue;
    const image = await decode(source);
    if (image) images.set(source, image);
  }
  // The canvas is a whole number of px, so the scale is the one that puts the box on all of it.
  const sx = width / box.width;
  const sy = height / box.height;
  const place: Matrix = [sx, 0, 0, sy, -box.x * sx, -box.y * sy];
  try {
    replayScene(
      surface.context,
      {
        width,
        height,
        items: [{ elementId: null, label: null, ops: ops.map((op) => placed(op, place, sx, sy)) }],
        report: emptyReport(),
      },
      { images, createCanvas: (w, h) => (createSurface(w, h) ?? surface).canvas }
    );
    return await surface.encode('image/png');
  } finally {
    for (const image of images.values()) if ('close' in image) image.close();
  }
}

/** `op` under `parent`, the matrix that takes its parent's space to the output. */
function placed(op: SceneOp, parent: Matrix, sx: number, sy: number): SceneOp {
  const common = {
    clips: op.clips.map((clip) => ({ ...clip, matrix: multiply(parent, clip.matrix) })),
    // Device px: the transform does not reach a shadow's blur and offsets.
    shadow: op.shadow && {
      ...op.shadow,
      blur: op.shadow.blur * Math.max(sx, sy),
      offsetX: op.shadow.offsetX * sx,
      offsetY: op.shadow.offsetY * sy,
    },
  };
  if (op.kind === 'group') {
    const inner = multiply(parent, op.matrix);
    return {
      ...op,
      ...common,
      matrix: [1, 0, 0, 1, 0, 0],
      ops: op.ops.map((child) => placed(child, inner, sx, sy)),
    };
  }
  const matrix = multiply(parent, op.matrix);
  if (op.kind === 'raster') {
    return {
      ...op,
      ...common,
      matrix,
      source: op.source && op.source.map((inner) => placed(inner, parent, sx, sy)),
    };
  }
  return { ...op, ...common, matrix };
}
