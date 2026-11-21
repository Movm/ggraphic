// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';

/** One entry of the tab bar. `Id` narrows the ids a host knows (the editor's own union). */
export interface SidebarTab<Id extends string = string> {
  id: Id;
  icon: IconType;
  label: string;
  ariaLabel: string;
}

export interface SidebarTabBarProps<Id extends string = string> {
  tabs: SidebarTab<Id>[];
  activeTab: Id | null;
  onTabClick: (tabId: Id) => void;
  onExport?: () => void;
  disabledTabs?: Id[];
  horizontal?: boolean;
  /** Accessible name of the tab bar's `<nav>`. */
  ariaLabel?: string;
  /** Desktop rail only: rendered below a separator under the tabs (the editor's save status). */
  footer?: ReactNode;
}

export interface SidebarPanelProps {
  isOpen: boolean;
  children: ReactNode;
  /** Sheet title on mobile — the label of the active area. */
  title?: string;
  onClose?: () => void;
  /** Label of the mobile sheet's close button, given the sheet title. */
  closeLabel?: (title: string | null) => string;
  /** Label of the desktop "collapse panel" handle. */
  collapseLabel?: string;
}
