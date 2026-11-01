// SPDX-License-Identifier: MPL-2.0
/**
 * The formats, the group and the template pinning the editor shipped built in
 * up to 0.1.0-alpha.1, kept unchanged so a host that relied on them can
 * register them itself:
 *
 * ```ts
 * registerCanvasFormatGroups(LEGACY_CANVAS_FORMAT_GROUPS);
 * registerCanvasFormats(LEGACY_CANVAS_FORMATS);
 * ```
 *
 * The ids are the ones stored in documents, so stored documents keep opening.
 *
 * @deprecated Copy what you need into the host; this module is removed in the next alpha.
 */
import type {
  CanvasFormat,
  CanvasFormatGroupDef,
  PrintCanvasFormat,
  PrintImprintPlacement,
} from './index.js';

const PRINT_BLEED_MM = 3;
const PRINT_EXPORT_DPI = 300;
/** Large formats print from a distance: 150 dpi, the usual large-format rate. */
const PRINT_LARGE_EXPORT_DPI = 150;
/** Working resolution: the long side including bleed is 2000 px. */
const PRINT_LONG_SIDE_PX = 2000;

function printFormat(
  id: string,
  name: string,
  trimMm: { w: number; h: number },
  safeMm: number,
  pageCount: number,
  exportDpi = PRINT_EXPORT_DPI,
  imprint: PrintImprintPlacement | null = pageCount === 1 ? 'every-page' : null
): PrintCanvasFormat {
  const pxPerMm = PRINT_LONG_SIDE_PX / (Math.max(trimMm.w, trimMm.h) + 2 * PRINT_BLEED_MM);
  return {
    id,
    label: `${name} · ${trimMm.w} × ${trimMm.h} mm`,
    description: `${trimMm.w} × ${trimMm.h} mm · ${PRINT_BLEED_MM} mm Beschnitt · ${pageCount === 1 ? 'einseitig' : pageCount === 2 ? 'Vorder- und Rückseite' : `${pageCount} Seiten`}`,
    group: 'print',
    category: 'print',
    width: Math.round((trimMm.w + 2 * PRINT_BLEED_MM) * pxPerMm),
    height: Math.round((trimMm.h + 2 * PRINT_BLEED_MM) * pxPerMm),
    dpi: exportDpi,
    iconKey: trimMm.w > trimMm.h ? 'landscape' : 'portrait',
    defaultExport: 'pdf',
    exportable: ['pdf', 'png'],
    print: { trimMm, bleedMm: PRINT_BLEED_MM, safeMm, exportDpi, pageCount, imprint },
  };
}

/** @deprecated See the module comment. */
export const LEGACY_CANVAS_FORMAT_GROUPS: ReadonlyArray<CanvasFormatGroupDef> = [
  // 3:4 is its own group because only freeform lays out on it.
  { id: 'sharepic-tall', label: 'Sharepics 3:4' },
];

/** @deprecated See the module comment. */
export const LEGACY_CANVAS_FORMATS: ReadonlyArray<CanvasFormat> = [
  {
    id: 'post-portrait-tall',
    label: 'Sharepic 3:4',
    description: '1080 × 1440 · 3:4 · Instagram',
    group: 'sharepic-tall',
    category: 'digital',
    width: 1080,
    height: 1440,
    dpi: 72,
    iconKey: 'portrait',
    defaultExport: 'png',
    exportable: ['png', 'jpeg'],
    print: null,
  },
  printFormat('print-visitenkarte-quer', 'Visitenkarte quer', { w: 85, h: 55 }, 3, 2),
  printFormat('print-visitenkarte-hoch', 'Visitenkarte hoch', { w: 55, h: 85 }, 3, 2),
  printFormat('print-a3-hoch', 'Plakat A3 hoch', { w: 297, h: 420 }, 4, 1),
  printFormat('print-a4-hoch', 'Plakat A4 hoch', { w: 210, h: 297 }, 4, 1),
  printFormat('print-a3-quer', 'Plakat A3 quer', { w: 420, h: 297 }, 4, 1),
  printFormat('print-a1-hoch', 'Plakat A1 hoch', { w: 594, h: 841 }, 10, 1, PRINT_LARGE_EXPORT_DPI),
  printFormat('print-a1-quer', 'Plakat A1 quer', { w: 841, h: 594 }, 10, 1, PRINT_LARGE_EXPORT_DPI),
  // 18/1 billboard: the artwork is supplied at A2 and enlarged (print spec).
  printFormat(
    'print-grossflaeche',
    'Großfläche 18/1 (Vorlage A2)',
    { w: 594, h: 420 },
    10,
    1,
    PRINT_LARGE_EXPORT_DPI
  ),
  // Visible area 230 × 342 mm (print spec): the safe zone ends inside it.
  printFormat('print-citylight', 'Citylight', { w: 237, h: 350 }, 8, 1, PRINT_LARGE_EXPORT_DPI),
  // Roll fold to DIN lang: panels 100 / 100 / 97 mm, outside and inside (print spec).
  printFormat(
    'print-flyer-dinlang',
    'Flyer DIN lang (A4 quer, Wickelfalz)',
    { w: 297, h: 210 },
    4,
    2,
    PRINT_EXPORT_DPI,
    'first-page'
  ),
  printFormat(
    'print-a6-hoch',
    'Flyer A6 hoch',
    { w: 105, h: 148 },
    3,
    2,
    PRINT_EXPORT_DPI,
    'last-page'
  ),
  printFormat(
    'print-a6-quer',
    'Flyer A6 quer',
    { w: 148, h: 105 },
    3,
    2,
    PRINT_EXPORT_DPI,
    'last-page'
  ),
  printFormat('print-briefbogen-a4', 'Briefbogen A4', { w: 210, h: 297 }, 5, 2),
  printFormat(
    'print-zeitung-a4',
    'Zeitung A4',
    { w: 210, h: 297 },
    5,
    4,
    PRINT_EXPORT_DPI,
    'last-page'
  ),
];

/**
 * Templates whose fixed sheet is not 4:5. A document of such a template must
 * carry exactly this format: the stage takes the document's format and scales
 * the sheet to it per axis, so the square profile picture on a 4:5 document
 * came out stretched by 1.25 (#4087).
 */
const PINNED_TEMPLATE_FORMATS: Readonly<Record<string, string>> = {
  profilbild: 'profile-square',
  sticker: 'profile-square',
};

/** @deprecated The template ids are the host's; keep this map in the host. */
export function pinnedFormatId(templateId: string): string | null {
  return PINNED_TEMPLATE_FORMATS[templateId] ?? null;
}
