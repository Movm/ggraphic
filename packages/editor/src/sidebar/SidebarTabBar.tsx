// SPDX-License-Identifier: AGPL-3.0-only
import { SidebarTabBar as ChromeSidebarTabBar } from '@ggraphic/editor-chrome';

import { AutoSaveIndicator } from '../components/TopBar/AutoSaveIndicator.js';
import { useMessages } from '../i18n/messages.js';

import type { SidebarTabBarProps } from './types.js';

/** The chrome's tab bar with the editor's texts and its save status under the tabs. */
export function SidebarTabBar(props: SidebarTabBarProps) {
  const t = useMessages();
  return (
    <ChromeSidebarTabBar
      ariaLabel={t.ui.editorSections}
      footer={<AutoSaveIndicator />}
      {...props}
    />
  );
}
