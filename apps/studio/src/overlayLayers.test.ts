// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

/** The z-index of the first rule for `selector` in `css`. */
function zIndexOf(css: string, selector: string): number {
  const at = css.indexOf(`${selector} {`);
  expect(at, `${selector} not found`).toBeGreaterThanOrEqual(0);
  const body = css.slice(at, css.indexOf('}', at));
  const match = /z-index:\s*(\d+)/.exec(body);
  expect(match, `${selector} has no z-index`).not.toBeNull();
  return Number(match![1]);
}

/** The highest `z-[n]` on the editor's top bar and sidebar column. */
const EDITOR_CHROME = Math.max(
  ...[
    '../../../packages/editor/src/components/TopBar/TopBar.tsx',
    '../../../packages/editor/src/layouts/CanvasEditorLayout.tsx',
  ].flatMap((file) => [...read(file).matchAll(/\bz-\[(\d+)\]/g)].map((m) => Number(m[1])))
);

describe('overlay layers', () => {
  const studio = read('./styles.css');
  const ui = read('../../../packages/ui/src/styles/components.css');

  it('puts a Studio dialog above the editor top bar and sidebar', () => {
    expect(zIndexOf(studio, '.studio-overlay')).toBeGreaterThan(EDITOR_CHROME);
  });

  it('opens select lists and menus above a Studio dialog', () => {
    const dialog = zIndexOf(studio, '.studio-overlay');
    expect(zIndexOf(ui, '.ui-select__content')).toBeGreaterThan(dialog);
    expect(zIndexOf(ui, '.ui-menu__content')).toBeGreaterThan(dialog);
  });
});
