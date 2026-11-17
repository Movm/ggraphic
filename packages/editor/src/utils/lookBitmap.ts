// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The look of a photo ("Bearbeiten" adjustments, the background tint) as a bitmap made once per
 * look, not as Konva filters run while drawing.
 *
 * A Konva filter runs over the node's cache, and the cache holds the drawn crop: every pan, zoom
 * or crop-frame drag cleared it and ran every filter again, one full pass per pointer move (#197).
 * Here the colour filters run once over the whole photo (`lookBitmap`), and the node draws that
 * bitmap with its ordinary crop (`lookSceneFunc`); moving the crop costs a `drawImage`.
 *
 * Two parts of the look depend on the drawn frame, not the photo, and stay with the drawing:
 * the flip mirrors the drawn frame (as the filter mirrored the cache, which the crop geometry
 * relies on) and the vignette darkens towards the frame's edges. The node keeps the photo as its
 * `image` and its crop in photo pixels, so geometry, hit area and print DPI read what they read.
 */
import Konva from 'konva';

import { cornersOf, hasCorners, traceRoundedRect, type CornerRadius } from './cornerRadius.js';
import { getActiveImageFilters, imageFilterAttrs } from './imageFilters.js';
import { STRAIGHT_DRAW_ATTR, type StraightDraw } from './straighten.js';

import type { ImageAdjustments } from './userImageUtils.js';

type KonvaFilter = typeof Konva.Filters.Grayscale;

/** Node attr holding the look bitmap the node draws instead of its `image`. */
export const LOOK_IMAGE_ATTR = 'lookImage';

/**
 * Largest look bitmap, in pixels: iOS WebKit silently drops a canvas above 16 777 216 px. A photo
 * larger than that at the resolution asked for is filtered smaller.
 */
export const LOOK_MAX_AREA = 16_777_216;

/** Size of the quick bitmap shown while a look changes fast (a slider drag). */
export const LOOK_QUICK_AREA = 1_500_000;

/** The look without the frame-bound flip and vignette. */
function colourLook(adjustments: ImageAdjustments | null): ImageAdjustments | null {
  return adjustments ? { ...adjustments, flipX: false, flipY: false, vignette: 0 } : null;
}

/** The look's colour filters: everything but the flip and the vignette. */
function colourFilters(adjustments: ImageAdjustments | null, color: string | null): KonvaFilter[] {
  const look = colourLook(adjustments);
  return [...(color ? [Konva.Filters.RGB] : []), ...(look ? getActiveImageFilters(look) : [])];
}

/** What the colour filters read, as a key; null when the look has no colour filter. */
export function lookKey(adjustments: ImageAdjustments | null, color: string | null): string | null {
  if (colourFilters(adjustments, color).length === 0) return null;
  const look = colourLook(adjustments);
  return JSON.stringify([
    color,
    look && imageFilterAttrs(look),
    // The switches put a filter in the list instead of setting an attr.
    look && [!!look.grayscale, !!look.sepia, !!look.invert],
  ]);
}

/** Whether the node must draw through `lookSceneFunc`: a colour filter, a flip or a vignette. */
export function drawsLook(adjustments: ImageAdjustments | null, color: string | null): boolean {
  return (
    lookKey(adjustments, color) !== null ||
    !!adjustments?.flipX ||
    !!adjustments?.flipY ||
    (adjustments?.vignette ?? 0) > 0
  );
}

/** Node attrs `lookSceneFunc` reads: the flip and the vignette. */
export function lookDrawAttrs(adjustments: ImageAdjustments | null) {
  return {
    flipX: !!adjustments?.flipX,
    flipY: !!adjustments?.flipY,
    vignette: adjustments?.vignette ?? 0,
  };
}

/**
 * Device pixels per node unit the node is drawn at. The editor matches what Konva's own cache
 * held (the device ratio, whatever the stage zoom); a preview draws at what it draws or captures,
 * whichever is larger, so a full-size capture (the render gate) stays sharp.
 */
export function lookPixelRatio(node: Konva.Node, captureRatio: number | null): number {
  if (captureRatio === null) return Konva.pixelRatio;
  const absolute = Math.abs(node.getAbsoluteScale().x);
  // The stage carries the display scale; what remains is the node's scale within the page.
  const withinPage = absolute / (node.getStage()?.scaleX() || 1);
  return Math.max(absolute * Konva.pixelRatio, withinPage * captureRatio);
}

/**
 * Size of the bitmap of a photo drawn `photoWidth` node units wide at `pixelRatio`: never larger
 * than the photo, nor than `maxArea`.
 */
export function lookBitmapSize(
  natural: { width: number; height: number },
  photoWidth: number,
  pixelRatio: number,
  maxArea = LOOK_MAX_AREA
): { width: number; height: number } {
  const wanted = (photoWidth * pixelRatio) / natural.width;
  const areaLimit = Math.sqrt(maxArea / (natural.width * natural.height));
  const scale = Math.min(1, wanted, areaLimit);
  return {
    width: Math.max(1, Math.round(natural.width * scale)),
    height: Math.max(1, Math.round(natural.height * scale)),
  };
}

interface Built {
  key: string;
  bitmap: HTMLCanvasElement;
}

// Per photo the looks built last; the background, a framed photo and its dimmed rest share them.
const built = new WeakMap<HTMLImageElement, Built[]>();
const KEPT_PER_IMAGE = 2;

/** An already built bitmap of this look at least `width` wide, if there is one. */
export function builtLookBitmap(
  image: HTMLImageElement,
  key: string,
  width: number
): HTMLCanvasElement | null {
  return built.get(image)?.find((e) => e.key === key && e.bitmap.width >= width)?.bitmap ?? null;
}

/**
 * The photo with its colour filters applied, at least `size` (an equal or larger bitmap of the
 * same look is reused), or the photo itself when the look has no colour filter. The blur radius
 * is in node units, as on the node: `photoWidth` is how wide the whole photo is drawn.
 */
export function lookBitmap(
  image: HTMLImageElement,
  adjustments: ImageAdjustments | null,
  color: string | null,
  photoWidth: number,
  size: { width: number; height: number }
): CanvasImageSource {
  const key = lookKey(adjustments, color);
  if (key === null || !image.naturalWidth || !image.naturalHeight || photoWidth <= 0) return image;
  const hit = builtLookBitmap(image, key, size.width);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return image;
  ctx.drawImage(image, 0, 0, size.width, size.height);
  // The filters read their values off a node (`this`), as in Konva's cache.
  const look = colourLook(adjustments);
  const attrs = new Konva.Image({
    image,
    ...(look ? imageFilterAttrs(look) : {}),
    ...(color
      ? {
          red: parseInt(color.slice(1, 3), 16),
          green: parseInt(color.slice(3, 5), 16),
          blue: parseInt(color.slice(5, 7), 16),
        }
      : {}),
  });
  const data = ctx.getImageData(0, 0, size.width, size.height);
  // Konva scales the blur radius by the pixels per node unit it filters at.
  const ratio = size.width / photoWidth;
  for (const filter of colourFilters(adjustments, color)) {
    if (typeof filter === 'function') filter.call(attrs, data, ratio);
  }
  ctx.putImageData(data, 0, 0);
  attrs.destroy();

  const kept = (built.get(image) ?? []).filter((e) => e.key !== key);
  built.set(image, [{ key, bitmap: canvas }, ...kept].slice(0, KEPT_PER_IMAGE));
  return canvas;
}

type DrawContext = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'translate'
  | 'scale'
  | 'rotate'
  | 'beginPath'
  | 'rect'
  | 'closePath'
  | 'clip'
  | 'moveTo'
  | 'lineTo'
  | 'arc'
  | 'arcTo'
  | 'drawImage'
>;

/** The photo as Konva's image would draw it, from the look bitmap, flipped as the look says. */
function drawPhoto(ctx: DrawContext, shape: Konva.Shape, width: number, height: number): void {
  const photo = shape.getAttr('image') as HTMLImageElement | undefined;
  if (!photo) return;
  const source = (shape.getAttr(LOOK_IMAGE_ATTR) as CanvasImageSource | undefined) ?? photo;
  const flipX = !!shape.getAttr('flipX');
  const flipY = !!shape.getAttr('flipY');
  ctx.save();
  if (flipX || flipY) {
    // The flip mirrors the drawn frame, corners and all, as the flip filter mirrored the cache.
    ctx.translate(flipX ? width : 0, flipY ? height : 0);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  }
  const draw = shape.getAttr(STRAIGHT_DRAW_ATTR) as StraightDraw | undefined;
  if (draw) {
    // Begradigt: das ganze Foto gedreht im Rahmen, beschnitten auf den Rahmen.
    const radius = shape.getAttr('cornerRadius') as CornerRadius | undefined;
    ctx.beginPath();
    if (hasCorners(radius)) traceRoundedRect(ctx, width, height, cornersOf(radius, width, height));
    else ctx.rect(0, 0, width, height);
    ctx.closePath();
    ctx.clip();
    ctx.translate(draw.x, draw.y);
    ctx.rotate((draw.rotation * Math.PI) / 180);
    ctx.drawImage(source, -draw.width / 2, -draw.height / 2, draw.width, draw.height);
    ctx.restore();
    return;
  }
  // As Konva.Image draws itself (no fill or stroke: photos carry neither).
  const cornerRadius = (shape as Konva.Image).cornerRadius();
  if (cornerRadius) {
    ctx.beginPath();
    Konva.Util.drawRoundedRectPath(ctx as unknown as Konva.Context, width, height, cornerRadius);
    ctx.closePath();
    ctx.clip();
  }
  const cropWidth = shape.getAttr('cropWidth') as number | undefined;
  const cropHeight = shape.getAttr('cropHeight') as number | undefined;
  if (cropWidth && cropHeight) {
    // The crop is in photo pixels; the bitmap may be smaller.
    const s = Number((source as { width: number }).width) / (photo.naturalWidth || photo.width);
    const cropX = (shape.getAttr('cropX') as number | undefined) ?? 0;
    const cropY = (shape.getAttr('cropY') as number | undefined) ?? 0;
    ctx.drawImage(source, cropX * s, cropY * s, cropWidth * s, cropHeight * s, 0, 0, width, height);
  } else {
    ctx.drawImage(source, 0, 0, width, height);
  }
  ctx.restore();
}

/**
 * Darkens `ctx`'s pixels towards the edges of `width` × `height` by `strength`, the curve of the
 * former vignette filter: k = 1 − strength·smoothstep(t), t = (r − 0.35) / 0.65, r the distance
 * from the middle with the corners at 1. Black at alpha 1 − k drawn `source-atop` multiplies each
 * pixel's colour by k and keeps its alpha, so a cut-out stays cut out.
 */
export function paintVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  strength: number
): void {
  // r = |(dx, dy)| / √2 with dx, dy ∈ [−1, 1]: in a box scaled to 2 × 2 a circle of radius √2.
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(width / 2, height / 2);
  const gradient = ctx.createRadialGradient(0, 0, 0.35 * Math.SQRT2, 0, 0, Math.SQRT2);
  const STOPS = 32;
  for (let i = 0; i <= STOPS; i++) {
    const t = i / STOPS;
    gradient.addColorStop(t, `rgba(0,0,0,${strength * t * t * (3 - 2 * t)})`);
  }
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = gradient;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

// One reusable canvas per node for the vignette. A recording context gets a fresh one: a
// recorded `drawImage` keeps the canvas it was handed and reads it later.
const scratch = new WeakMap<Konva.Shape, HTMLCanvasElement>();

function vignetteCanvas(shape: Konva.Shape, reuse: boolean, width: number, height: number) {
  let canvas = reuse ? scratch.get(shape) : undefined;
  if (!canvas) {
    canvas = document.createElement('canvas');
    if (reuse) scratch.set(shape, canvas);
  }
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return canvas;
}

// Longest side of the vignette canvas: the overlay limit, below what iOS WebKit drops.
const MAX_VIGNETTE_SIDE = 8192;

/**
 * Scene function of a photo with a look, and of a straightened one: the look bitmap with the
 * node's crop, the flip, and the vignette over the drawn frame.
 */
export function lookSceneFunc(context: Konva.Context, shape: Konva.Shape): void {
  const width = shape.width();
  const height = shape.height();
  const vignette = Math.max(0, Math.min(1, Number(shape.getAttr('vignette')) || 0));
  if (!vignette || width <= 0 || height <= 0) {
    drawPhoto(context as unknown as DrawContext, shape, width, height);
    return;
  }
  // The vignette may only darken the photo's own pixels: drawn apart, then put on the canvas.
  const scale = Math.abs(shape.getAbsoluteScale().x) * context.canvas.getPixelRatio();
  const pixelWidth = Math.max(1, Math.min(MAX_VIGNETTE_SIDE, Math.ceil(width * scale)));
  const pixelHeight = Math.max(1, Math.min(MAX_VIGNETTE_SIDE, Math.ceil(height * scale)));
  const native =
    typeof CanvasRenderingContext2D !== 'undefined' &&
    context._context instanceof CanvasRenderingContext2D;
  const canvas = vignetteCanvas(shape, native, pixelWidth, pixelHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    drawPhoto(context as unknown as DrawContext, shape, width, height);
    return;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, pixelWidth, pixelHeight);
  ctx.scale(pixelWidth / width, pixelHeight / height);
  drawPhoto(ctx, shape, width, height);
  paintVignette(ctx, width, height, vignette);
  context.drawImage(canvas, 0, 0, width, height);
}
