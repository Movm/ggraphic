// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Turns a recorded scene into one a writer can use without a page: no DOM image elements, and a
 * PNG behind every raster op (`ExportScene`).
 *
 * - An `element` image ref becomes an SVG or bitmap source (`imageBytes.ts`). A canvas drawn whole
 *   becomes a raster op, as the pixels of a Konva cache are an island, not a picture.
 * - A raster op the recorder left without pixels is rendered by the dependency that can: the
 *   stage by element id, the Konva node when the item has no id, or a replay of the island's ops.
 * - A source that cannot be read, or an SVG that cannot be inlined faithfully (a foreign one that
 *   is drawn with a style sheet, say, which the sanitiser strips), is drawn from the stage
 *   instead, as a raster of its whole element. If that fails too the op is removed and the
 *   element is listed in `report.missingElements`: an export may lose a picture, it may not lose
 *   it silently.
 *
 * Items are resolved one after the other, so the report lists things in the order of the page.
 */
import {
  attempt,
  sourceFromCanvas,
  sourceFromUrl,
  type ImageByteDeps,
  type SourceOutcome,
} from './imageBytes.js';
import { itemBounds } from './itemBounds.js';
import { IDENTITY } from './matrix.js';
import { fitPixelRatio } from './rasterLimit.js';
import { isTrustedSvgImage } from './trustedSvgImages.js';
import {
  emptyReport,
  mergeReports,
  type ExportReport,
  type ExportScene,
  type Paint,
  type RecordedScene,
  type RasterReason,
  type SceneImageRef,
  type SceneItem,
  type SceneOp,
} from './types.js';

type Box = { x: number; y: number; width: number; height: number };

export interface ResolveDeps extends ImageByteDeps {
  /** The page this scene is, as the report names it. */
  page: number;
  /**
   * The element drawn from the stage at `pixelRatio` (`rasterizeStageElement`), with the box it
   * covers in page px, or null. The box is only used for an element drawn instead of an image it
   * could not read; an island keeps the box it was recorded with.
   */
  rasterizeElement: (
    elementId: string,
    pixelRatio: number
  ) => Promise<{ png: Uint8Array; box: Box } | null>;
  /**
   * A PNG of the node a raster op kept as `nodeRef`, for an island whose item has no element id
   * to look the node up by.
   */
  rasterizeNode: (nodeRef: unknown, pixelRatio: number) => Promise<Uint8Array | null>;
  /** PNG of ops replayed at pixelRatio (replayScene onto an offscreen canvas), or null. */
  rasterizeOps: (ops: SceneOp[], box: Box, pixelRatio: number) => Promise<Uint8Array | null>;
  /** print: exportDpi / 25.4 / mmToPx(format, 1); else 2 */
  rasterPixelRatio: number;
}

type ElementRef = Extract<SceneImageRef, { kind: 'element' }>;
type RasterOp = Extract<SceneOp, { kind: 'raster' }>;

interface Resolution {
  deps: ResolveDeps;
  report: ExportReport;
  /** By the image element, so a tile or photo drawn many times is read once. */
  sources: Map<unknown, Promise<SourceOutcome>>;
}

/** What went wrong in one item, which decides what is done about it once all its ops were tried. */
interface ItemState {
  elementId: string | null;
  /**
   * An image op or paint was dropped for having no source we can embed: draw the element instead,
   * and say why. The first reason stays.
   */
  stageFallback: Extract<RasterReason, 'image-unreadable' | 'svg-unsupported'> | null;
  /** Something is gone for good: report the element. */
  missing: boolean;
}

export async function resolveScene(
  recorded: RecordedScene,
  deps: ResolveDeps
): Promise<ExportScene> {
  // A copy: the recording is not written to, and the arrays are the ones this appends to.
  const report = mergeReports(recorded.report, emptyReport());
  const resolution: Resolution = { deps, report, sources: new Map() };

  const items: SceneItem[] = [];
  for (const item of recorded.items) {
    const resolved = await resolveItem(item, resolution);
    if (resolved) items.push(resolved);
  }
  return { width: recorded.width, height: recorded.height, items, report };
}

async function resolveItem(item: SceneItem, resolution: Resolution): Promise<SceneItem | null> {
  const state: ItemState = { elementId: item.elementId, stageFallback: null, missing: false };
  const ops = await resolveOps(item.ops, resolution, state);

  if (state.stageFallback) {
    const island = await drawnElement(item.elementId, resolution, state.stageFallback);
    if (island) {
      resolution.report.rasterIslands.push({
        page: resolution.deps.page,
        elementId: item.elementId,
        reason: state.stageFallback,
      });
      // It shows the whole element, so the ops that did resolve would draw it a second time.
      return { ...item, ops: [island] };
    }
    state.missing = true;
  }
  if (state.missing) {
    resolution.report.missingElements.push({
      page: resolution.deps.page,
      elementId: item.elementId,
      reason: 'image-unreadable',
    });
  }
  return ops.length > 0 ? { ...item, ops } : null;
}

/** The element as the stage draws it: the last resort for a picture nothing else can read. */
async function drawnElement(
  elementId: string | null,
  { deps }: Resolution,
  reason: RasterReason
): Promise<RasterOp | null> {
  if (elementId === null) return null;
  const drawn = await attempt(() => deps.rasterizeElement(elementId, deps.rasterPixelRatio));
  if (!drawn) return null;
  return {
    kind: 'raster',
    matrix: IDENTITY,
    alpha: 1,
    clips: [],
    shadow: null,
    png: drawn.png,
    ...drawn.box,
    reason,
    source: null,
  };
}

async function resolveOps(
  ops: readonly SceneOp[],
  resolution: Resolution,
  state: ItemState
): Promise<SceneOp[]> {
  const resolved: SceneOp[] = [];
  for (const op of ops) {
    const next = await resolveOp(op, resolution, state);
    if (next) resolved.push(next);
  }
  return resolved;
}

async function resolveOp(
  op: SceneOp,
  resolution: Resolution,
  state: ItemState
): Promise<SceneOp | null> {
  switch (op.kind) {
    case 'path':
    case 'text': {
      const paint = await resolvePaint(op.paint, resolution, state);
      return paint ? { ...op, paint } : null;
    }
    case 'image':
      return resolveImage(op, resolution, state);
    case 'group': {
      const ops = await resolveOps(op.ops, resolution, state);
      return ops.length > 0 ? { ...op, ops } : null;
    }
    case 'raster':
      return resolveRaster(op, resolution, state);
  }
}

async function resolvePaint(
  paint: Paint,
  resolution: Resolution,
  state: ItemState
): Promise<Paint | null> {
  if (paint.type !== 'pattern') return paint;
  const outcome = await resolveRef(paint.image, resolution);
  if (!outcome.ok) {
    state.stageFallback ??= outcome.reason;
    return null;
  }
  return { ...paint, image: outcome.source };
}

async function resolveImage(
  op: Extract<SceneOp, { kind: 'image' }>,
  resolution: Resolution,
  state: ItemState
): Promise<SceneOp | null> {
  const ref = op.image;
  const outcome = await resolveRef(ref, resolution);
  if (!outcome.ok) {
    // An item without an id (a page background) has no stage element to draw: raster the op.
    if (state.elementId === null) return rasterizedImage(op, outcome.reason, resolution, state);
    state.stageFallback ??= outcome.reason;
    return null;
  }
  const source = outcome.source;
  if (ref.kind === 'element' && isCanvas(ref.element) && source.kind === 'bitmap') {
    const whole = op.sx === 0 && op.sy === 0 && op.sw >= ref.width && op.sh >= ref.height;
    // A raster op has no source rectangle; a canvas drawn in part stays an image.
    if (whole) {
      resolution.report.rasterIslands.push({
        page: resolution.deps.page,
        elementId: state.elementId,
        reason: 'filter',
      });
      return {
        kind: 'raster',
        matrix: op.matrix,
        alpha: op.alpha,
        clips: op.clips,
        shadow: op.shadow,
        png: source.bytes,
        x: op.dx,
        y: op.dy,
        width: op.dw,
        height: op.dh,
        reason: 'filter',
        source: null,
      };
    }
  }
  return { ...op, image: source };
}

/** An image nothing can embed, drawn by the browser from the op itself: an island of its box. */
async function rasterizedImage(
  op: Extract<SceneOp, { kind: 'image' }>,
  reason: Extract<RasterReason, 'image-unreadable' | 'svg-unsupported'>,
  resolution: Resolution,
  state: ItemState
): Promise<SceneOp | null> {
  const bounds = itemBounds({ elementId: null, label: null, ops: [op] });
  if (!bounds) {
    state.missing = true;
    return null;
  }
  const island = await resolveRaster(
    {
      kind: 'raster',
      matrix: IDENTITY,
      alpha: 1,
      clips: [],
      shadow: null,
      png: null,
      x: bounds.x0,
      y: bounds.y0,
      width: bounds.x1 - bounds.x0,
      height: bounds.y1 - bounds.y0,
      reason,
      source: [op],
    },
    resolution,
    state
  );
  if (island) {
    resolution.report.rasterIslands.push({
      page: resolution.deps.page,
      elementId: null,
      reason,
    });
  }
  return island;
}

async function resolveRaster(
  op: RasterOp,
  { deps, report }: Resolution,
  state: ItemState
): Promise<SceneOp | null> {
  // `nodeRef` and `source` are recorded forms: the node, and ops that still name DOM elements.
  const { nodeRef, source, ...island } = op;
  let png = op.png;
  if (!png) {
    // A page-sized island at print resolution is more pixels than a canvas may have.
    const fitted = fitPixelRatio(op.width, op.height, deps.rasterPixelRatio);
    const ratio = fitted.pixelRatio;
    if (source) {
      const box = { x: op.x, y: op.y, width: op.width, height: op.height };
      png = await attempt(() => deps.rasterizeOps(source, box, ratio));
    } else if (state.elementId !== null) {
      const id = state.elementId;
      png = (await attempt(() => deps.rasterizeElement(id, ratio)))?.png ?? null;
    } else if (nodeRef !== undefined) {
      png = await attempt(() => deps.rasterizeNode(nodeRef, ratio));
    }
    if (png && fitted.reduced)
      report.reducedRasters.push({ page: deps.page, elementId: state.elementId });
  }
  if (!png) {
    state.missing = true;
    return null;
  }
  return { ...island, png, source: null };
}

// ---------------------------------------------------------------------------------------------
// Image refs

/** What `drawImage` was given that can be read from, as the recorder keeps it. */
interface ElementLike {
  currentSrc?: unknown;
  src?: unknown;
  toDataURL?: unknown;
}

const isCanvas = (element: unknown): element is { toDataURL(type?: string): string } =>
  typeof (element as ElementLike | null)?.toDataURL === 'function';

function resolveRef(ref: SceneImageRef, resolution: Resolution): Promise<SourceOutcome> {
  if (ref.kind !== 'element') return Promise.resolve({ ok: true, source: ref });
  const cached = resolution.sources.get(ref.element);
  if (cached) return cached;
  const loading = loadElement(ref, resolution.deps);
  resolution.sources.set(ref.element, loading);
  return loading;
}

const UNREADABLE: SourceOutcome = { ok: false, reason: 'image-unreadable' };

async function loadElement(ref: ElementRef, deps: ResolveDeps): Promise<SourceOutcome> {
  const element = ref.element;
  const size = { width: ref.width, height: ref.height };
  if (isCanvas(element)) return sourceFromCanvas(element, size);
  // An `HTMLImageElement`; anything without a url (an `ImageBitmap`, a video) cannot be refetched.
  const { currentSrc, src } = (element ?? {}) as ElementLike;
  const url = typeof currentSrc === 'string' && currentSrc ? currentSrc : src;
  if (typeof url !== 'string' || url === '') return UNREADABLE;
  // Whether this SVG is the editor's own is a fact about who made the element, not about its url.
  return sourceFromUrl(url, size, deps, isTrustedSvgImage(element));
}
