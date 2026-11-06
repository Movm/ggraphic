// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The canvas Konva draws a page element into while it is recorded for export. Its 2D context is a
 * `RecordingContext`, so what Konva draws becomes scene ops instead of pixels.
 *
 * Konva's one non-trivial use of a second canvas is the buffer: a shape or isolated group that
 * needs compositing (opacity over fill and stroke, a shadow under both, `isolated: true`) is drawn
 * into a nested canvas first, and that canvas is then copied onto the parent with the opacity,
 * shadow and clip of the parent. `_prepareIsolationCanvas` hands out that nested canvas; here it
 * is another recording canvas, and the parent's `drawImage` of it becomes a `group` op.
 */
import { SceneCanvas } from 'konva/lib/Canvas.js';

import { RecordingContext } from './recordingContext.js';

import type { SceneOp } from './types.js';

export interface RecordingSceneCanvasOptions {
  /** The page size in px. Konva only buffers on a canvas that is not empty, so it must be > 0. */
  width: number;
  height: number;
  page: number;
  /**
   * The canvas pixel ratio Konva sizes device-px quantities with: a shadow's blur and offsets, and
   * the width of a stroke that does not scale (`strokeScaleEnabled: false`), are the node's own
   * numbers times its absolute scale times this. An export draws the stage at 1 / display scale,
   * so that the display scale cancels; so must this, or these quantities come out in display px.
   * Default 1.
   */
  pixelRatio?: number;
  /** Real 2D context used only for `measureText`. */
  measure: CanvasRenderingContext2D;
  /** Called for a context call the recorder does not model; the caller makes the element a raster island. */
  onUnknown: (call: string) => void;
}

export class RecordingSceneCanvas extends SceneCanvas {
  readonly recorder: RecordingContext;

  private readonly options: RecordingSceneCanvasOptions;
  /** The nested canvases handed out for buffered draws, by their canvas element. */
  private readonly nested = new Map<CanvasImageSource, RecordingSceneCanvas>();

  constructor(options: RecordingSceneCanvasOptions) {
    // `pixelRatio: 1` keeps the context's transform and every `drawImage` argument in page px. The
    // bitmap stays 1 px: nothing is ever drawn into it, and one page-sized bitmap per element is
    // tens of MB on a print format. Konva reads the size from `width` and `height`, set below.
    super({ width: 1, height: 1, pixelRatio: 1 });
    this.width = options.width;
    this.height = options.height;
    // A plain field in Konva; `setPixelRatio` would resize the bitmap.
    this.pixelRatio = options.pixelRatio ?? 1;
    this.options = options;
    this.recorder = new RecordingContext(options);
    // The one place the recorder meets Konva: `SceneContext` forwards every call to `_context`,
    // which is typed as the DOM context. The recorder implements the members Konva calls on it.
    this.getContext()._context = this.recorder as unknown as CanvasRenderingContext2D;
  }

  /**
   * A fresh recording canvas for one buffered draw. Konva makes its own buffer cover the painted
   * bounds and shift the origin there; this one keeps the parent's origin and size, so the ops it
   * records are already in the parent's space (page px) and the group needs no extra translate.
   */
  override _prepareIsolationCanvas(): SceneCanvas {
    const surface = new RecordingSceneCanvas(this.options);
    surface._isolationRect = { x: 0, y: 0, width: this.width, height: this.height };
    const { a, b, c, d, e, f } = this.recorder.getTransform();
    surface.recorder.setTransform(a, b, c, d, e, f);
    this.nested.set(surface._canvas, surface);
    return surface;
  }

  /**
   * Nothing to release: every buffered draw has its own canvas, and `collect` still needs them.
   * Konva calls this from `setSize` (the constructor) and from the error paths.
   */
  override _releaseIsolationCanvas(): void {}

  /**
   * The recorded ops. A `drawImage` of one of this canvas's nested canvases becomes a `group` op
   * with what that canvas recorded; its alpha, clip and shadow are the ones in force when Konva
   * copied it. A buffer that drew nothing leaves no op.
   */
  collect(): SceneOp[] {
    return this.recorder.ops.flatMap((op): SceneOp[] => {
      if (op.kind !== 'image' || op.image.kind !== 'element') return [op];
      const surface = this.nested.get(op.image.element);
      if (!surface) return [op];
      const ops = surface.collect();
      if (ops.length === 0) return [];
      const { matrix, alpha, clips, shadow } = op;
      return [{ kind: 'group', matrix, alpha, clips, shadow, ops }];
    });
  }
}
