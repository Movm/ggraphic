// SPDX-License-Identifier: AGPL-3.0-only
import { getMobileSelectionArea } from '../mobileSelectionArea.js';
import { describe, expect, it } from 'vitest';

import type { FloatingModuleState } from '../../../hooks/useFloatingModuleState.js';
import type { SidebarTabId } from '../../../entries/sidebar.js';

const UNIFIED: SidebarTabId[] = ['text', 'elements', 'tools', 'uploads', 'chat'];
const LEGACY: SidebarTabId[] = ['text', 'assets', 'tools', 'uploads', 'chat'];

const mod = (
  type: FloatingModuleState['type'],
  data: Partial<FloatingModuleState['data']> = {}
): FloatingModuleState => ({ type, data: { id: 'x', ...data } });

describe('getMobileSelectionArea', () => {
  it.each([
    ['illustration', mod('illustration'), UNIFIED, 'elements'],
    ['illustration', mod('illustration'), LEGACY, 'assets'],
    ['frame', mod('frame'), LEGACY, 'assets'],
  ] as const)('%s in %j → %s', (_label, module, tabs, expected) => {
    expect(getMobileSelectionArea('x', module, tabs, null)).toBe(expected);
  });

  // Their tabs are add catalogs that don't know the selection; the background
  // and its photo carry all their controls in the selection bar.
  it.each([
    ['background', mod('background')],
    ['photo', mod('image', { isPhoto: true })],
    ['decoration image', mod('image', { isPhoto: false })],
    ['text', mod('text')],
    ['shape', mod('shape')],
    ['icon', mod('icon')],
    ['asset', mod('asset')],
    ['user-image', mod('user-image')],
    ['pill badge without settings', mod('pill-badge')],
    ['badge (no module)', null],
  ] as const)('%s → no area', (_label, module) => {
    expect(getMobileSelectionArea('x', module, UNIFIED, null)).toBeNull();
  });

  it("prefers the config's auto-switch target, even for hidden tabs", () => {
    expect(getMobileSelectionArea('badge-1', mod('pill-badge'), LEGACY, 'settings')).toBe(
      'settings'
    );
    expect(getMobileSelectionArea('chart-1', null, UNIFIED, 'chart-settings')).toBe(
      'chart-settings'
    );
    expect(getMobileSelectionArea('frame-1', mod('frame'), UNIFIED, 'frame-settings')).toBe(
      'frame-settings'
    );
  });

  it('returns null without a selection or a fitting tab', () => {
    expect(getMobileSelectionArea(null, null, UNIFIED, null)).toBeNull();
    expect(getMobileSelectionArea('x', mod('illustration'), ['text', 'uploads'], null)).toBeNull();
  });
});
