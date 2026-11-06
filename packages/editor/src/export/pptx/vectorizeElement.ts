// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Answers a PPTX raster request with the element as SVG instead of a PNG: the page is recorded
 * and resolved once per slide (the way the SVG export does it), the request's element is picked
 * out of it, and a scene of that one element, moved so its bounds start at the origin, is written
 * as an SVG whose size is those bounds. PowerPoint draws the SVG and keeps a PNG preview for
 * viewers that do not.
 *
 * Only an element that is vector all the way is answered: a raster op in it (a filtered photo, a
 * glyph run no font covers) means the SVG would hold a picture of it, and the PNG of the element
 * does that better. Text is outlines, so no viewer needs a font the file does not carry; an
 * element whose text cannot be outlined, or whose SVG picture sets its own text, is left to the
 * PNG too. So is an element with a shadow (the PNG has it baked in; whether PowerPoint draws a
 * filter shadow is not known) and one the resolver lost a picture of (an SVG with a part missing).
 *
 * The SVG is checked before it is answered (`svgPicture.ts`): pptxgenjs makes its PNG preview
 * together with the rest of the media, and one SVG that fails there loses the whole deck. Anything
 * that goes wrong answers null, which is the PNG path.
 */
import { itemBounds } from '../scene/itemBounds.js';
import { rebaseOps } from '../scene/rebaseOps.js';
import { resolveScene } from '../scene/resolveScene.js';
import { emptyReport, type ExportScene, type SceneItem, type SceneOp } from '../scene/types.js';
import { formatNumber } from '../svg/xml.js';
import { writeSvg } from '../svg/writeSvg.js';
import { fontsOf, type VectorExportDeps } from '../vectorExport.js';
import { canPreviewSvg, isWellFormedSvg } from './svgPicture.js';

import type { PptxRasterRequest } from './types.js';
import type { PptxVectorImage } from './writePptx.js';
import type { FontSourceDeps } from '../fonts/fontFiles.js';

export type Vectorize = (
  request: PptxRasterRequest,
  slideIndex: number
) => Promise<PptxVectorImage | null>;

/**
 * The SVG is sized at this many px to the page px. pptxgenjs makes the PNG preview of an SVG at
 * the SVG's own size, and the raster this replaces was drawn at twice the page px.
 */
const PREVIEW_SCALE = 2;
/** What a canvas holds in one go (the preview is drawn on one): per side, and in all. */
const MAX_PREVIEW_SIDE = 8192;
const MAX_PREVIEW_AREA = 16_000_000;

/** Whether `test` holds for an op, or for any op inside a group. */
function someOp(ops: readonly SceneOp[], test: (op: SceneOp) => boolean): boolean {
  return ops.some((op) => test(op) || (op.kind === 'group' && someOp(op.ops, test)));
}

const isRaster = (op: SceneOp) => op.kind === 'raster';
const hasShadow = (op: SceneOp) => op.shadow !== null;
/** An SVG picture with text of its own: a viewer sets it in whatever font it has. */
const hasPictureText = (op: SceneOp) =>
  op.kind === 'image' && op.image.kind === 'svg' && /<text[\s>]/i.test(op.image.markup);

/** The root's `width` and `height` (not its `viewBox`) at the preview scale, within what a canvas holds. */
function sizeForPreview(svg: string, width: number, height: number): string {
  const scale = Math.min(
    PREVIEW_SCALE,
    MAX_PREVIEW_SIDE / Math.max(width, height),
    Math.sqrt(MAX_PREVIEW_AREA / (width * height))
  );
  return svg.replace(
    /^(<svg [^>]*? width=")[^"]*(" height=")[^"]*"/,
    (_whole, before: string, between: string) =>
      `${before}${formatNumber(width * scale)}${between}${formatNumber(height * scale)}"`
  );
}

export interface VectorizeOptions {
  /** Whether a browser decodes this SVG and lets a canvas export it. Default: `canPreviewSvg`. */
  canPreview?: (svg: string) => Promise<boolean>;
}

export function createVectorizer(
  deps: VectorExportDeps,
  { canPreview = canPreviewSvg }: VectorizeOptions = {}
): Vectorize {
  // One cache for the export: a face used by several elements is read once.
  const fontDeps: FontSourceDeps = { ...deps.fontDeps, cache: deps.fontDeps.cache ?? new Map() };
  const slides = new Map<number, Promise<ExportScene | null>>();

  const sceneOf = (slideIndex: number): Promise<ExportScene | null> => {
    // Slides are asked for in order: a scene no later request needs is not kept.
    for (const earlier of slides.keys()) if (earlier < slideIndex) slides.delete(earlier);
    let scene = slides.get(slideIndex);
    if (!scene) {
      scene = (async () => {
        const recorded = await deps.recordPage(slideIndex, { transparent: false });
        if (!recorded) return null;
        return resolveScene(recorded, {
          ...deps.resolveDeps(slideIndex),
          page: slideIndex + 1,
        });
      })().catch(() => null);
      slides.set(slideIndex, scene);
    }
    return scene;
  };

  const write = async (item: SceneItem, page: number): Promise<PptxVectorImage | null> => {
    const bounds = itemBounds(item);
    if (!bounds) return null;
    const box = {
      x: bounds.x0,
      y: bounds.y0,
      width: bounds.x1 - bounds.x0,
      height: bounds.y1 - bounds.y0,
    };
    if (box.width <= 0 || box.height <= 0) return null;

    const report = emptyReport();
    const moved: SceneItem = { ...item, ops: rebaseOps(item.ops, box, 1) };
    const alone: ExportScene = { width: box.width, height: box.height, items: [moved], report };
    const fonts = await fontsOf(alone, fontDeps);
    const written = writeSvg(alone, { text: 'outlines', fonts, report, page });
    // A run without a font file came out as `<text>`: the PNG shows what the canvas showed.
    if (report.missingGlyphs.length > 0) return null;
    const svg = sizeForPreview(written, box.width, box.height);
    // pptxgenjs would fail the whole deck on an SVG it cannot make a preview of.
    if (!isWellFormedSvg(svg) || !(await canPreview(svg))) return null;
    return { svg, box };
  };

  return async (request, slideIndex) => {
    try {
      const scene = await sceneOf(slideIndex);
      const item = scene?.items.find((candidate) => candidate.elementId === request.elementId);
      if (!scene || !item) return null;
      // The resolver drops a picture it cannot read: what is left is not the element.
      if (scene.report.missingElements.some((m) => m.elementId === request.elementId)) return null;
      const ops = item.ops;
      if (someOp(ops, isRaster) || someOp(ops, hasShadow) || someOp(ops, hasPictureText)) {
        return null;
      }
      return await write(item, slideIndex + 1);
    } catch {
      return null;
    }
  };
}
