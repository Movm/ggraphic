// SPDX-License-Identifier: CC0-1.0
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { GATE_RULES } from '@ggraphic/core';
import { describe, expect, it } from 'vitest';

import { checkFile } from './gateRun.js';

const dir = fileURLToPath(new URL('./probes/', import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

/** `rule.json`, or `rule~variant.json` for a further probe of the same rule. */
const ruleOf = (file: string): string => file.replace(/\.json$/, '').split('~')[0] ?? '';

describe('each probe turns exactly its rule red', () => {
  it('has one probe per rule, plus schema', () => {
    const rules = new Set(files.map((f) => ruleOf(f)));
    expect([...rules].sort()).toEqual([...GATE_RULES, 'schema'].sort());
  });

  it.each(files)('%s', (file) => {
    const rule = ruleOf(file);
    const problems = checkFile(JSON.parse(readFileSync(dir + file, 'utf8')));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.filter((p) => p.rule !== rule)).toEqual([]);
  });
});
