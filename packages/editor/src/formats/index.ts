// SPDX-License-Identifier: MPL-2.0
import { messages } from '../i18n/messages.js';

export type CanvasFormatCategory = 'digital' | 'print';

/**
 * UI-level grouping a host's format picker shows as section headers. `slides`
 * is what makes a format a slide deck (`isSlideFormat`). `print` holds no
 * built-in format; it is there for a host's print formats and is not one of
 * the picker groups (see canvasFormatGroupOrder).
 */
export type BuiltInCanvasFormatGroup = 'post' | 'square' | 'slides' | 'print';

/** A built-in group, or the id of a host group (see `registerCanvasFormatGroups`). */
export type CanvasFormatGroup = BuiltInCanvasFormatGroup | (string & {});

export type CanvasFormatIconKey = 'portrait' | 'square' | 'landscape';

export type CanvasExportType = 'png' | 'jpeg' | 'pdf' | 'pptx';

/** Print profile of a format. The canvas covers trim + bleed on every side. */
export interface CanvasPrintSpec {
  trimMm: { w: number; h: number };
  bleedMm: number;
  safeMm: number;
  exportDpi: number;
  /** Printed sides: 1 single-sided, 2 front and back, more for folded or bound sheets. */
  pageCount: number;
  /**
   * Where the imprint (V.i.S.d.P. / Impressum) must stand: on every page (a
   * poster set of separate sheets), on the first or last page only, or nowhere
   * (cards, letterheads).
   */
  imprint: PrintImprintPlacement | null;
}

export type PrintImprintPlacement = 'every-page' | 'first-page' | 'last-page';

export interface CanvasFormat {
  id: string;
  label: string;
  description: string;
  group: CanvasFormatGroup;
  category: CanvasFormatCategory;
  width: number;
  height: number;
  dpi: number;
  iconKey: CanvasFormatIconKey;
  defaultExport: CanvasExportType;
  exportable: ReadonlyArray<CanvasExportType>;
  /** Null for digital formats. */
  print: CanvasPrintSpec | null;
}

export type PrintCanvasFormat = CanvasFormat & { category: 'print'; print: CanvasPrintSpec };

const BUILT_IN_GROUPS: ReadonlyArray<BuiltInCanvasFormatGroup> = [
  'post',
  'square',
  'slides',
  'print',
];

/** The picker groups. Print stays out: a host lists its print formats where it creates print canvases. */
const PICKER_GROUPS: ReadonlyArray<BuiltInCanvasFormatGroup> = ['post', 'square', 'slides'];

/**
 * The built-in formats: a 4:5 post, a square and a 16:9 slide. Everything else
 * (stories, print, …) is the host's, added with `registerCanvasFormats`. The
 * formats built in up to 0.1.0-alpha.1 are in `./legacyCatalog`.
 */
export const CANVAS_FORMATS: ReadonlyArray<CanvasFormat> = [
  {
    id: 'post-portrait',
    label: 'Beitrag 4:5',
    description: '1080 × 1350 · 4:5 · Instagram, Facebook',
    group: 'post',
    category: 'digital',
    width: 1080,
    height: 1350,
    dpi: 72,
    iconKey: 'portrait',
    defaultExport: 'png',
    exportable: ['png', 'jpeg'],
    print: null,
  },
  {
    id: 'profile-square',
    label: 'Quadrat 1:1',
    description: '1080 × 1080 · 1:1',
    group: 'square',
    category: 'digital',
    width: 1080,
    height: 1080,
    dpi: 72,
    iconKey: 'square',
    defaultExport: 'png',
    exportable: ['png', 'jpeg'],
    print: null,
  },
  {
    id: 'slide-16-9',
    label: 'Präsentation',
    description: '1920 × 1080 · 16:9 · Folien',
    group: 'slides',
    category: 'digital',
    width: 1920,
    height: 1080,
    dpi: 72,
    iconKey: 'landscape',
    defaultExport: 'pptx',
    exportable: ['pptx', 'pdf', 'png'],
    print: null,
  },
];

export const DEFAULT_FORMAT_ID = 'post-portrait';

/**
 * Formats a host adds to the built-ins. A module-level register, like the
 * brand packs, because lookups run in commands and offscreen roots without
 * React context. `CANVAS_FORMATS` stays the built-ins only; everything that
 * must also see host formats reads `canvasFormats()`.
 */
let hostFormats: ReadonlyArray<CanvasFormat> = [];

/** Replaces the host's formats (an empty list clears them). Ids must be unique and not built-in; groups must be built-in or registered. */
export function registerCanvasFormats(formats: ReadonlyArray<CanvasFormat>): void {
  const seen = new Set(CANVAS_FORMATS.map((f) => f.id));
  for (const f of formats) {
    if (seen.has(f.id)) throw new Error(`Canvas format id '${f.id}' is already taken`);
    if (!isKnownGroup(f.group)) {
      throw new Error(`Canvas format '${f.id}' uses unknown group '${f.group}'`);
    }
    seen.add(f.id);
  }
  hostFormats = [...formats];
}

export interface CanvasFormatGroupDef {
  id: string;
  label: string;
}

/** Host groups: module-level like the formats, read in non-React code. */
let hostGroups: ReadonlyArray<CanvasFormatGroupDef> = [];

function isKnownGroup(id: string): boolean {
  return (
    (BUILT_IN_GROUPS as ReadonlyArray<string>).includes(id) || hostGroups.some((g) => g.id === id)
  );
}

/**
 * Replaces the host's format groups (an empty list clears them). Ids must be
 * unique and not built-in. Register groups before formats: a replacement that
 * would leave an already registered host format without its group throws, so
 * clear or re-register the formats first.
 */
export function registerCanvasFormatGroups(groups: ReadonlyArray<CanvasFormatGroupDef>): void {
  const seen = new Set<string>(BUILT_IN_GROUPS);
  for (const g of groups) {
    if (seen.has(g.id)) throw new Error(`Canvas format group id '${g.id}' is already taken`);
    seen.add(g.id);
  }
  for (const f of hostFormats) {
    if (!seen.has(f.group)) {
      throw new Error(
        `Canvas format '${f.id}' still uses group '${f.group}', which the replacement removes`
      );
    }
  }
  hostGroups = [...groups];
}

/** The picker groups, host groups after the built-ins. Read lazily. */
export function canvasFormatGroupOrder(): ReadonlyArray<CanvasFormatGroup> {
  return [...PICKER_GROUPS, ...hostGroups.map((g) => g.id)];
}

/** Display label of a group: the active catalogue for built-ins, the host's label otherwise. */
export function canvasFormatGroupLabel(id: CanvasFormatGroup): string {
  const host = hostGroups.find((g) => g.id === id);
  if (host) return host.label;
  const labels: Readonly<Record<string, string>> = messages().formats.groups;
  return labels[id] ?? id;
}

/** The built-in formats followed by the registered ones. */
export function canvasFormats(): ReadonlyArray<CanvasFormat> {
  return hostFormats.length === 0 ? CANVAS_FORMATS : [...CANVAS_FORMATS, ...hostFormats];
}

/** @deprecated Moved to `./legacyCatalog`: the template ids are the host's. Removed in the next alpha. */
export { pinnedFormatId } from './legacyCatalog.js';

/**
 * The digital format of exactly this size, for a template that comes without
 * one: the stage scales the template's space onto its format per axis, so the
 * default 4:5 format would stretch any other size.
 */
export function formatIdForSize(width: number, height: number): string | null {
  return (
    canvasFormats().find((f) => !isPrintFormat(f) && f.width === width && f.height === height)
      ?.id ?? null
  );
}

export function getCanvasFormat(id: string): CanvasFormat | null {
  return canvasFormats().find((f) => f.id === id) ?? null;
}

/** The one place that answers: is this a slide deck? A host's slide format joins the `slides` group. */
export function isSlideFormat(format: CanvasFormat): boolean {
  return format.group === 'slides';
}

/**
 * Startgröße neu eingefügter Elemente (Text, Formen, Icons, Grafiken,
 * Diagramme): die Voreinstellungen sind für 1080 px breite Sharepics gemacht,
 * auf einer Folie wachsen sie mit der Breite. Alle anderen Formate: 1.
 */
export function insertScaleFor(format: CanvasFormat): number {
  return isSlideFormat(format) ? format.width / 1080 : 1;
}

export function isPrintFormat(format: CanvasFormat): format is PrintCanvasFormat {
  return format.category === 'print' && format.print !== null;
}

/**
 * A print id this build does not know (a newer app saved it). It must not
 * render as 4:5: the editor refuses it instead of autosaving a wrong sheet.
 */
export function isUnsupportedFormatId(id: string | null | undefined): boolean {
  return !!id && id.startsWith('print-') && !getCanvasFormat(id);
}

export class UnsupportedCanvasFormatError extends Error {
  constructor(readonly formatId: string) {
    super(`Unsupported canvas format '${formatId}'`);
    this.name = 'UnsupportedCanvasFormatError';
  }
}

/** Unknown ids already warned about: a document resolves its format on every render. */
const warnedUnknownIds = new Set<string>();

/**
 * Unknown digital ids fall back to the default, with a warning once per id:
 * a host that forgot to register its formats would otherwise ship them as
 * 4:5 without a trace. Unknown print ids throw.
 */
export function getCanvasFormatOrDefault(id: string | null | undefined): CanvasFormat {
  if (id) {
    const found = getCanvasFormat(id);
    if (found) return found;
    if (isUnsupportedFormatId(id)) throw new UnsupportedCanvasFormatError(id);
    if (!warnedUnknownIds.has(id)) {
      warnedUnknownIds.add(id);
      console.warn(
        `unknown canvas format '${id}', falling back to '${DEFAULT_FORMAT_ID}'; register it with registerCanvasFormats`
      );
    }
  }
  const fallback = getCanvasFormat(DEFAULT_FORMAT_ID);
  if (!fallback) {
    throw new Error(`CANVAS_FORMATS missing default '${DEFAULT_FORMAT_ID}'`);
  }
  return fallback;
}

export function mmToPx(format: PrintCanvasFormat, mm: number): number {
  const { trimMm, bleedMm } = format.print;
  return (
    (mm * Math.max(format.width, format.height)) / (Math.max(trimMm.w, trimMm.h) + 2 * bleedMm)
  );
}

export interface PrintRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Trim, bleed and safe area in canvas px; the origin is the outer bleed edge. */
export function printGeometry(format: PrintCanvasFormat): {
  trim: PrintRect;
  bleed: PrintRect;
  safe: PrintRect;
} {
  const { trimMm, bleedMm, safeMm } = format.print;
  const inset = (mm: number): PrintRect => ({
    x: mmToPx(format, mm),
    y: mmToPx(format, mm),
    width: mmToPx(format, trimMm.w + 2 * (bleedMm - mm)),
    height: mmToPx(format, trimMm.h + 2 * (bleedMm - mm)),
  });
  return {
    bleed: { x: 0, y: 0, width: format.width, height: format.height },
    trim: inset(bleedMm),
    safe: inset(bleedMm + safeMm),
  };
}

/** The format's name in the active language; the built-in names come from the message catalogue. */
export function formatLabel(format: CanvasFormat): string {
  const name = messages().formats.names[format.id];
  if (!name) return format.label;
  return format.print ? `${name} · ${format.print.trimMm.w} × ${format.print.trimMm.h} mm` : name;
}

/** The format's size line in the active language. */
export function formatDescription(format: CanvasFormat): string {
  const m = messages().formats;
  if (format.print) {
    const { trimMm, bleedMm, pageCount } = format.print;
    return m.printDescription(`${trimMm.w} × ${trimMm.h} mm`, bleedMm, pageCount);
  }
  if (format.id === 'slide-16-9') return m.slidesDescription('1920 × 1080 · 16:9');
  return format.description;
}
