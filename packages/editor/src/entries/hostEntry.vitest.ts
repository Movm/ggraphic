// SPDX-License-Identifier: MPL-2.0
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type * as ai from './ai.js';
import type * as host from './host.js';
import type * as kinds from './kinds.js';
import type * as services from './services.js';

/**
 * `@ggraphic/editor/host` is what a host's start-up code and test setup import. Every module it loads
 * is evaluated before a test file's `vi.mock` registers, so a host that mocks an editor module (an
 * upload provider, the store, the text measurer) only can while this entry stays clear of them. In the
 * Grünerator's D2e dry run, start-up imports from `shell`, `kinds` and `elements` (308, 100 and 31
 * modules) disabled the mocks of 15 test files.
 *
 * The graph is read from the source the way the build emits it: type-only imports and exports load
 * nothing.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function runtimeSpecifiers(file: string): string[] {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
  const specs: string[] = [];
  for (const s of sf.statements) {
    if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier)) {
      const c = s.importClause;
      const named = c?.namedBindings && ts.isNamedImports(c.namedBindings) ? c.namedBindings : null;
      const typeOnly =
        !!c && (c.isTypeOnly || (!c.name && !!named && named.elements.every((e) => e.isTypeOnly)));
      if (!typeOnly) specs.push(s.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(s) &&
      s.moduleSpecifier &&
      ts.isStringLiteral(s.moduleSpecifier)
    ) {
      const ec = s.exportClause;
      const typeOnly =
        s.isTypeOnly || (!!ec && ts.isNamedExports(ec) && ec.elements.every((e) => e.isTypeOnly));
      if (!typeOnly) specs.push(s.moduleSpecifier.text);
    }
  }
  return specs;
}

function moduleGraph(entry: string): string[] {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of runtimeSpecifiers(file)) {
      if (!spec.startsWith('.')) continue;
      const base = resolve(dirname(file), spec.replace(/\.js$/, ''));
      const hit = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(
        existsSync
      );
      if (hit) stack.push(hit);
    }
  }
  return [...seen].map((f) => relative(SRC, f)).sort();
}

describe('@ggraphic/editor/host', () => {
  const graph = moduleGraph(resolve(SRC, 'entries/host.ts'));

  it('loads no editor UI, store or primitive', () => {
    const ui = graph.filter((f) => /^(components|sidebar|layouts|primitives|stores|ui)\//.test(f));
    expect(ui).toEqual([]);
  });

  it('stays small', () => {
    // 17 modules when this was written. Raise it only for a seam, not for something it renders.
    expect(graph.length).toBeLessThanOrEqual(20);
  });

  it('names the blank page as the embed entry does, so a server component can read it', async () => {
    const [fromHost, fromEmbed] = await Promise.all([import('./host.js'), import('./embed.js')]);
    expect(fromHost.BLANK_PAGE_ID).toBe('ggraphic-blank');
    expect(fromEmbed.BLANK_PAGE_ID).toBe(fromHost.BLANK_PAGE_ID);
  });

  it("names a format in the catalogue's language, as the templates entry does (#159)", async () => {
    const [fromHost, fromTemplates] = await Promise.all([
      import('./host.js'),
      import('./templates.js'),
    ]);
    expect(fromHost.formatLabel).toBe(fromTemplates.formatLabel);
    expect(fromHost.formatDescription).toBe(fromTemplates.formatDescription);
    const portrait = fromHost.getCanvasFormatOrDefault('post-portrait');
    const slides = fromHost.getCanvasFormatOrDefault('slide-16-9');
    try {
      fromHost.registerMessages('en');
      expect(fromHost.formatLabel(portrait)).toBe('Post 4:5');
      expect(fromHost.formatDescription(slides)).toBe('1920 × 1080 · 16:9 · Slides');
      // German stays the host's choice, through the same catalogue.
      fromHost.registerMessages('de');
      expect(fromHost.formatLabel(portrait)).toBe('Beitrag 4:5');
      expect(fromHost.formatDescription(slides)).toBe('1920 × 1080 · 16:9 · Folien');
    } finally {
      fromHost.registerMessages('de');
    }
  });

  it('carries the interfaces a host augments, identical to their domain entries', () => {
    expectTypeOf<host.CanvasAiHostTypes>().toEqualTypeOf<ai.CanvasAiHostTypes>();
    expectTypeOf<host.HostElementKinds>().toEqualTypeOf<kinds.HostElementKinds>();
    expectTypeOf<host.HostCanvasActions>().toEqualTypeOf<kinds.HostCanvasActions>();
    expectTypeOf<host.CanvasEditorHostServices>().toEqualTypeOf<services.CanvasEditorHostServices>();
  });
});

describe('@ggraphic/editor/host-react', () => {
  const graph = moduleGraph(resolve(SRC, 'entries/hostReact.ts'));

  it('loads the two contexts and nothing they render', () => {
    expect(graph).toEqual([
      'CanvasEditorProvider.tsx',
      'components/CanvasEditor/blockInsertContext.ts',
      'entries/hostReact.ts',
    ]);
  });

  it('imports no package but React: no Konva, store or icons', () => {
    const packages = graph.flatMap((f) =>
      runtimeSpecifiers(resolve(SRC, f)).filter((spec) => !spec.startsWith('.'))
    );
    expect([...new Set(packages)]).toEqual(['react']);
  });
});
