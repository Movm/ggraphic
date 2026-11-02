// SPDX-License-Identifier: AGPL-3.0-only
import { messages } from '../i18n/catalogue.js';
import { type AltTextPage } from '../CanvasEditorProvider.js';
import { type GenericCanvasRef } from '../components/GenericCanvas.js';

/** Check every requested page before reporting capture failures, as for multi-page export. */
export async function collectAltTextPages(
  refs: ReadonlyArray<{
    current: Pick<GenericCanvasRef, 'captureCanvasForAi' | 'getVisibleTexts'> | null;
  }>,
  indices: readonly number[]
): Promise<AltTextPage[]> {
  const pages: AltTextPage[] = [];
  const failedPages: number[] = [];
  for (const index of indices) {
    const ref = refs[index]?.current;
    const image = ref ? await ref.captureCanvasForAi() : null;
    if (!ref || !image) {
      failedPages.push(index + 1);
      continue;
    }
    pages.push({ pageNumber: index + 1, image, texts: ref.getVisibleTexts() });
  }
  if (failedPages.length > 0) {
    throw new Error(messages().errors.pagesCapture(failedPages.join(', ')));
  }
  return pages;
}
