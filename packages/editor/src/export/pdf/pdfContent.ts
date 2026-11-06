// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Writes scene ops as the operators of a PDF content stream.
 *
 * - Every op is its own `q ... Q`: clips (in page px, each mapped by its own matrix, `W n`), then
 *   the op's matrix as `cm`, then the graphics state and the paint. Nothing leaks to the next op.
 * - Content is page px with y down. The page's single `cm` flips it; `base` is what maps that
 *   flipped space to the default space of the stream being written, which a pattern matrix needs.
 * - Alpha is an `ExtGState` (`ca` and `CA`). A gradient with stops of different alpha adds a
 *   luminosity soft mask. A group with several children and an alpha is a transparency group
 *   (a form XObject), so the alpha applies to the group as one picture.
 * - Text is real text: embedded subset fonts, one `Tm` per run and `TJ` adjustments that put every
 *   glyph at the x the browser measured. A font that may not be embedded is drawn as outlines;
 *   what no font file covers becomes a raster island.
 * - Raster islands are asked for through `rasterize`; an island nobody could make is reported in
 *   `missingElements`, never left out quietly.
 */
import { glyphOutline, splitRuns, type GlyphRun } from '../fonts/glyphs.js';
import { IDENTITY, invert, multiply } from '../scene/matrix.js';
import { svgToScene, type SvgToSceneDefaults } from '../svg/svgToScene.js';
import { formatNumber } from '../svg/xml.js';
import {
  commandsBounds,
  growRect,
  intersectRect,
  isDegenerate,
  isIdentity,
  matrixOperands,
  num,
  opBounds,
  pathOperators,
  strokePad,
  textBounds,
  transformRect,
  unionRect,
  unit,
  type Rect,
} from './pdfGeometry.js';
import { type PageResources, type PdfAssets } from './pdfResources.js';

import type { FontFile, FontFileSet } from '../fonts/fontFiles.js';
import type {
  ClipPath,
  ExportReport,
  Matrix,
  Paint,
  PathCommand,
  RasterReason,
  SceneImageSource,
  SceneOp,
  Shadow,
  StrokeStyle,
} from '../scene/types.js';
import type { PDFRef } from 'pdf-lib';

/** A box of the page in px. */
export interface RasterBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Draws `ops` (in page px, each with its own state) on a canvas that shows `box` at `pixelRatio`
 * and returns it as PNG, transparent where nothing is drawn; null if it cannot. See `rebaseOps`.
 */
export type RasterizeOps = (
  ops: SceneOp[],
  box: RasterBox,
  pixelRatio: number
) => Promise<Uint8Array | null>;

/** What the writer of one page needs from the document. */
export interface PageEnv {
  assets: PdfAssets;
  resources: PageResources;
  /** The page's number in the report (1-based). */
  page: number;
  width: number;
  height: number;
  fonts: ReadonlyMap<string, FontFileSet>;
  /** The entries this writer adds; the caller merges them with the scenes' own. */
  report: ExportReport;
  rasterize: RasterizeOps;
  pixelRatio: number;
  svgDefaults: SvgToSceneDefaults;
  /** The item being written, for the report. */
  elementId: string | null;
}

type PathOp = Extract<SceneOp, { kind: 'path' }>;
type TextOp = Extract<SceneOp, { kind: 'text' }>;
type ImageOp = Extract<SceneOp, { kind: 'image' }>;
type GroupOp = Extract<SceneOp, { kind: 'group' }>;
type RasterOp = Extract<SceneOp, { kind: 'raster' }>;
type SvgSource = Extract<SceneImageSource, { kind: 'svg' }>;

const PLAIN_STROKE: StrokeStyle = {
  width: 1,
  cap: 'butt',
  join: 'miter',
  miterLimit: 10,
  dash: [],
  dashOffset: 0,
};
const CAP = { butt: 0, round: 1, square: 2 } as const;
const JOIN = { miter: 0, round: 1, bevel: 2 } as const;

/** Nothing to see in a run of these: no island for a zero-width space. */
const INVISIBLE = /^[\p{Cc}\p{Cf}\p{Zs}]*$/u;

const rgb = (hex: string): string =>
  [1, 3, 5].map((at) => unit(Number.parseInt(hex.slice(at, at + 2), 16) / 255)).join(' ');

const faceKey = (op: TextOp) => `${op.font.family}|${op.font.weight}|${op.font.style}`;

export class ContentWriter {
  private readonly lines: string[] = [];

  /**
   * @param base maps the page px space the ops are in to the default space of the stream this
   *   writes: the page flip for the page, the identity inside a form drawn after that flip.
   */
  constructor(
    private readonly env: PageEnv,
    private readonly base: Matrix
  ) {}

  raw(line: string): void {
    this.lines.push(line);
  }

  text(): string {
    return this.lines.join('\n');
  }

  async ops(ops: readonly SceneOp[]): Promise<void> {
    for (const op of ops) await this.op(op);
  }

  async op(op: SceneOp): Promise<void> {
    if (op.clips.some((clip) => clip.commands.length === 0)) return; // clips everything away
    if (isDegenerate(op.matrix)) return;
    if (op.shadow) await this.shadowIsland(op, op.shadow);
    switch (op.kind) {
      case 'path':
        return this.path(op);
      case 'text':
        return this.textOp(op);
      case 'image':
        return this.image(op);
      case 'group':
        return this.group(op);
      case 'raster':
        return this.raster(op);
    }
  }

  // -- graphics state ----------------------------------------------------------------------

  /** `q`, the clips, and the matrix. Every `begin` has an `end`. */
  private begin(
    op: { clips: readonly ClipPath[]; matrix: Matrix },
    matrix: Matrix = op.matrix
  ): void {
    this.raw('q');
    for (const clip of op.clips) this.clip(clip);
    if (!isIdentity(matrix)) this.raw(`${matrixOperands(matrix)} cm`);
  }

  private end(): void {
    this.raw('Q');
  }

  /** The clip path in page px: its own matrix applied here, so it needs no `cm` of its own. */
  private clip(clip: ClipPath): void {
    this.raw(
      `${pathOperators(clip.commands, clip.matrix)} ${clip.rule === 'evenodd' ? 'W*' : 'W'} n`
    );
  }

  private alpha(alpha: number, softMask: PDFRef | null = null): string[] {
    return alpha >= 0.99995 && !softMask
      ? []
      : [`${this.env.resources.extGState(alpha, softMask)} gs`];
  }

  private strokeState(stroke: StrokeStyle | null): string[] {
    const s = stroke ?? PLAIN_STROKE;
    const dashed =
      s.dash.length > 0 &&
      s.dash.every((length) => Number.isFinite(length) && length >= 0) &&
      s.dash.some((length) => length > 0);
    return [
      `${num(s.width)} w`,
      `${CAP[s.cap]} J`,
      `${JOIN[s.join]} j`,
      ...(s.join === 'miter' ? [`${num(s.miterLimit)} M`] : []),
      `[${dashed ? s.dash.map(num).join(' ') : ''}] ${dashed ? num(s.dashOffset) : 0} d`,
    ];
  }

  // -- paint -------------------------------------------------------------------------------

  /**
   * The operators that set alpha and the colour of a fill or a stroke, or null if the paint draws
   * nothing. `matrix` is the op's, `bounds` the area it touches in its user space (a soft mask is
   * as large as that and no larger).
   */
  private async paint(
    mode: 'fill' | 'stroke',
    paint: Paint,
    op: { alpha: number; matrix: Matrix },
    bounds: Rect
  ): Promise<string[] | null> {
    const { assets, resources } = this.env;
    const stroke = mode === 'stroke';
    switch (paint.type) {
      case 'solid':
        return [...this.alpha(op.alpha * paint.alpha), `${rgb(paint.hex)} ${stroke ? 'RG' : 'rg'}`];
      case 'linear':
      case 'radial': {
        const shading = assets.shading(paint, 'rgb');
        if (!shading) return null; // canvas paints nothing for these
        const first = paint.stops[0]?.alpha ?? 1;
        const uniform = paint.stops.every((stop) => stop.alpha === first);
        const mask = uniform ? null : assets.alphaMask(paint, growRect(bounds, 1));
        const pattern = assets.shadingPattern(shading, multiply(this.base, op.matrix));
        return [
          ...this.alpha(op.alpha * (uniform ? first : 1), mask),
          `/Pattern ${stroke ? 'CS' : 'cs'} ${resources.pattern(pattern)} ${stroke ? 'SCN' : 'scn'}`,
        ];
      }
      case 'pattern': {
        const tile = paint.image;
        const image =
          tile.kind === 'bitmap'
            ? await assets.bitmap(tile)
            : tile.kind === 'svg'
              ? await this.rasterTile(tile)
              : null;
        if (!image) {
          this.missing();
          return null;
        }
        const matrix = multiply(this.base, multiply(op.matrix, paint.matrix));
        const pattern = assets.tilingPattern(image, tile.width, tile.height, matrix);
        return [
          ...this.alpha(op.alpha),
          `/Pattern ${stroke ? 'CS' : 'cs'} ${resources.pattern(pattern)} ${stroke ? 'SCN' : 'scn'}`,
        ];
      }
    }
  }

  /** An SVG tile cannot be a PDF image: it is drawn once, at its size, by the rasteriser. */
  private async rasterTile(tile: SvgSource) {
    const ops: SceneOp[] = [
      {
        matrix: IDENTITY,
        alpha: 1,
        clips: [],
        shadow: null,
        kind: 'image',
        image: tile,
        sx: 0,
        sy: 0,
        sw: tile.width,
        sh: tile.height,
        dx: 0,
        dy: 0,
        dw: tile.width,
        dh: tile.height,
      },
    ];
    const { assets, report, page } = this.env;
    report.rasterIslands.push({
      page,
      elementId: this.env.elementId,
      reason: 'unsupported-pattern',
    });
    const png = await this.env.rasterize(
      ops,
      { x: 0, y: 0, width: tile.width, height: tile.height },
      this.env.pixelRatio
    );
    return png ? assets.image(tile, png, 'image/png') : null;
  }

  private missing(): void {
    const { report, page } = this.env;
    report.missingElements.push({
      page,
      elementId: this.env.elementId,
      reason: 'image-unreadable',
    });
  }

  // -- paths -------------------------------------------------------------------------------

  private async path(op: PathOp): Promise<void> {
    if (op.commands.length === 0) return;
    const bounds = commandsBounds(op.commands);
    if (!bounds) return;
    await this.paintPath(op, op.commands, bounds, op.mode === 'stroke' ? strokePad(op.stroke) : 0);
  }

  /** `commands` painted with the op's paint, in the op's space; `pad` is how far a stroke reaches. */
  private async paintPath(
    op: Pick<PathOp, 'mode' | 'paint' | 'stroke' | 'rule' | 'alpha' | 'matrix' | 'clips'>,
    commands: readonly PathCommand[] | string,
    bounds: Rect,
    pad: number
  ): Promise<void> {
    const paint = await this.paint(op.mode, op.paint, op, growRect(bounds, pad));
    if (!paint) return;
    this.begin(op);
    for (const line of paint) this.raw(line);
    if (op.mode === 'stroke') for (const line of this.strokeState(op.stroke)) this.raw(line);
    this.raw(typeof commands === 'string' ? commands : pathOperators(commands));
    this.raw(op.mode === 'stroke' ? 'S' : op.rule === 'evenodd' ? 'f*' : 'f');
    this.end();
  }

  // -- text --------------------------------------------------------------------------------

  private async textOp(op: TextOp): Promise<void> {
    if (op.text === '' || !(op.font.size > 0)) return;
    const set = this.env.fonts.get(faceKey(op));
    const runs: GlyphRun[] = set
      ? splitRuns(set, op.text, op.xs)
      : [{ file: null, text: op.text, xs: op.xs }];
    const hasFiles = !!set && set.files.length > 0;
    for (const run of runs) {
      if (run.file === null) {
        await this.rasterRun(op, run, hasFiles ? 'missing-glyph' : 'font-unavailable');
      } else if (run.file.embeddable === 'bitmap-only') {
        await this.rasterRun(op, run, 'bitmap-only-font');
      } else if (run.file.embeddable === 'outlines-only') {
        await this.outlineRun(op, run, run.file);
      } else {
        await this.textRun(op, run, run.file, set!);
      }
    }
  }

  /** Real text: the glyphs of `run` in the embedded subset of `file`, each at its measured x. */
  private async textRun(
    op: TextOp,
    run: GlyphRun,
    file: FontFile,
    set: FontFileSet
  ): Promise<void> {
    const { assets, resources } = this.env;
    const font = await assets.font(file, set.face, set.files.indexOf(file));
    const size = op.font.size;
    const perEm = 1000 / file.font.unitsPerEm;

    // Pen position in user space after each glyph; a number in `TJ` moves it by -n/1000 em.
    const x0 = run.xs[0] ?? 0;
    let pen = x0;
    let hex = '';
    const parts: (string | number)[] = [];
    Array.from(run.text).forEach((char, index) => {
      const codePoint = char.codePointAt(0) ?? 0;
      const x = run.xs[index];
      if (index > 0 && x !== undefined) {
        const shift = Number(formatNumber(((pen - x) * 1000) / size, 2));
        if (Math.abs(shift) >= 0.05) {
          if (hex) parts.push(`<${hex}>`);
          hex = '';
          parts.push(shift);
          pen -= (shift * size) / 1000;
        }
      }
      // `encodeText` is what makes pdf-lib keep this glyph in the subset.
      hex += font.encodeText(char).toString().slice(1, -1);
      pen += file.font.glyphForCodePoint(codePoint).advanceWidth * perEm * (size / 1000);
    });
    if (hex) parts.push(`<${hex}>`);
    if (parts.length === 0) return;

    const bounds = textBounds({ ...op, xs: run.xs });
    if (!bounds) return;
    const paint = await this.paint(op.mode, op.paint, op, bounds);
    if (!paint) return;
    this.begin(op);
    for (const line of paint) this.raw(line);
    if (op.mode === 'stroke') for (const line of this.strokeState(op.stroke)) this.raw(line);
    this.raw('BT');
    if (op.mode === 'stroke') this.raw('1 Tr');
    this.raw(`${resources.font(font)} ${num(size)} Tf`);
    // The page is y down, text is y up: a flipped text matrix stands the glyphs up again.
    this.raw(`1 0 0 -1 ${num(x0)} ${num(op.y)} Tm`);
    this.raw(`[${parts.join(' ')}] TJ`);
    this.raw('ET');
    this.end();
  }

  /** A font whose licence forbids embedding: its glyph shapes as paths, crisp but not selectable. */
  private async outlineRun(op: TextOp, run: GlyphRun, file: FontFile): Promise<void> {
    const glyphs = glyphOutline(file, run.text, op.font.size);
    const commands = glyphs
      .map((glyph, index) => pathOperators(glyph.path, [1, 0, 0, 1, run.xs[index] ?? 0, op.y]))
      .filter((operators) => operators !== '')
      .join(' ');
    if (commands === '') return;
    const { outlinedForLicence } = this.env.report;
    if (!outlinedForLicence.includes(op.font.family)) outlinedForLicence.push(op.font.family);
    const bounds = textBounds({ ...op, xs: run.xs });
    if (!bounds) return;
    await this.paintPath(
      { ...op, rule: 'nonzero' },
      commands,
      bounds,
      op.mode === 'stroke' ? strokePad(op.stroke) : 0
    );
  }

  /** The run as a picture: what no font file covers, drawn by whoever has a font for it. */
  private async rasterRun(op: TextOp, run: GlyphRun, reason: RasterReason): Promise<void> {
    if (INVISIBLE.test(run.text)) return;
    const { report, page } = this.env;
    report.missingGlyphs.push({ page, elementId: this.env.elementId, text: run.text });
    const bounds = textBounds({ ...op, xs: run.xs });
    const box = bounds && this.visible(transformRect(bounds, op.matrix), op.clips);
    if (!box) return;
    await this.island([{ ...op, text: run.text, xs: run.xs, shadow: null }], box, reason);
  }

  // -- shadows and islands -----------------------------------------------------------------

  /**
   * A shadow is a picture under the op, which stays vector. The picture holds the shadow alone:
   * the op is replayed 'big' px to the left with its shadow offset by 'big' to the right, so the
   * shape lands off the picture and only its shadow stays (a canvas draws the shadow of a shape
   * wherever it is). The op's own alpha and clips are part of the picture.
   */
  private async shadowIsland(op: SceneOp, shadow: Shadow): Promise<void> {
    if (!(shadow.alpha > 0)) return;
    if (shadow.blur === 0 && shadow.offsetX === 0 && shadow.offsetY === 0) return; // none is drawn
    const shape = opBounds({ ...op, clips: [] });
    if (!shape) return;
    const reach = 1.5 * shadow.blur + 1; // three sigma of the Gaussian, and a pixel
    const moved = growRect(
      {
        x0: shape.x0 + shadow.offsetX,
        y0: shape.y0 + shadow.offsetY,
        x1: shape.x1 + shadow.offsetX,
        y1: shape.y1 + shadow.offsetY,
      },
      reach
    );
    const box = this.visible(moved, op.clips);
    if (!box) return;
    const big = Math.ceil(Math.max(0, shape.x1 - box.x0)) + 8;
    const shadowOnly: SceneOp = {
      ...op,
      matrix: multiply([1, 0, 0, 1, -big, 0], op.matrix),
      shadow: { ...shadow, offsetX: shadow.offsetX + big },
    };
    await this.island([shadowOnly], box, 'shadow');
  }

  /** The part of `rect` (page px) the clips and the page let through. */
  private visible(rect: Rect, clips: readonly ClipPath[]): Rect | null {
    let result: Rect | null = intersectRect(rect, {
      x0: 0,
      y0: 0,
      x1: this.env.width,
      y1: this.env.height,
    });
    for (const clip of clips) {
      const box = commandsBounds(clip.commands);
      if (!result || !box) return null;
      result = intersectRect(result, transformRect(box, clip.matrix));
    }
    return result;
  }

  /** Asks for the picture, places it, reports it; if there is none, reports that instead. */
  private async island(ops: SceneOp[], box: Rect, reason: RasterReason): Promise<void> {
    const { assets, resources, report, page, pixelRatio } = this.env;
    // Whole device px, so the picture and the box it is placed in are the same size.
    const snapped: Rect = {
      x0: Math.floor(box.x0 * pixelRatio) / pixelRatio,
      y0: Math.floor(box.y0 * pixelRatio) / pixelRatio,
      x1: Math.ceil(box.x1 * pixelRatio) / pixelRatio,
      y1: Math.ceil(box.y1 * pixelRatio) / pixelRatio,
    };
    const png = await this.env.rasterize(
      ops,
      {
        x: snapped.x0,
        y: snapped.y0,
        width: snapped.x1 - snapped.x0,
        height: snapped.y1 - snapped.y0,
      },
      pixelRatio
    );
    report.rasterIslands.push({ page, elementId: this.env.elementId, reason });
    const image = png ? await assets.image(png, png, 'image/png') : null;
    if (!image) {
      this.missing();
      return;
    }
    this.picture(
      resources.xobject(image.ref),
      snapped.x0,
      snapped.y0,
      snapped.x1 - snapped.x0,
      snapped.y1 - snapped.y0
    );
  }

  /** An image XObject over a rect of the (y down) page: the unit square, y up, stood on its head. */
  private picture(name: string, x: number, y: number, width: number, height: number): void {
    this.raw(`q ${matrixOperands([width, 0, 0, -height, x, y + height])} cm ${name} Do Q`);
  }

  // -- images ------------------------------------------------------------------------------

  private async image(op: ImageOp): Promise<void> {
    const source = op.image;
    if (op.sw === 0 || op.sh === 0 || op.dw === 0 || op.dh === 0) return;
    if (source.kind === 'element') {
      this.missing(); // `resolveScene` leaves none; an unresolved one is not drawn, so it is said
      return;
    }
    if (source.kind === 'svg') return this.svgImage(op, source);
    const image = await this.env.assets.bitmap(source);
    if (!image) {
      this.missing();
      return;
    }
    // The canvas draws the source rect stretched onto the destination rect: the whole picture
    // goes where it would land, and anything of it outside the destination rect is clipped.
    const kx = op.dw / op.sw;
    const ky = op.dh / op.sh;
    const whole =
      num(op.sx) === '0' &&
      num(op.sy) === '0' &&
      num(op.sw) === num(source.width) &&
      num(op.sh) === num(source.height);
    this.begin(op);
    for (const line of this.alpha(op.alpha)) this.raw(line);
    if (!whole) this.raw(`${num(op.dx)} ${num(op.dy)} ${num(op.dw)} ${num(op.dh)} re W n`);
    this.picture(
      this.env.resources.xobject(image.ref),
      op.dx - op.sx * kx,
      op.dy - op.sy * ky,
      source.width * kx,
      source.height * ky
    );
    this.end();
  }

  /**
   * An SVG source is drawn as the ops `svgToScene` makes of it, with the image op's alpha, clips
   * and a crop around them as a group. A source it cannot reproduce completely is one raster
   * island, as a whole.
   */
  private async svgImage(op: ImageOp, source: SvgSource): Promise<void> {
    const kx = op.dw / op.sw;
    const ky = op.dh / op.sh;
    // The picture at its natural size, stretched onto the destination rect; a crop is a clip.
    const matrix = multiply(
      op.matrix,
      multiply(
        [1, 0, 0, 1, op.dx, op.dy],
        multiply([kx, 0, 0, ky, 0, 0], [1, 0, 0, 1, -op.sx, -op.sy])
      )
    );
    const { ops, unsupported } = svgToScene(
      source.markup,
      { matrix, width: source.width, height: source.height },
      this.env.svgDefaults
    );
    if (unsupported.length > 0) {
      const bounds = opBounds({ ...op, clips: [] });
      const box = bounds && this.visible(bounds, op.clips);
      if (box) await this.island([{ ...op, shadow: null }], box, 'svg-unsupported');
      return;
    }
    const whole =
      num(op.sx) === '0' &&
      num(op.sy) === '0' &&
      num(op.sw) === num(source.width) &&
      num(op.sh) === num(source.height);
    const crop: ClipPath = {
      matrix: op.matrix,
      commands: [
        { op: 'M', x: op.dx, y: op.dy },
        { op: 'L', x: op.dx + op.dw, y: op.dy },
        { op: 'L', x: op.dx + op.dw, y: op.dy + op.dh },
        { op: 'L', x: op.dx, y: op.dy + op.dh },
        { op: 'Z' },
      ],
      rule: 'nonzero',
    };
    await this.group({
      kind: 'group',
      matrix: IDENTITY,
      alpha: op.alpha,
      clips: whole ? op.clips : [...op.clips, crop],
      shadow: null, // made for the image op already
      ops,
    });
  }

  private async raster(op: RasterOp): Promise<void> {
    if (!op.png) {
      // No pixels: what the island was made of, each op with its own state.
      if (op.source) await this.ops(op.source);
      return;
    }
    const image = await this.env.assets.image(op.png, op.png, 'image/png');
    if (!image) {
      this.missing();
      return;
    }
    this.begin(op);
    for (const line of this.alpha(op.alpha)) this.raw(line);
    this.picture(this.env.resources.xobject(image.ref), op.x, op.y, op.width, op.height);
    this.end();
  }

  // -- groups ------------------------------------------------------------------------------

  /**
   * The children in the group's clips. A group is composited from a buffer, so its alpha applies
   * to all of it at once: a transparency group when there are several children and an alpha. One
   * child takes the alpha itself, which comes out the same.
   */
  private async group(op: GroupOp): Promise<void> {
    if (op.ops.length === 0) return;
    const alone = op.ops.length === 1 ? op.ops[0]! : null;
    const flat = op.alpha >= 0.99995 || alone !== null;
    const needsState = op.clips.length > 0 || !isIdentity(op.matrix);

    if (flat) {
      const children = alone ? [{ ...alone, alpha: alone.alpha * op.alpha }] : op.ops;
      if (needsState) this.begin(op);
      await this.ops(children);
      if (needsState) this.end();
      return;
    }
    const inner = new ContentWriter(this.env, IDENTITY);
    await inner.ops(op.ops);
    // The children are page px; the group's matrix moves the whole picture, so the form's box has
    // to reach wherever the page lands under it.
    const page: Rect = { x0: 0, y0: 0, x1: this.env.width, y1: this.env.height };
    const bbox = unionRect(page, transformRect(page, invert(op.matrix)))!;
    const form = this.env.assets.form(inner.text(), bbox, this.env.resources.snapshot(), {});
    this.begin(op);
    for (const line of this.alpha(op.alpha)) this.raw(line);
    this.raw(`${this.env.resources.xobject(form)} Do`);
    this.end();
  }
}
