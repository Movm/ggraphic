// SPDX-License-Identifier: AGPL-3.0-only
import { SidebarPanel as ChromeSidebarPanel } from '@ggraphic/editor-chrome';

import { useMessages } from '../i18n/messages.js';

import type { SidebarPanelProps } from './types.js';

/** The chrome's panel / mobile sheet with the editor's texts. */
export function SidebarPanel(props: SidebarPanelProps) {
  const t = useMessages();
  return (
    <ChromeSidebarPanel
      {...props}
      closeLabel={props.closeLabel ?? t.ui.closeSection}
      collapseLabel={props.collapseLabel ?? t.ui.collapsePanel}
    />
  );
}
