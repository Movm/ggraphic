// SPDX-License-Identifier: AGPL-3.0-only
import { rebindPages, type RebindContext } from '@ggraphic/core';

import { formatSize, type StudioDocument } from './document';
import { fittedFontSize } from './templates/fitting';

/**
 * The document with every bound page field brought up to date with the brand.
 * The page size defaults to the document's format. The same document when nothing changes; the input is never modified.
 */
export function rebindStudioDocument(
  doc: StudioDocument,
  ctx: RebindContext
): { doc: StudioDocument; changed: boolean } {
  const pageSize = formatSize(doc.formatId);
  const { pages, changed } = rebindPages(doc.pages, {
    pageSize,
    // A new brand font can be wider: texts with a prototype size are fitted again.
    fitText: (el, page) => fittedFontSize(el, page, ctx.pageSize?.height ?? pageSize.height),
    ...ctx,
  });
  return changed ? { doc: { ...doc, pages }, changed } : { doc, changed };
}
