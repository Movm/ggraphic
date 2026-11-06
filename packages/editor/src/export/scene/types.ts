// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The scene IR of the vector export. A recorded page is a list of items (one per canvas
 * element), each a flat list of ops. Every op carries its own absolute matrix, global alpha,
 * clip stack and shadow, so a writer can emit it without keeping any canvas state.
 *
 * Coordinates: an op's `commands`, `xs`, `y`, gradient points and destination rect are in the
 * user space of its `matrix`. `matrix` maps that space to page px. Stroke width, dash and
 * pattern matrices are in the same user space.
 */

/** Canvas matrix `[a, b, c, d, e, f]`: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

export type PathCommand =
  | { op: 'M' | 'L'; x: number; y: number }
  | { op: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: 'Q'; x1: number; y1: number; x: number; y: number }
  | { op: 'Z' };

/** `hex` is `#rrggbb`, lower case; `alpha` is 0..1. */
export interface ColorStop {
  offset: number;
  hex: string;
  alpha: number;
}

export type Paint =
  | { type: 'solid'; hex: string; alpha: number }
  | { type: 'linear'; x0: number; y0: number; x1: number; y1: number; stops: ColorStop[] }
  | {
      type: 'radial';
      x0: number;
      y0: number;
      r0: number;
      x1: number;
      y1: number;
      r1: number;
      stops: ColorStop[];
    }
  | { type: 'pattern'; image: SceneImageRef; repeat: 'repeat'; matrix: Matrix };

export interface StrokeStyle {
  width: number;
  cap: CanvasLineCap;
  join: CanvasLineJoin;
  miterLimit: number;
  dash: number[];
  dashOffset: number;
}

/**
 * Canvas semantics: `blur` and the offsets are in device px, the CTM does not apply to them.
 * `blur` is the canvas `shadowBlur` (a Gaussian with sigma = blur / 2).
 */
export interface Shadow {
  hex: string;
  alpha: number;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface ClipPath {
  matrix: Matrix;
  commands: PathCommand[];
  rule: CanvasFillRule;
}

export interface FontSpec {
  /** The first family of the CSS list, unquoted. */
  family: string;
  /**
   * The families after the first, in order, unquoted; absent when the list had only one. What a
   * viewer draws when `family` is not installed.
   */
  fallback?: string[];
  weight: number;
  style: 'normal' | 'italic';
  size: number;
}

interface OpBase {
  matrix: Matrix;
  alpha: number;
  clips: readonly ClipPath[];
  shadow: Shadow | null;
}

export type SceneImageRef =
  | { kind: 'element'; element: CanvasImageSource; width: number; height: number } // recorded, unresolved
  | SceneImageSource;

export type SceneImageSource =
  | { kind: 'svg'; markup: string; width: number; height: number }
  | {
      kind: 'bitmap';
      mime: 'image/png' | 'image/jpeg';
      bytes: Uint8Array;
      width: number;
      height: number;
    };

export type SceneOp =
  | (OpBase & {
      kind: 'path';
      mode: 'fill' | 'stroke';
      commands: PathCommand[];
      rule: CanvasFillRule;
      paint: Paint;
      stroke: StrokeStyle | null;
    })
  | (OpBase & {
      kind: 'text';
      mode: 'fill' | 'stroke';
      text: string;
      /** One x per code point of `text` (`Array.from(text)`), in the user space of `matrix`. */
      xs: number[];
      /** The alphabetic baseline. */
      y: number;
      font: FontSpec;
      paint: Paint;
      stroke: StrokeStyle | null;
    })
  | (OpBase & {
      kind: 'image';
      image: SceneImageRef;
      sx: number;
      sy: number;
      sw: number;
      sh: number;
      dx: number;
      dy: number;
      dw: number;
      dh: number;
    })
  | (OpBase & { kind: 'group'; ops: SceneOp[] })
  | (OpBase & {
      kind: 'raster';
      png: Uint8Array | null;
      x: number;
      y: number;
      width: number;
      height: number;
      reason: RasterReason;
      source: SceneOp[] | null;
    });

export type RasterReason =
  | 'filter'
  | 'composite'
  | 'unsupported-call'
  | 'unsupported-pattern'
  | 'missing-glyph'
  | 'font-unavailable'
  | 'bitmap-only-font'
  | 'shadow'
  | 'svg-unsupported'
  | 'image-unreadable';

export interface SceneItem {
  elementId: string | null;
  label: string | null;
  ops: SceneOp[];
}

export interface RecordedScene {
  width: number;
  height: number;
  items: SceneItem[];
  report: ExportReport;
}

/** After `resolveScene`: no `element` image refs, every raster has a `png`. */
export type ExportScene = RecordedScene;

export interface ExportReport {
  rasterIslands: { page: number; elementId: string | null; reason: RasterReason }[];
  unknownCalls: { page: number; elementId: string | null; call: string }[];
  missingElements: { page: number; elementId: string | null; reason: 'image-unreadable' }[];
  missingGlyphs: { page: number; elementId: string | null; text: string }[];
  outlinedForLicence: string[];
  rgbBrandColors: string[];
  fallback: { reason: string } | null;
}

export function emptyReport(): ExportReport {
  return {
    rasterIslands: [],
    unknownCalls: [],
    missingElements: [],
    missingGlyphs: [],
    outlinedForLicence: [],
    rgbBrandColors: [],
    fallback: null,
  };
}

const unique = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])];

/** Entries are concatenated in order; the name lists are de-duplicated; the first fallback wins. */
export function mergeReports(a: ExportReport, b: ExportReport): ExportReport {
  return {
    rasterIslands: [...a.rasterIslands, ...b.rasterIslands],
    unknownCalls: [...a.unknownCalls, ...b.unknownCalls],
    missingElements: [...a.missingElements, ...b.missingElements],
    missingGlyphs: [...a.missingGlyphs, ...b.missingGlyphs],
    outlinedForLicence: unique(a.outlinedForLicence, b.outlinedForLicence),
    rgbBrandColors: unique(a.rgbBrandColors, b.rgbBrandColors),
    fallback: a.fallback ?? b.fallback,
  };
}
