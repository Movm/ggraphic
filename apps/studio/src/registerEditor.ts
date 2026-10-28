// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The editor's module-level registers, filled once before the first render:
 * the neutral brand, English texts, the Studio templates, the shell parts and
 * the toast. No asset catalogue is registered: the Studio bundles no
 * third-party graphics, so the Elements tab offers shapes and icons only.
 */
import { studioBrand } from './brand';
import { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { registerMessages } from '@ggraphic/editor/i18n/messages';
import { registerToast } from '@ggraphic/editor/utils/editorToast';

import { registerStudioEditorShell } from './editor/shell';
import { registerStudioTemplates } from './editor/templates/config';
import { toast } from './ui/toast';

export function registerEditor(): void {
  registerBrandPacks([studioBrand]);
  registerMessages('en');
  registerStudioTemplates();
  registerStudioEditorShell();
  registerToast(toast);
}
