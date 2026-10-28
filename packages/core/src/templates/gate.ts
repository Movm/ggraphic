// SPDX-License-Identifier: MPL-2.0
import type { Box } from '../brand/logoFit.js';
import type { GeometryTable } from './instantiate.js';

/**
 * What the render gate needs to know of an editor's element kinds. The editor fills it
 * in (`TEMPLATE_GATE_ADAPTER`); the gate itself (stage 1) is defined with the checks that use it.
 */
export interface GateAdapter {
  geometry: GeometryTable;
  /** stateKey → fields that may carry a colour binding. */
  colorFields: Readonly<Record<string, readonly string[]>>;
  /** The box an element covers in canvas px, or null if it has none. `lines` is a text's line count. */
  box(stateKey: string, el: Readonly<Record<string, unknown>>, lines: number): Box | null;
  text(
    stateKey: string,
    el: Readonly<Record<string, unknown>>
  ): { fill: string; fontSize: number; bold: boolean } | null;
  fill(stateKey: string, el: Readonly<Record<string, unknown>>): string | null;
}
