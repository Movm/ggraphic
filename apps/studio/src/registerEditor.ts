// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The editor's module-level registers, filled once before the first render:
 * the neutral brand, English texts, the Studio templates, the shell parts and
 * the toast. The asset catalogue is empty: the Studio bundles no third-party
 * graphics, so the Elements tab offers shapes, icons and the template blocks.
 */
import { studioBrand } from './brand';
import { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { registerMessages } from '@ggraphic/editor/i18n/messages';
import { registerAssetCatalog } from '@ggraphic/editor/utils/canvasAssets';
import { registerToast } from '@ggraphic/editor/utils/editorToast';

import { STUDIO_ELEMENT_PANEL } from './editor/blocks/blockPanel';
import { registerStudioEditorShell } from './editor/shell';
import { registerStudioTemplates } from './editor/templates/config';
import { toast } from './ui/toast';

export function registerEditor(): void {
  registerBrandPacks([studioBrand]);
  registerMessages('en');
  registerStudioTemplates();
  registerStudioEditorShell();
  registerToast(toast);
  // No graphics of its own: the catalogue only carries the panel's Blocks category.
  registerAssetCatalog({
    assets: [],
    isInstanceSrc: () => false,
    elementPanel: STUDIO_ELEMENT_PANEL,
  });
}
