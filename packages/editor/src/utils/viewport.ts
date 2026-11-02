// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Viewport utilities for responsive canvas rendering. `width` is the editor's box
 * (`useEditorBox`); it defaults to the window.
 */

export const MOBILE_BREAKPOINT = 900;
const MOBILE_PADDING = 32;
const DESKTOP_SIDEBAR_WIDTH = 64;
const DESKTOP_PADDING = 48;
const DESKTOP_MAX_CAP = 1400;
/** Height kept free around a responsive stage (top bar, page toolbar). */
export const STAGE_VERTICAL_CHROME = 120;

const windowWidth = () => (typeof window === 'undefined' ? Infinity : window.innerWidth);

/**
 * Detect if the box is mobile size
 * @returns true if the width is below 900px
 */
export function isMobile(width: number = windowWidth()): boolean {
  return width < MOBILE_BREAKPOINT;
}

/**
 * Get optimal container width for a box of `width`
 * - Mobile: Fill the width with minimal padding
 * - Desktop: Fill available space (width - sidebar - padding), capped at 1400px
 *
 * @returns Optimal maxContainerWidth for CanvasStage
 */
export function getOptimalContainerWidth(width: number = windowWidth()): number {
  if (isMobile(width)) {
    return width - MOBILE_PADDING;
  }
  const availableWidth = width - DESKTOP_SIDEBAR_WIDTH - DESKTOP_PADDING;
  return Math.min(availableWidth, DESKTOP_MAX_CAP);
}
