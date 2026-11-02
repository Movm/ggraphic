// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Source guard: `@ggraphic/editor/styles/compiled` styles only `[data-ggraphic]` and what is
 * inside it. A portal renders outside the shell's root, so a file that opens one (react-dom's
 * `createPortal` or a Radix `*.Portal`) must spread `EDITOR_SCOPE` onto the portalled element;
 * otherwise that UI turns up unstyled in a host without Tailwind and nothing else fails.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = path.resolve(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.vitest\.tsx?$/.test(name) ? [full] : [];
  });
}

const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const opensPortal = (code: string) =>
  /\bcreatePortal\(/.test(code) || /<[A-Za-z]+\.Portal[\s>]/.test(code);

describe('EDITOR_SCOPE on portals', () => {
  const portalFiles = sourceFiles(SRC).filter((file) =>
    opensPortal(stripComments(readFileSync(file, 'utf8')))
  );

  it('finds the portals (the scan itself works)', () => {
    expect(portalFiles.length).toBeGreaterThanOrEqual(8);
  });

  it.each(portalFiles.map((file) => [path.relative(SRC, file)]))('%s marks its portal', (rel) => {
    const code = stripComments(readFileSync(path.join(SRC, rel), 'utf8'));
    expect(code).toContain('{...EDITOR_SCOPE}');
  });
});
