// SPDX-License-Identifier: AGPL-3.0-only

/** Id of the open sidebar panel / mobile sheet; the tab buttons point at it via aria-controls. */
export const SIDEBAR_PANEL_ID = 'canvas-sidebar-panel';

/**
 * Marks the root the chrome lays out in. The mobile sheet measures its resting place against it
 * and the desktop panel looks up its tab inside it. The canvas editor's layout root carries it;
 * any other host puts it on the box that holds the tab bar and the panel.
 */
export const CHROME_ROOT_ATTR = 'data-editor-chrome-root';

/** Horizontal scroll container without a visible scrollbar */
export const HIDDEN_SCROLLBAR =
  '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch]';
