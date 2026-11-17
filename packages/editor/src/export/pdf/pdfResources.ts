// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The objects a PDF page draws with, made through pdf-lib: embedded fonts and images (shared by
 * the whole document), and the page's resource dictionary with the names content streams use
 * (`/F1`, `/Im1`, `/GS1`, ...), plus the dictionaries the writer builds by hand: shadings,
 * tiling patterns, transparency groups and soft masks.
 *
 * pdf-lib loads by dynamic `import()` in `writePdf`; this file only holds its types and gets the
 * module passed in.
 */
import { subsetTag, type FontFile } from '../fonts/fontFiles.js';
import { embeddableBytes } from './pdfFontkit.js';
import { unit, type Rect } from './pdfGeometry.js';

import type { FontkitFsType } from '../fonts/glyphs.js';
import type { ColorStop, FontSpec, Matrix, Paint, SceneImageSource } from '../scene/types.js';
import type * as PdfLib from 'pdf-lib';

type PdfLibModule = typeof PdfLib;
type Gradient = Extract<Paint, { type: 'linear' | 'radial' }>;

const FS_NO_SUBSETTING = 0x0100;

/** `OS/2.fsType` bit 8: the font may be embedded, but only whole. */
function forbidsSubsetting(fsType: FontkitFsType | undefined): boolean {
  if (fsType === undefined) return false;
  return typeof fsType === 'number' ? (fsType & FS_NO_SUBSETTING) !== 0 : !!fsType.noSubsetting;
}

/** TrueType (`0x00010000`, `true`) or OpenType (`OTTO`): the files PDF takes as a font program. */
function isSfnt(bytes: Uint8Array): boolean {
  const tag = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  return tag === '\u0000\u0001\u0000\u0000' || tag === 'true' || tag === 'OTTO';
}

/** The PostScript name with the characters a PDF name cannot carry left out. */
function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, '') || 'Font';
}

const alphaKey = (alpha: number) => unit(Math.min(1, Math.max(0, alpha)));

// ---------------------------------------------------------------------------------------------
// The document: what pages share

/** The four inks of a colour, each 0..1. */
export type Ink = readonly [number, number, number, number];

export class PdfAssets {
  /** The hex (lower case) of every colour written as RGB, for `report.rgbBrandColors`. */
  readonly rgbHexes = new Set<string>();
  private readonly fonts = new Map<FontFile, Promise<PdfLib.PDFFont>>();
  private readonly images = new Map<object, Promise<PdfLib.PDFImage | null>>();
  private readonly shadings = new Map<string, PdfLib.PDFRef>();
  private readonly patterns = new Map<string, PdfLib.PDFRef>();
  private readonly made = new Map<object, Promise<PdfLib.PDFImage | null>>();

  /**
   * @param cmyk the colours (hex, lower case) the brand has print values for; whatever paints
   *   with one of them is DeviceCMYK, whatever does not is RGB
   */
  constructor(
    readonly lib: PdfLibModule,
    readonly doc: PdfLib.PDFDocument,
    readonly cmyk: ReadonlyMap<string, Ink> = new Map()
  ) {}

  get context(): PdfLib.PDFContext {
    return this.doc.context;
  }

  /**
   * A subset of the font file, named `ABCDEF+PostScriptName` (pdf-lib's own default has no such
   * tag).
   *
   * A font whose licence says "no subsetting" goes in whole, under its plain name (the prefix
   * tells a reader the font is a subset). An sfnt file (TrueType, OpenType) is embedded as it is.
   * A WOFF or WOFF2 file cannot be: pdf-lib would write its bytes unchanged and no viewer reads a
   * WOFF as a font program. Such a font goes through the subsetter with every glyph it has.
   */
  font(file: FontFile, face: FontSpec, fileIndex: number): Promise<PdfLib.PDFFont> {
    let font = this.fonts.get(file);
    if (!font) {
      const name = safeName(file.font.postscriptName ?? face.family);
      if (!forbidsSubsetting(file.font['OS/2']?.fsType)) {
        font = this.doc.embedFont(embeddableBytes(file), {
          subset: true,
          customName: `${subsetTag(face, fileIndex)}+${name}`,
        });
      } else if (isSfnt(file.bytes)) {
        font = this.doc.embedFont(file.bytes, { subset: false, customName: name });
      } else {
        font = this.doc
          .embedFont(embeddableBytes(file), { subset: true, customName: name })
          .then((whole) => {
            // `encodeText` is what puts a glyph into the subset.
            for (const codePoint of file.font.characterSet) {
              whole.encodeText(String.fromCodePoint(codePoint));
            }
            return whole;
          });
      }
      this.fonts.set(file, font);
    }
    return font;
  }

  /** The image once per `key` (the source object or the PNG bytes); null if pdf-lib cannot read it. */
  image(
    key: object,
    bytes: Uint8Array,
    mime: 'image/png' | 'image/jpeg'
  ): Promise<PdfLib.PDFImage | null> {
    let image = this.images.get(key);
    if (!image) {
      image = (mime === 'image/jpeg' ? this.doc.embedJpg(bytes) : this.doc.embedPng(bytes)).catch(
        () => null
      );
      this.images.set(key, image);
    }
    return image;
  }

  /** The picture `make` draws for `key`, made the first time it is asked for and not again. */
  once(key: object, make: () => Promise<PdfLib.PDFImage | null>): Promise<PdfLib.PDFImage | null> {
    let image = this.made.get(key);
    if (!image) {
      image = make();
      this.made.set(key, image);
    }
    return image;
  }

  bitmap(source: Extract<SceneImageSource, { kind: 'bitmap' }>): Promise<PdfLib.PDFImage | null> {
    return this.image(source, source.bytes, source.mime);
  }

  // -- shadings --------------------------------------------------------------------------

  /**
   * The shading of a gradient: axial (type 2) or radial (type 3), extended past both ends as a
   * canvas gradient is. `channel` picks what the colour function returns: the RGB of the stops,
   * their CMYK (every stop must be in the brand's map), or their alpha as a gray value (for a soft
   * mask). Null when the geometry paints nothing.
   */
  shading(paint: Gradient, channel: 'rgb' | 'cmyk' | 'alpha'): PdfLib.PDFRef | null {
    if (paint.type === 'linear' && paint.x0 === paint.x1 && paint.y0 === paint.y1) return null;
    if (
      paint.type === 'radial' &&
      paint.x0 === paint.x1 &&
      paint.y0 === paint.y1 &&
      paint.r0 === paint.r1
    ) {
      return null;
    }
    const key = `${channel}\0${JSON.stringify(paint)}`;
    let ref = this.shadings.get(key);
    if (!ref) {
      ref = this.context.register(
        this.context.obj({
          ShadingType: paint.type === 'linear' ? 2 : 3,
          ColorSpace:
            channel === 'rgb' ? 'DeviceRGB' : channel === 'cmyk' ? 'DeviceCMYK' : 'DeviceGray',
          Coords:
            paint.type === 'linear'
              ? [paint.x0, paint.y0, paint.x1, paint.y1]
              : [paint.x0, paint.y0, paint.r0, paint.x1, paint.y1, paint.r1],
          Domain: [0, 1],
          Function: this.colourFunction(paint.stops, channel),
          Extend: [true, true],
        })
      );
      this.shadings.set(key, ref);
    }
    return ref;
  }

  /**
   * A stitching function (type 3) of exponential segments (type 2, N = 1) from stop to stop. The
   * ends are extended to 0 and 1 with the first and last colour; a hard stop (two stops at one
   * offset) is a segment of no width and is left out, so the bounds rise strictly.
   */
  private colourFunction(
    stops: readonly ColorStop[],
    channel: 'rgb' | 'cmyk' | 'alpha'
  ): PdfLib.PDFObject {
    const sorted = stops
      .map((stop, index) => ({ stop, index }))
      .sort((a, b) => a.stop.offset - b.stop.offset || a.index - b.index)
      .map(({ stop }) => ({ ...stop, offset: Math.min(1, Math.max(0, stop.offset)) }));
    const first = sorted[0]!;
    const last = sorted.at(-1)!;
    if (first.offset > 0) sorted.unshift({ ...first, offset: 0 });
    if (last.offset < 1) sorted.push({ ...last, offset: 1 });
    const colour = (stop: ColorStop): number[] =>
      channel === 'alpha'
        ? [stop.alpha]
        : channel === 'cmyk'
          ? [...this.cmyk.get(stop.hex.toLowerCase())!]
          : [1, 3, 5].map((at) => Number.parseInt(stop.hex.slice(at, at + 2), 16) / 255);
    const segments: { from: ColorStop; to: ColorStop }[] = [];
    for (let i = 0; i + 1 < sorted.length; i++) {
      if (sorted[i + 1]!.offset > sorted[i]!.offset)
        segments.push({ from: sorted[i]!, to: sorted[i + 1]! });
    }
    // All stops on one offset: what is left is the colour after it.
    if (segments.length === 0) segments.push({ from: last, to: last });
    const exponential = ({ from, to }: { from: ColorStop; to: ColorStop }) =>
      this.context.obj({ FunctionType: 2, Domain: [0, 1], C0: colour(from), C1: colour(to), N: 1 });
    if (segments.length === 1) return exponential(segments[0]!);
    return this.context.obj({
      FunctionType: 3,
      Domain: [0, 1],
      Functions: segments.map(exponential),
      Bounds: segments.slice(1).map((segment) => segment.from.offset),
      Encode: segments.flatMap(() => [0, 1]),
    });
  }

  /** A shading pattern (type 2). `matrix` maps the pattern space to the default space of its content stream. */
  shadingPattern(shading: PdfLib.PDFRef, matrix: Matrix): PdfLib.PDFRef {
    return this.pattern(`${shading.tag}\0${matrix.join(',')}`, () =>
      this.context.obj({ PatternType: 2, Shading: shading, Matrix: [...matrix] })
    );
  }

  /** One pattern object per key: a chart's bars share a gradient and a matrix. */
  private pattern(key: string, make: () => PdfLib.PDFObject): PdfLib.PDFRef {
    let ref = this.patterns.get(key);
    if (!ref) {
      ref = this.context.register(make());
      this.patterns.set(key, ref);
    }
    return ref;
  }

  /**
   * A tiling pattern (type 1) that draws `image` at `width` x `height` once per cell, upright in a
   * y-down pattern space as a canvas pattern is. `matrix` as for `shadingPattern`.
   */
  tilingPattern(
    image: PdfLib.PDFImage,
    width: number,
    height: number,
    matrix: Matrix
  ): PdfLib.PDFRef {
    return this.pattern(`${image.ref.tag}\0${width}x${height}\0${matrix.join(',')}`, () => {
      const content = `q ${unit(width)} 0 0 ${unit(-height)} 0 ${unit(height)} cm /Im1 Do Q`;
      return this.context.flateStream(content, {
        Type: 'Pattern',
        PatternType: 1,
        PaintType: 1,
        TilingType: 1,
        BBox: [0, 0, width, height],
        XStep: width,
        YStep: height,
        Resources: { XObject: { Im1: image.ref } },
        Matrix: [...matrix],
      });
    });
  }

  // -- forms -----------------------------------------------------------------------------

  /** A form XObject; `group` makes it a transparency group, drawn as one picture with the alpha set outside. */
  form(
    content: string,
    bbox: Rect,
    resources: PdfLib.PDFRef | PdfLib.PDFDict,
    group: { colourSpace?: 'DeviceGray' } | null
  ): PdfLib.PDFRef {
    return this.context.register(
      this.context.flateStream(content, {
        Type: 'XObject',
        Subtype: 'Form',
        BBox: [bbox.x0, bbox.y0, bbox.x1, bbox.y1],
        Resources: resources,
        Group: group
          ? { S: 'Transparency', I: true, ...(group.colourSpace && { CS: group.colourSpace }) }
          : undefined,
      })
    );
  }

  /**
   * The soft mask that lets a gradient's alpha through: a luminosity mask whose group paints the
   * gradient's alpha as gray. It is evaluated in the space the graphics state is set in, so the
   * shading's coordinates are the op's own. `bbox` is the area the op can touch, in that space.
   */
  alphaMask(paint: Gradient, bbox: Rect): PdfLib.PDFRef | null {
    const shading = this.shading(paint, 'alpha');
    if (!shading) return null;
    return this.form('/Sh1 sh', bbox, this.context.obj({ Shading: { Sh1: shading } }), {
      colourSpace: 'DeviceGray',
    });
  }
}

// ---------------------------------------------------------------------------------------------
// The page: names

type Category = 'Font' | 'XObject' | 'ExtGState' | 'Pattern';
const PREFIX: Record<Category, string> = {
  Font: 'F',
  XObject: 'Im',
  ExtGState: 'GS',
  Pattern: 'P',
};

/**
 * The resource dictionary of a page. The content of a form XObject on the page is written with the
 * same names, so a form gets a copy of the dictionary as it is when the form is made (`snapshot`):
 * it holds what the form draws with, and not itself.
 */
export class PageResources {
  readonly ref: PdfLib.PDFRef;
  private readonly dict: PdfLib.PDFDict;
  private readonly names = new Map<string, string>();
  private readonly counts = new Map<Category, number>();
  private readonly states = new Map<string, PdfLib.PDFRef>();

  constructor(private readonly assets: PdfAssets) {
    this.dict = assets.context.obj({});
    this.ref = assets.context.register(this.dict);
  }

  private add(category: Category, target: PdfLib.PDFRef): string {
    const key = `${category}\0${target.tag}`;
    let name = this.names.get(key);
    if (!name) {
      const n = (this.counts.get(category) ?? 0) + 1;
      this.counts.set(category, n);
      name = `${PREFIX[category]}${n}`;
      this.names.set(key, name);
      const { PDFName, PDFDict } = this.assets.lib;
      const section = PDFName.of(category);
      let dict = this.dict.get(section);
      if (!(dict instanceof PDFDict)) {
        dict = this.assets.context.obj({});
        this.dict.set(section, dict);
      }
      (dict as PdfLib.PDFDict).set(PDFName.of(name), target);
    }
    return `/${name}`;
  }

  font = (font: PdfLib.PDFFont) => this.add('Font', font.ref);
  xobject = (ref: PdfLib.PDFRef) => this.add('XObject', ref);
  pattern = (ref: PdfLib.PDFRef) => this.add('Pattern', ref);

  /** `ca` and `CA` together, optionally with a soft mask; one dictionary per distinct state. */
  extGState(alpha: number, softMask: PdfLib.PDFRef | null = null): string {
    const key = `${alphaKey(alpha)}\0${softMask?.tag ?? ''}`;
    let ref = this.states.get(key);
    if (!ref) {
      ref = this.assets.context.register(
        this.assets.context.obj({
          Type: 'ExtGState',
          ca: Number(alphaKey(alpha)),
          CA: Number(alphaKey(alpha)),
          SMask: softMask ? { Type: 'Mask', S: 'Luminosity', G: softMask } : undefined,
        })
      );
      this.states.set(key, ref);
    }
    return this.add('ExtGState', ref);
  }

  /** A copy of the dictionary now: the sections are copied too, so what is added later is not in it. */
  snapshot(): PdfLib.PDFDict {
    const { PDFDict } = this.assets.lib;
    const copy = this.assets.context.obj({});
    for (const [name, section] of this.dict.entries()) {
      copy.set(name, section instanceof PDFDict ? section.clone() : section);
    }
    return copy;
  }
}
