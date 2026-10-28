// SPDX-License-Identifier: AGPL-3.0-only
import { rebindPages, type RebindContext } from '@ggraphic/core';

import { type StudioDocument } from './document';

/**
 * The document with every bound page field brought up to date with the brand.
 * The same document when nothing changes; the input is never modified.
 */
export function rebindStudioDocument(
  doc: StudioDocument,
  ctx: RebindContext
): { doc: StudioDocument; changed: boolean } {
  const { pages, changed } = rebindPages(doc.pages, ctx);
  return changed ? { doc: { ...doc, pages }, changed } : { doc, changed };
}
