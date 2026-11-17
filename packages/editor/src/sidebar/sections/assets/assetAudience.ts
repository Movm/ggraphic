// SPDX-License-Identifier: AGPL-3.0-only
import { createContext, useContext } from 'react';

import { useCanvasEditorServices } from '../../../CanvasEditorProvider.js';

import type { AssetAudience } from '../../../utils/canvasAssets.js';

/**
 * The document's own audience: the host's `deckLocale(pages)` (`registerEditorShell`),
 * provided by the shell around the active sidebar section. `null` when the host
 * registered none.
 */
export const DocumentAudienceContext = createContext<AssetAudience | null>(null);

/**
 * Whose assets the Elemente tab offers: the document's audience, else the user's
 * locale — so a de-DE user editing a de-AT document gets the Austrian logos.
 */
export function useAssetAudience(): AssetAudience {
  const documentAudience = useContext(DocumentAudienceContext);
  const { userLocale = 'de-DE' } = useCanvasEditorServices();
  return documentAudience ?? userLocale;
}
