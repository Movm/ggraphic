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
 * PNG too. Anything that goes wrong answers null, which is the PNG path.
 */
import { itemBounds } from '../scene/itemBounds.js';
import { rebaseOps } from '../scene/rebaseOps.js';
import { resolveScene } from '../scene/resolveScene.js';
import { emptyReport, type ExportScene, type SceneItem, type SceneOp } from '../scene/types.js';
import { formatNumber } from '../svg/xml.js';
import { writeSvg } from '../svg/writeSvg.js';
import { fontsOf, type VectorExportDeps } from '../vectorExport.js';

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

/** A picture that is not all vector: a raster op anywhere in the element. */
function hasRaster(ops: readonly SceneOp[]): boolean {
  return ops.some((op) => op.kind === 'raster' || (op.kind === 'group' && hasRaster(op.ops)));
}

/** An SVG picture with text of its own: a viewer sets it in whatever font it has. */
function hasPictureText(ops: readonly SceneOp[]): boolean {
  return ops.some(
    (op) =>
      (op.kind === 'image' && op.image.kind === 'svg' && /<text[\s>]/i.test(op.image.markup)) ||
      (op.kind === 'group' && hasPictureText(op.ops))
  );
}

/** The root's `width` and `height` (not its `viewBox`) at `PREVIEW_SCALE` times the page px. */
function sizeForPreview(svg: string, width: number, height: number): string {
  return svg.replace(
    /^(<svg [^>]*? width=")[^"]*(" height=")[^"]*"/,
    (_whole, before: string, between: string) =>
      `${before}${formatNumber(width * PREVIEW_SCALE)}${between}${formatNumber(height * PREVIEW_SCALE)}"`
  );
}

export function createVectorizer(deps: VectorExportDeps): Vectorize {
  // One cache for the export: a face used by several elements is read once.
  const fontDeps: FontSourceDeps = { ...deps.fontDeps, cache: deps.fontDeps.cache ?? new Map() };
  const slides = new Map<number, Promise<ExportScene | null>>();

  const sceneOf = (slideIndex: number): Promise<ExportScene | null> => {
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
    const svg = writeSvg(alone, { text: 'outlines', fonts, report, page });
    // A run without a font file came out as `<text>`: the PNG shows what the canvas showed.
    if (report.missingGlyphs.length > 0) return null;
    return { svg: sizeForPreview(svg, box.width, box.height), box };
  };

  return async (request, slideIndex) => {
    try {
      const scene = await sceneOf(slideIndex);
      const item = scene?.items.find((candidate) => candidate.elementId === request.elementId);
      if (!item || hasRaster(item.ops) || hasPictureText(item.ops)) return null;
      return await write(item, slideIndex + 1);
    } catch {
      return null;
    }
  };
}
