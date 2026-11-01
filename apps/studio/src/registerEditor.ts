// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The editor's module-level registers, filled once before the first render:
 * the neutral brand, English texts, the Studio templates, the shell parts and
 * the toast, and the bundled illustrations and emoji with the template blocks
 * (`assetCatalog.ts`).
 */
import { studioBrand } from './brand';
import { registerBrandPacks } from '@ggraphic/editor/brand';
import { registerMessages } from '@ggraphic/editor/i18n';
import { registerAssetCatalog } from '@ggraphic/editor/elements';
import { registerToast } from '@ggraphic/editor/services';

import { studioAssetCatalog } from './editor/assetCatalog';
import { registerStudioEditorShell } from './editor/shell';
import { registerStudioTemplates } from './editor/templates/config';
import { toast } from './ui/toast';

export function registerEditor(): void {
  registerBrandPacks([studioBrand]);
  registerMessages('en');
  registerStudioTemplates();
  registerStudioEditorShell();
  registerToast(toast);
  registerAssetCatalog(studioAssetCatalog());
}
