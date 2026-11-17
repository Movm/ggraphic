// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The core's sidebar sections and tab icons, by id. Configs that the data entries build
 * (`createPageConfig`, `createShareSection`) name them here instead of importing them, so those
 * entries load without React; the editor shell provides the components (`./coreSidebarParts`)
 * before it renders a sidebar, and only then are they read.
 */
import type {
  AssetsSection,
  CombinedTextSection,
  GenericShareSection,
  ToolsSection,
  UploadsSection,
} from './sections/index.js';
import type { IconType } from 'react-icons';

export type CoreSidebarId = 'text' | 'elements' | 'uploads' | 'tools' | 'share';

export interface CoreSidebarParts {
  sections: {
    text: typeof CombinedTextSection;
    elements: typeof AssetsSection;
    uploads: typeof UploadsSection;
    tools: typeof ToolsSection;
    share: typeof GenericShareSection;
  };
  icons: Readonly<Record<CoreSidebarId, IconType>>;
}

let provided: CoreSidebarParts | null = null;

/** Called by the editor shell when its module loads. */
export function provideCoreSidebar(parts: CoreSidebarParts): void {
  provided = parts;
}

/** The provided parts; reading them outside the editor shell is a mistake, and says so. */
export function coreSidebar(): CoreSidebarParts {
  if (!provided) {
    throw new Error(
      'coreSidebar: read before the editor shell provided the sections; render configs through CanvasEditorShell'
    );
  }
  return provided;
}
