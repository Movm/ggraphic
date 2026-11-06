// SPDX-License-Identifier: AGPL-3.0-only
/** What `gate.html` reports on `window.__gate`; the specs in `e2e/` read it. */
import type { ExportReport } from '@ggraphic/editor/export';

/** A slot text that does not fit: its line count over the slot's budget, or its bottom past its frame. */
export interface GateOverflow {
  elementId: string;
  lines: number;
  /** The slot's `budget.maxLines`; null when the slot sets none (only the frame was exceeded). */
  maxLines: number | null;
}

/** One world of a `scheme=all` sweep. */
export interface GateWorld {
  scheme: string;
  overflow: GateOverflow[];
  error: string | null;
}

/** The three exports stage 3 compares with the canvas: SVG with glyph outlines, SVG with `<text>`, PDF. */
export const GATE_EXPORT_MODES = ['svg-outlines', 'svg-editable', 'pdf'] as const;
export type GateExportMode = (typeof GATE_EXPORT_MODES)[number];

/** One export of the drawn page. */
export interface GateExport {
  mode: GateExportMode;
  /** The file as the user gets it, as a base64 data URL (`image/svg+xml` or `application/pdf`); null when none was made. */
  exported: string | null;
  /**
   * The file drawn at the size of `GateResult.exportPng`, as a PNG data URL: the SVG as an `<img>`
   * (an editable SVG with the page's web fonts embedded, which an image cannot reach otherwise),
   * the PDF's first page by pdf.js.
   */
  exportedPng: string | null;
  /** The file's own size: SVG user units; PDF pt of page 1. */
  size: { width: number; height: number } | null;
  /** What the export said it could not do; null when it threw. */
  report: ExportReport | null;
  /** Why no export was made or drawn; null when both worked. */
  error: string | null;
}

export interface GateResult {
  ready: boolean;
  overflow: GateOverflow[];
  /** Why the page could not be drawn or measured; null when it could. */
  error: string | null;
  /** The worlds the brand keeps of the template (only when no `scheme` was asked for). */
  schemes?: string[];
  /** Every offered world measured and drawn in one page load (only for `scheme=all`). */
  worlds?: GateWorld[];
  /** The catalogue the gate covers (only for `list=1`). */
  templates?: { id: string; formats: string[] }[];
  brands?: string[];
  /** Only for `export=…`: the world that was drawn (`light` if the brand offers it, else the first). */
  scheme?: string;
  /** Only for `export=…`: the page in px, and the stage as a PNG data URL of that size (placeholders hidden, as an export). */
  page?: { width: number; height: number };
  exportPng?: string;
  /** Only for `export=…`: the images still loading or failed when the page was exported; both should be 0. */
  images?: { pending: number; failed: number };
  /** Only for `export=…`: one entry per asked mode, in `GATE_EXPORT_MODES` order. */
  exports?: GateExport[];
}

declare global {
  interface Window {
    __gate?: GateResult;
  }
}
