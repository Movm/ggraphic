// SPDX-License-Identifier: MPL-2.0
/**
 * Plates that hug their text (`hug` on a shape), kept in step with the text wherever a page
 * changes a text's geometry after placing: a committed edit, a brand rebind, an AI fill.
 * Placing and the gate hug through core; this is the page-level door for the rest.
 */
import { hugPlates, type HugAdapter } from '@ggraphic/core';
import { TEMPLATE_GATE_ADAPTER } from '../templates/templateGeometry.js';

/** The editor's measures for hugging; null parts of the gate adapter never occur in the editor. */
export const HUG_ADAPTER: HugAdapter = {
  box: TEMPLATE_GATE_ADAPTER.box,
  textExtent: TEMPLATE_GATE_ADAPTER.textExtent!,
  placeBox: TEMPLATE_GATE_ADAPTER.placeBox!,
};

/** `page` with every hugging plate brought to its text; the same object when none moves. */
export function withHuggedPlates<P extends Readonly<Record<string, unknown>>>(page: P): P {
  return hugPlates(page, HUG_ADAPTER) as P;
}
