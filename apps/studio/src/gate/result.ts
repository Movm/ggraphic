// SPDX-License-Identifier: AGPL-3.0-only
/** What `gate.html` reports on `window.__gate`; the spec in `e2e/` reads it. */

/** A slot text that does not fit: its line count over the slot's budget, or its bottom past its frame. */
export interface GateOverflow {
  elementId: string;
  lines: number;
  /** The slot's `budget.maxLines`; null when the slot sets none (only the frame was exceeded). */
  maxLines: number | null;
}

export interface GateResult {
  ready: boolean;
  overflow: GateOverflow[];
  /** Why the page could not be drawn or measured; null when it could. */
  error: string | null;
  /** The worlds the brand keeps of the template (only when no `scheme` was asked for). */
  schemes?: string[];
  /** The catalogue the gate covers (only for `list=1`). */
  templates?: { id: string; formats: string[] }[];
  brands?: string[];
}

declare global {
  interface Window {
    __gate?: GateResult;
  }
}
