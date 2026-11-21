// SPDX-License-Identifier: AGPL-3.0-only
import { SidebarTabBar as ChromeSidebarTabBar } from '@ggraphic/editor-chrome';
import { memo } from 'react';

import { AutoSaveIndicator } from '../components/TopBar/AutoSaveIndicator.js';
import { useMessages } from '../i18n/messages.js';

import type { SidebarTabBarProps } from './types.js';

// One element for every render, so the chrome's memo sees the same footer and skips.
const SAVE_STATUS = <AutoSaveIndicator />;

/** The chrome's tab bar with the editor's texts and its save status under the tabs. */
export const SidebarTabBar = memo(function SidebarTabBar(props: SidebarTabBarProps) {
  const t = useMessages();
  return (
    <ChromeSidebarTabBar
      {...props}
      ariaLabel={props.ariaLabel ?? t.ui.editorSections}
      footer={props.footer ?? SAVE_STATUS}
    />
  );
});
