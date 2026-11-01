// SPDX-License-Identifier: AGPL-3.0-only
/** Places a catalogue template on a page of a Studio format. */
import { type BrandPack, type SchemeId } from '@ggraphic/core';
import { placeTemplate } from '@ggraphic/editor/page/instantiate';

import { formatSize } from '../document';

import { formatAspect, type CatalogEntry } from './catalog';

/** The fresh page of `entry` on `formatId`, in `opts.brand` (default: the active one); null when the format or the brand does not fit. */
export function templatePageState(
  entry: CatalogEntry,
  formatId: string,
  opts: { schemeId?: SchemeId | null; brand?: BrandPack } = {}
): Record<string, unknown> | null {
  return placeTemplate(
    entry.template,
    formatSize(formatId),
    formatAspect(formatId),
    opts.schemeId ?? null,
    opts.brand
  );
}
