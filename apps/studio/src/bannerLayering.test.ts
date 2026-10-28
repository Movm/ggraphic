// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * jsdom does no layout, so the banner's place is checked on the stylesheet: the editor's
 * floating toolbar sits in a sticky slot under the top bar (`CanvasEditorLayout`: z-90,
 * 3.5rem high), and the save banner (trashed, conflict, newer format) must be neither
 * under it nor on top of its controls.
 */
const TOOLBAR_Z = 90;
const TOP_BAR_PX = 56;
const TOOLBAR_SLOT_PX = 56;

const css = readFileSync(path.resolve(import.meta.dirname, 'styles.css'), 'utf8');
const rule = /\.studio-banner\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

describe('.studio-banner', () => {
  it('stacks above the floating toolbar', () => {
    expect(Number(/z-index:\s*(\d+)/.exec(rule)?.[1])).toBeGreaterThan(TOOLBAR_Z);
  });

  it('sits below the toolbar slot, not on its controls', () => {
    const top = /top:\s*calc\(var\(--editor-topbar-height\)\s*\+\s*3\.5rem\s*\+\s*(\d+)px\)/.exec(
      rule
    );
    const px = top
      ? Number(top[1])
      : /top:\s*(\d+)px/.exec(rule)
        ? Number(/top:\s*(\d+)px/.exec(rule)![1])
        : 0;
    const offset = top ? TOP_BAR_PX + TOOLBAR_SLOT_PX + px : px;
    expect(offset).toBeGreaterThanOrEqual(TOP_BAR_PX + TOOLBAR_SLOT_PX);
  });
});
