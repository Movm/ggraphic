// SPDX-License-Identifier: MPL-2.0
import { useEffect, useState } from 'react';

import { iconSetsLoaded, loadIconSetsFor } from '../utils/canvasIcons.js';

import { registerStoredExternalIcons, type StoredIcon } from '../utils/externalIcons.js';
import { selectedCatalogIconIds, type IconIdCarrier } from '../utils/iconInstances.js';

/**
 * Loads the icon sets a page's icons come from and re-renders once they are
 * in. Without it an icon draws only when its set happens to be loaded — the
 * default set with the sidebar, the others only after an icon search.
 */
export function useIconSetsFor(
  selectedIcons: string[] | undefined,
  iconStates: Record<string, IconIdCarrier & StoredIcon> | undefined
): void {
  // Icons from the host's search carry their SVG in the document; register it before drawing.
  registerStoredExternalIcons(selectedIcons, iconStates);
  const ids = selectedCatalogIconIds(selectedIcons, iconStates);
  const key = ids.join('|');
  const [, setLoaded] = useState(0);
  useEffect(() => {
    const wanted = key ? key.split('|') : [];
    if (iconSetsLoaded(wanted)) return;
    let live = true;
    void loadIconSetsFor(wanted).then(() => {
      if (live) setLoaded((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [key]);
}
