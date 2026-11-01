// SPDX-License-Identifier: MPL-2.0
/**
 * The brand of the document that is open, for the panels that offer defaults
 * (swatches, effect presets, text tiles) and for the canvas that draws one (the
 * marker of a text without a marker style). The registry is one list for every
 * editor in the host, so an open document of another pack has to say its own:
 * the shell provides the active page's `FullCanvasConfig.brand`, and
 * `GenericCanvas` provides its own page's to its tree, so an embedded or
 * offscreen canvas has it too. Where nothing is provided, or the page names no
 * pack, a reader falls back to the active brand (`activeBrand()`).
 *
 * Code without React context takes the brand as a parameter instead: the
 * action factories get it from the config.
 */
import { type BrandPack } from '@ggraphic/core';
import { createContext, useContext } from 'react';

import { activeBrand } from './brandRegistry.js';

export const DocumentBrandContext = createContext<BrandPack | null>(null);

export function useDocumentBrand(): BrandPack {
  return useContext(DocumentBrandContext) ?? activeBrand();
}
