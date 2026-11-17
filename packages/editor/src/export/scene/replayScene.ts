// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Draws a scene (`types.ts`) onto a 2D canvas context.
 *
 * Writers do not use this: it is the proof that the recorder lost nothing. Replaying a recorded
 * page onto a canvas has to give the pixels Konva itself paints, and `replayDifferential.vitest.tsx`
 * compares the two. Every op is replayed from the state it carries (matrix, alpha, clips, shadow),
 * so the context is saved and restored around each one and left as it was found.
 */
import type {
  ClipPath,
  FontSpec,
  Paint,
  PathCommand,
  RecordedScene,
  SceneImageRef,
  SceneImageSource,
  SceneItem,
  SceneOp,
  StrokeStyle,
} from './types.js';

export interface ReplayOptions {
  /** Replay only the items this accepts; all by default. */
  items?: (item: SceneItem) => boolean;
  /**
   * Decoded images for the sources a scene cannot draw by itself: `svg` and `bitmap` image refs,
   * and the `png` of a `raster` op (keyed by the bytes object). `element` refs draw the element.
   * A source missing here is not drawn.
   */
  images?: ReadonlyMap<SceneImageSource | Uint8Array, CanvasImageSource>;
  /**
   * A blank canvas for a `group` op, which is composited from a buffer. By default an
   * `OffscreenCanvas`, else a canvas element of the context's document.
   */
  createCanvas?: (width: number, height: number) => CanvasImageSource & ReplayCanvas;
}

/** What replay needs of the buffer canvas it draws a group into. */
export interface ReplayCanvas {
  width: number;
  height: number;
  getContext: (id: '2d') => CanvasRenderingContext2D | null;
}

export function replayScene(
  ctx: CanvasRenderingContext2D,
  scene: RecordedScene,
  options: ReplayOptions = {}
): void {
  for (const item of scene.items) {
    if (options.items && !options.items(item)) continue;
    for (const op of item.ops) replayOp(ctx, op, options, scene);
  }
}

function replayOp(
  ctx: CanvasRenderingContext2D,
  op: SceneOp,
  options: ReplayOptions,
  scene: RecordedScene
): void {
  ctx.save();
  try {
    applyClips(ctx, op.clips);
    ctx.setTransform(...op.matrix);
    ctx.globalAlpha = op.alpha;
    applyShadow(ctx, op);
    switch (op.kind) {
      case 'path':
        tracePath(ctx, op.commands);
        paintPath(ctx, op.mode, op.paint, op.stroke, op.rule, options);
        break;
      case 'text':
        replayText(ctx, op, options);
        break;
      case 'image': {
        const image = resolveImage(op.image, options);
        if (image) {
          ctx.drawImage(image, op.sx, op.sy, op.sw, op.sh, op.dx, op.dy, op.dw, op.dh);
        }
        break;
      }
      case 'group':
        replayGroup(ctx, op.ops, options, scene);
        break;
      case 'raster': {
        const png = op.png && options.images?.get(op.png);
        if (png) ctx.drawImage(png, op.x, op.y, op.width, op.height);
        // An island without bytes (or whose bytes were not decoded) falls back to its ops.
        else if (op.source) for (const inner of op.source) replayOp(ctx, inner, options, scene);
        break;
      }
    }
  } finally {
    ctx.restore();
  }
}

/** The clips, each in the space it was made in, then back to the identity for the caller. */
function applyClips(ctx: CanvasRenderingContext2D, clips: readonly ClipPath[]): void {
  for (const clip of clips) {
    ctx.setTransform(...clip.matrix);
    tracePath(ctx, clip.commands);
    ctx.clip(clip.rule);
  }
}

function applyShadow(ctx: CanvasRenderingContext2D, op: SceneOp): void {
  if (!op.shadow) return;
  ctx.shadowColor = rgba(op.shadow.hex, op.shadow.alpha);
  ctx.shadowBlur = op.shadow.blur;
  ctx.shadowOffsetX = op.shadow.offsetX;
  ctx.shadowOffsetY = op.shadow.offsetY;
}

function tracePath(ctx: CanvasRenderingContext2D, commands: readonly PathCommand[]): void {
  ctx.beginPath();
  for (const command of commands) {
    switch (command.op) {
      case 'M':
        ctx.moveTo(command.x, command.y);
        break;
      case 'L':
        ctx.lineTo(command.x, command.y);
        break;
      case 'C':
        ctx.bezierCurveTo(command.x1, command.y1, command.x2, command.y2, command.x, command.y);
        break;
      case 'Q':
        ctx.quadraticCurveTo(command.x1, command.y1, command.x, command.y);
        break;
      case 'Z':
        ctx.closePath();
        break;
    }
  }
}

function paintPath(
  ctx: CanvasRenderingContext2D,
  mode: 'fill' | 'stroke',
  paint: Paint,
  stroke: StrokeStyle | null,
  rule: CanvasFillRule,
  options: ReplayOptions
): void {
  const style = styleOf(ctx, paint, options);
  if (!style) return;
  if (mode === 'fill') {
    ctx.fillStyle = style;
    ctx.fill(rule);
    return;
  }
  ctx.strokeStyle = style;
  if (stroke) applyStroke(ctx, stroke);
  ctx.stroke();
}

function applyStroke(ctx: CanvasRenderingContext2D, stroke: StrokeStyle): void {
  ctx.lineWidth = stroke.width;
  ctx.lineCap = stroke.cap;
  ctx.lineJoin = stroke.join;
  ctx.miterLimit = stroke.miterLimit;
  ctx.setLineDash(stroke.dash);
  ctx.lineDashOffset = stroke.dashOffset;
}

function replayText(
  ctx: CanvasRenderingContext2D,
  op: Extract<SceneOp, { kind: 'text' }>,
  options: ReplayOptions
): void {
  const style = styleOf(ctx, op.paint, options);
  if (!style) return;
  ctx.font = fontString(op.font);
  // `xs` and `y` are absolute for every glyph: the alphabetic baseline, no alignment.
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  if (op.mode === 'fill') ctx.fillStyle = style;
  else {
    ctx.strokeStyle = style;
    if (op.stroke) applyStroke(ctx, op.stroke);
  }
  Array.from(op.text).forEach((glyph, index) => {
    const x = op.xs[index];
    if (x === undefined) return;
    if (op.mode === 'fill') ctx.fillText(glyph, x, op.y);
    else ctx.strokeText(glyph, x, op.y);
  });
}

/** A group is composited from a buffer: its ops, then the buffer with the group's alpha and shadow. */
function replayGroup(
  ctx: CanvasRenderingContext2D,
  ops: readonly SceneOp[],
  options: ReplayOptions,
  scene: RecordedScene
): void {
  const buffer = createBuffer(ctx, options, scene);
  const bufferCtx = buffer.getContext('2d');
  if (!bufferCtx) throw new Error('the replay buffer has no 2D context');
  for (const op of ops) replayOp(bufferCtx, op, options, scene);
  // Recorded in page px; the group's own matrix is the one Konva drew the buffer under.
  ctx.drawImage(buffer, 0, 0);
}

function createBuffer(
  ctx: CanvasRenderingContext2D,
  options: ReplayOptions,
  scene: RecordedScene
): CanvasImageSource & ReplayCanvas {
  const width = Math.ceil(scene.width);
  const height = Math.ceil(scene.height);
  if (options.createCanvas) return options.createCanvas(width, height);
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height) as unknown as CanvasImageSource & ReplayCanvas;
  }
  const document = ctx.canvas.ownerDocument;
  if (document) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error('replaying a group needs a canvas: pass options.createCanvas');
}

// ---------------------------------------------------------------------------------------------
// Paint, images, fonts

function styleOf(
  ctx: CanvasRenderingContext2D,
  paint: Paint,
  options: ReplayOptions
): string | CanvasGradient | CanvasPattern | null {
  switch (paint.type) {
    case 'solid':
      return rgba(paint.hex, paint.alpha);
    case 'linear': {
      const gradient = ctx.createLinearGradient(paint.x0, paint.y0, paint.x1, paint.y1);
      for (const stop of paint.stops)
        gradient.addColorStop(stop.offset, rgba(stop.hex, stop.alpha));
      return gradient;
    }
    case 'radial': {
      const gradient = ctx.createRadialGradient(
        paint.x0,
        paint.y0,
        paint.r0,
        paint.x1,
        paint.y1,
        paint.r1
      );
      for (const stop of paint.stops)
        gradient.addColorStop(stop.offset, rgba(stop.hex, stop.alpha));
      return gradient;
    }
    case 'pattern': {
      const image = resolveImage(paint.image, options);
      if (!image) return null;
      const pattern = ctx.createPattern(image, paint.repeat);
      if (!pattern) return null;
      const [a, b, c, d, e, f] = paint.matrix;
      pattern.setTransform({ a, b, c, d, e, f });
      return pattern;
    }
  }
}

function resolveImage(ref: SceneImageRef, options: ReplayOptions): CanvasImageSource | null {
  if (ref.kind === 'element') return ref.element;
  return options.images?.get(ref) ?? null;
}

function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The font shorthand, the fallback list included: a missing face falls to the next one. */
function fontString(font: FontSpec): string {
  const families = [font.family, ...(font.fallback ?? [])].map(cssFamily).join(', ');
  return `${font.style} ${font.weight} ${font.size}px ${families}`;
}

/** A family that is not a plain identifier (spaces, a digit at the start, quotes) has to be quoted. */
function cssFamily(family: string): string {
  return /^-?[A-Za-z_][A-Za-z0-9_-]*$/.test(family)
    ? family
    : `"${family.replace(/(["\\])/g, '\\$1')}"`;
}
