// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Records a mounted page stage as a scene (`types.ts`): one item per canvas element, in render
 * order, each a flat list of ops in page px. Konva draws the elements; the recording canvas
 * (`recordingCanvas.ts`) turns what it draws into ops.
 *
 * Page px are the format's px: the stage is shown at a display scale, and a page whose layout is
 * drawn in a smaller logical size sits under a scaled group (`PAGE_ROOT_NAME`). Elements are drawn
 * relative to their layer, which leaves out the display scale of the stage and keeps the group's.
 */
import Konva from 'konva';

import { CANVAS_ITEM_ID_ATTR, CANVAS_ITEM_NAME } from '../../utils/deepSelect.js';
import { PAGE_ROOT_NAME, withSelectionChromeHidden } from '../../utils/captureStage.js';
import { IDENTITY } from './matrix.js';
import { RecordingSceneCanvas } from './recordingCanvas.js';
import {
  emptyReport,
  type ExportReport,
  type RasterReason,
  type RecordedScene,
  type SceneItem,
  type SceneOp,
} from './types.js';

import type { RecordingContext } from './recordingContext.js';

export interface RecordPageOptions {
  page: number;
  /**
   * The page in px. Without it, the stage's own size at scale 1: exact where the stage was sized in
   * whole px at that scale, but `CanvasStage` rounds its container to whole display px, which puts
   * the height up to half a display px off.
   */
  size?: { width: number; height: number };
  /** Labels per canvasItemId, from layerLabel(); missing → null. */
  labels?: ReadonlyMap<string, string>;
  /** Draw no page background (SVG transparent export). */
  transparent?: boolean;
}

/** What `recordItem` needs besides the node: the same for every item of a page. */
interface PageContext {
  layer: Konva.Layer;
  page: number;
  width: number;
  height: number;
  measure: CanvasRenderingContext2D;
  report: ExportReport;
  labels: ReadonlyMap<string, string> | undefined;
}

export function recordPageScene(stage: Konva.Stage, options: RecordPageOptions): RecordedScene {
  const measure = Konva.Util.createCanvasElement().getContext('2d');
  if (!measure) throw new Error('no 2D canvas context to measure text with');

  const report = emptyReport();
  const items: SceneItem[] = [];
  const width = options.size?.width ?? roundTo3(stage.width() / stage.scaleX());
  const height = options.size?.height ?? roundTo3(stage.height() / stage.scaleY());

  // `CanvasStage` hides the same nodes for a transparent PNG.
  const backgrounds = options.transparent
    ? stage.find('.canvas-background').filter((node) => node.visible())
    : [];
  backgrounds.forEach((node) => node.hide());
  try {
    withSelectionChromeHidden(stage, () => {
      for (const layer of stage.getLayers()) {
        const page: PageContext = {
          layer,
          page: options.page,
          width,
          height,
          measure,
          report,
          labels: options.labels,
        };
        for (const node of pageNodes(layer)) {
          const item = recordItem(node, page);
          if (item) items.push(item);
        }
      }
    });
  } finally {
    backgrounds.forEach((node) => node.show());
  }

  return { width, height, items, report };
}

const roundTo3 = (value: number) => Math.round(value * 1000) / 1000;

/** The layer's children in draw order, with the page-root group replaced by its own children. */
function* pageNodes(layer: Konva.Layer): Generator<Konva.Node> {
  for (const child of layer.getChildren()) {
    if (child instanceof Konva.Group && child.hasName(PAGE_ROOT_NAME)) yield* child.getChildren();
    else yield child;
  }
}

function recordItem(node: Konva.Node, page: PageContext): SceneItem | null {
  if (!node.isVisible()) return null;
  const id: unknown = node.hasName(CANVAS_ITEM_NAME) ? node.getAttr(CANVAS_ITEM_ID_ATTR) : null;
  const elementId = typeof id === 'string' ? id : null;

  const ops = recordOps(node, page, elementId);
  if (ops.length === 0) return null;
  return { elementId, label: (elementId && page.labels?.get(elementId)) || null, ops };
}

function recordOps(node: Konva.Node, page: PageContext, elementId: string | null): SceneOp[] {
  const island = (reason: RasterReason): SceneOp[] => {
    page.report.rasterIslands.push({ page: page.page, elementId, reason });
    return [rasterIsland(node.getClientRect({ relativeTo: page.layer }), reason)];
  };

  const cached = cachedNodes(node);
  // A filter works on pixels; there is nothing to record from.
  if (cached.some((cachedNode) => (cachedNode.filters() ?? []).length > 0)) return island('filter');

  const unknown = new Set<string>();
  const canvas = new RecordingSceneCanvas({
    width: page.width,
    height: page.height,
    page: page.page,
    measure: page.measure,
    onUnknown: (call) => unknown.add(call),
  });
  // Konva takes an element's opacity from all of its ancestors; the layer above the page is not
  // part of the page.
  canvas.getContext()._opacityRoot = page.layer;
  drawFromSource(cached, canvas.recorder, () => node.drawScene(canvas, page.layer));

  if (unknown.size === 0) return canvas.collect();
  for (const call of unknown) {
    page.report.unknownCalls.push({ page: page.page, elementId, call });
  }
  return island('unsupported-call');
}

function rasterIsland(
  box: { x: number; y: number; width: number; height: number },
  reason: RasterReason
): SceneOp {
  return {
    kind: 'raster',
    matrix: IDENTITY,
    alpha: 1,
    clips: [],
    shadow: null,
    // Task 5 renders the PNG; here only where it goes and why it is needed.
    png: null,
    source: null,
    reason,
    ...box,
  };
}

// ---------------------------------------------------------------------------------------------
// Drawing from the source

/** The node and every descendant that holds a `cache()` canvas. */
function cachedNodes(node: Konva.Node): Konva.Node[] {
  const below = node instanceof Konva.Container ? node.find((n: Konva.Node) => n.isCached()) : [];
  return [node, ...below].filter((n) => n.isCached());
}

/**
 * Runs `draw` with every cached node drawing its children, not its cache canvas (a cached node
 * would be recorded as one bitmap `drawImage`), and with gradients and patterns built on the
 * recorder; then puts both back.
 *
 * A cache is detached from its node and the same object is handed back, not cleared and rebuilt:
 * `cache()` would rasterise the node again, and the hit canvas, the region Konva answers pointer
 * events from, would be lost. `applyPixelHitArea` cuts that canvas to the visible pixels
 * (`drawHitFromCache`) once, when the image loads, and nothing repeats it, so a rebuilt cache
 * would make an image's transparent corners clickable.
 *
 * Putting back is plain assignment, so it cannot fail half-way and hide the error `draw` threw.
 */
function drawFromSource(cached: Konva.Node[], recorder: RecordingContext, draw: () => void): void {
  const detached = cached.map((node) => ({ node, cache: node._getCanvasCache() }));
  detached.forEach(({ node }) => {
    node._canvasCache = null;
  });
  const restorePaints = recordPaintsOn(recorder);
  try {
    draw();
  } finally {
    restorePaints();
    detached.forEach(({ node, cache }) => {
      node._canvasCache = cache;
    });
  }
}

/**
 * Konva builds the gradients and patterns of a shape's own attributes (`fillLinearGradient…`,
 * `fillPatternImage`) on a private native context, not on the context it draws to, so the
 * recorder would only ever see opaque native objects. For the duration of a recording the three
 * builders make them on `recorder` instead. These are the memoising entry points
 * (`_getLinearGradient`, not `__getLinearGradient`): the memo may already hold the native object
 * from an earlier draw, and must not be filled with a recorded one the editor would then draw
 * with. Stroke gradients are built on the drawing context, so they already come out recorded.
 *
 * Recording is synchronous; nothing else draws while the prototype is patched. Returns the
 * function that puts it back.
 */
function recordPaintsOn(recorder: RecordingContext): () => void {
  const proto = Konva.Shape.prototype;
  const saved = {
    pattern: proto._getFillPattern,
    linear: proto._getLinearGradient,
    radial: proto._getRadialGradient,
  };

  const addStops = (gradient: CanvasGradient, stops: ReadonlyArray<number | string>) => {
    for (let n = 0; n < stops.length; n += 2) {
      gradient.addColorStop(stops[n] as number, stops[n + 1] as string);
    }
  };

  proto._getFillPattern = function (this: Konva.Shape) {
    const image = this.fillPatternImage();
    if (!image) return undefined;
    const pattern = recorder.createPattern(image, this.fillPatternRepeat() || 'repeat');
    if (pattern) {
      // The same transform Konva sets on its own pattern (Shape.js, `__getFillPattern`).
      const transform = new Konva.Transform();
      transform.translate(this.fillPatternX(), this.fillPatternY());
      transform.rotate(Konva.getAngle(this.fillPatternRotation()));
      transform.scale(this.fillPatternScaleX(), this.fillPatternScaleY());
      transform.translate(-1 * this.fillPatternOffsetX(), -1 * this.fillPatternOffsetY());
      const [a, b, c, d, e, f] = transform.getMatrix();
      pattern.setTransform({ a, b, c, d, e, f });
    }
    return pattern;
  };
  proto._getLinearGradient = function (this: Konva.Shape) {
    const stops = this.fillLinearGradientColorStops();
    if (!stops) return undefined;
    const start = this.fillLinearGradientStartPoint();
    const end = this.fillLinearGradientEndPoint();
    const gradient = recorder.createLinearGradient(start.x, start.y, end.x, end.y);
    addStops(gradient, stops);
    return gradient;
  };
  proto._getRadialGradient = function (this: Konva.Shape) {
    const stops = this.fillRadialGradientColorStops();
    if (!stops) return undefined;
    const start = this.fillRadialGradientStartPoint();
    const end = this.fillRadialGradientEndPoint();
    const gradient = recorder.createRadialGradient(
      start.x,
      start.y,
      this.fillRadialGradientStartRadius(),
      end.x,
      end.y,
      this.fillRadialGradientEndRadius()
    );
    addStops(gradient, stops);
    return gradient;
  };

  return () => {
    proto._getFillPattern = saved.pattern;
    proto._getLinearGradient = saved.linear;
    proto._getRadialGradient = saved.radial;
  };
}
