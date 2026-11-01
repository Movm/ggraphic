// SPDX-License-Identifier: MPL-2.0
/**
 * `@ggraphic/editor/styles/compiled`: the stylesheet for hosts without Tailwind. Every rule must
 * sit in `@layer ggraphic` (host rules win without `!important`) and, apart from the global token
 * defaults, apply only inside `[data-ggraphic]`. The browser side (portals, dark mode, a page
 * without Tailwind) is `apps/studio/e2e/compiledCss.spec.ts`.
 */
import path from 'node:path';

import { transform } from 'lightningcss';
import { beforeAll, describe, expect, it } from 'vitest';

import { compileEditorCss, SCOPE_ATTRIBUTE } from '../../scripts/compiled-css.mjs';
import { EDITOR_SCOPE } from '../ui/editorScope.js';

const SRC = path.resolve(import.meta.dirname, '..');

let css = '';
beforeAll(async () => {
  css = await compileEditorCss(SRC);
}, 30_000);

/** Top-level blocks of the stylesheet, by brace depth (comments and strings carry no braces). */
function topLevel(text: string): string[] {
  const body = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      out.push(body.slice(start, i + 1).trim());
      start = i + 1;
    } else if (ch === ';' && depth === 0) {
      out.push(body.slice(start, i + 1).trim());
      start = i + 1;
    }
  }
  return out.filter(Boolean);
}

type Component = { type: string; kind?: string; name?: string; selectors?: Component[][] | null };

const mentionsScope = (selector: Component[]): boolean =>
  selector.some(
    (c) =>
      (c.type === 'attribute' && c.name === SCOPE_ATTRIBUTE) ||
      (c.selectors ?? []).some(mentionsScope)
  );

/** The token defaults: `:where(:root)`, `:where(:root:not([data-theme=light]))`, `:where([data-theme=dark])`. */
const isTokenRoot = (selector: Component[]): boolean =>
  selector.length === 1 &&
  selector[0].kind === 'where' &&
  (selector[0].selectors ?? []).every((inner) =>
    inner.some((c) => c.kind === 'root' || (c.type === 'attribute' && c.name === 'data-theme'))
  );

function selectors(text: string): Component[][] {
  const seen: Component[][] = [];
  transform({
    filename: 'compiled.css',
    code: Buffer.from(text),
    visitor: {
      Selector(selector) {
        seen.push(selector as unknown as Component[]);
        return selector;
      },
    },
  });
  return seen;
}

describe('the compiled editor stylesheet', () => {
  it('uses the attribute EDITOR_SCOPE puts on the editor', () => {
    expect(Object.keys(EDITOR_SCOPE)).toEqual([SCOPE_ATTRIBUTE]);
  });

  it('puts every rule into the ggraphic layer', () => {
    const blocks = topLevel(css);
    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) expect(block).toMatch(/^@layer ggraphic[.{;\s]/);
  });

  it('scopes every selector except the token defaults and the page rules of an open editor', () => {
    const all = selectors(css);
    expect(all.length).toBeGreaterThan(1000);
    const unscoped = all.filter((s) => !mentionsScope(s) && !isTokenRoot(s));
    // `html:has(.canvas-editor-layout)` and its `body`: overscroll lock while an editor is open.
    expect(unscoped.length).toBeGreaterThan(0);
    for (const s of unscoped)
      expect(s.slice(0, 2).map((c) => c.name ?? c.kind)).toEqual(['html', 'has']);
  });

  it('carries the classes, theme mapping, utilities and rules of the editor', () => {
    for (const expected of [
      '.canvas-editor-layout', // editor.css
      '.bg-\\[var\\(--editor-bg\\)\\]', // an arbitrary value from a component
      '.bg-editor-surface', // a theme name tailwind.css maps
      '--color-editor-surface:var(--editor-surface)', // the mapping itself
      '.element-enter', // an @utility of tailwind.css
      'data-focus-modality=keyboard', // the kbd variant
      '--editor-bg:#f4f4f3', // a token default
    ]) {
      expect(css).toContain(expected);
    }
  });

  it('keeps Tailwind theme variables and the reset off the document root', () => {
    // `:root, :host` (theme) and `html, :host` (preflight) become `:where([data-ggraphic])`.
    const onTheRoot = selectors(css)
      .filter((s) => !isTokenRoot(s) && mentionsScope(s))
      .filter((s) =>
        s.some(
          (c) => c.kind === 'root' || c.kind === 'host' || (c.type === 'type' && c.name === 'html')
        )
      );
    expect(onTheRoot).toEqual([]);
    expect(css).toMatch(/:where\(\[data-ggraphic\]\)\{[^}]*--color-editor-surface/);
  });
});
