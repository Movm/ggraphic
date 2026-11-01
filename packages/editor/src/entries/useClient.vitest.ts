// SPDX-License-Identifier: MPL-2.0
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** The emitted JS of a source file, compiled the way `tsconfig.build.json` compiles it. */
function emitted(file: string): string {
  const path = fileURLToPath(new URL(file, import.meta.url));
  const parsed = ts.getParsedCommandLineOfConfigFile(
    fileURLToPath(new URL('../../tsconfig.build.json', import.meta.url)),
    {},
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} }
  )!;
  return ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: parsed.options,
    fileName: path,
  }).outputText;
}

/** The directive prologue of a module: the leading string-literal statements. */
function directives(js: string): string[] {
  const source = ts.createSourceFile('out.js', js, ts.ScriptTarget.Latest);
  const out: string[] = [];
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    out.push(statement.expression.text);
  }
  return out;
}

describe('the embed entry is a client boundary (React Server Components)', () => {
  it("keeps 'use client' as the first statement of the compiled module", () => {
    expect(directives(emitted('./embed.ts'))).toEqual(['use client']);
  });
});
