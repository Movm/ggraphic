// SPDX-License-Identifier: MPL-2.0
/**
 * Grain and dot pattern for rects: a noise tile and a dot grid, both drawn by `ShapePrimitive`
 * as a second node over the fill. Deterministic, so goldens stay stable.
 */
import Konva from 'konva';

import { GRAIN_SPECK_ALPHA } from './grainSpec.js';
import type { ShapeInstance } from './shapes.js';

export const GRAIN_TILE_SIZE = 256;

/** Dot radius as a share of the spacing (the prototypes' 3 px dot on a 40 px grid, rounded). */
export const DOT_RADIUS_SHARE = 0.07;

export const DEFAULT_PATTERN_SPACING = 0.037;

/** A small fast seeded PRNG (mulberry32): the same seed always draws the same specks. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Peak alpha of a speck: uniform 0…140 gives a mean near 70, visible texture rather than a tint. */
const SPECK_ALPHA = GRAIN_SPECK_ALPHA;

/**
 * Square RGBA noise of `size` × `size`: colour flat (black for `dark`, white for `light`),
 * alpha per pixel from the seeded PRNG.
 */
export function grainTile(
  seed: number,
  size: number,
  tone: 'dark' | 'light' = 'dark'
): Uint8ClampedArray {
  const next = mulberry32(seed);
  const data = new Uint8ClampedArray(size * size * 4);
  const value = tone === 'light' ? 255 : 0;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = Math.floor(next() * (SPECK_ALPHA + 1));
  }
  return data;
}

/** Centres of a dot grid with `spacing` px between them, the first at `spacing / 2`. */
export function dotCenters(
  width: number,
  height: number,
  spacing: number
): Array<{ x: number; y: number }> {
  if (!(spacing > 0)) return [];
  const centres: Array<{ x: number; y: number }> = [];
  for (let y = spacing / 2; y < height; y += spacing) {
    for (let x = spacing / 2; x < width; x += spacing) centres.push({ x, y });
  }
  return centres;
}

const tiles = new Map<string, CanvasImageSource>();

/** The noise tile as a canvas to repeat as a pattern (seed 1, 256 px). */
function grainCanvas(tone: 'dark' | 'light'): CanvasImageSource {
  const cached = tiles.get(tone);
  if (cached) return cached;
  const canvas = Konva.Util.createCanvasElement();
  canvas.width = GRAIN_TILE_SIZE;
  canvas.height = GRAIN_TILE_SIZE;
  const image = canvas.getContext('2d')!.createImageData(GRAIN_TILE_SIZE, GRAIN_TILE_SIZE);
  image.data.set(grainTile(1, GRAIN_TILE_SIZE, tone));
  const context = canvas.getContext('2d')!;
  context.putImageData(image, 0, 0);
  // The context's own canvas is the element in a browser; the test shim backs it with another.
  const source = context.canvas;
  tiles.set(tone, source);
  return source;
}

/** Fills the clip already set on `ctx` with the dot grid of `shape`. */
export function paintDots(
  ctx: Konva.Context,
  shape: Pick<ShapeInstance, 'patternColor' | 'patternSpacing'>,
  width: number,
  height: number,
  canvasWidth: number
): void {
  const spacing = (shape.patternSpacing ?? DEFAULT_PATTERN_SPACING) * canvasWidth;
  const radius = spacing * DOT_RADIUS_SHARE;
  ctx.setAttr('fillStyle', shape.patternColor ?? 'rgba(255,255,255,0.35)');
  ctx.beginPath();
  for (const c of dotCenters(width, height, spacing)) {
    ctx.moveTo(c.x + radius, c.y);
    ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
  }
  ctx.fill();
}

/** Fills the clip already set on `ctx` with the noise tile; the node's opacity carries the strength. */
export function paintGrain(
  ctx: Konva.Context,
  tone: 'dark' | 'light',
  width: number,
  height: number
): void {
  const pattern = ctx.createPattern(grainCanvas(tone), 'repeat');
  if (!pattern) return;
  ctx.setAttr('fillStyle', pattern);
  ctx.fillRect(0, 0, width, height);
}
