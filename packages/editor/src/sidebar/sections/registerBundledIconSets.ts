// SPDX-License-Identifier: MPL-2.0
import { addCollection } from '@iconify/react';

import { onIconSetLoaded } from '../../utils/canvasIcons.js';

/**
 * Lets `<Icon icon="prefix:…">` render offline from the sets the catalogue has loaded. Called
 * while an icon renders, not at import, so importing the sidebar has no side effect (#140); it
 * runs before the child `Icon`'s effects, and every call after the first is a no-op.
 */
export function registerBundledIconSets(): void {
  onIconSetLoaded(addCollection);
}
