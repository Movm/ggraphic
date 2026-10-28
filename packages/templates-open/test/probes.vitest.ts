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

type Element = Record<string, unknown>;
type State = Record<string, Element[]>;
/** Sets one property of one element of the probe's page. */
const set = (kind: string, id: string | number, field: string, value: unknown) => (s: State) => {
  const list = s[kind]!;
  const el = typeof id === 'number' ? list[id] : list.find((x) => x['id'] === id);
  el![field] = value;
};

/** Probes that turn red through one property: with that property neutralised they are clean. */
const NEUTRAL: Record<string, (state: State) => void> = {
  'contrast~rotated-ground.json': set('shapeInstances', 'card', 'rotation', 0),
  'bounds~rotated-photo.json': set('userImageInstances', 'photo', 'rotation', 0),
  'bounds~rotated-text.json': set('additionalTexts', 0, 'rotation', 0),
  'bounds~scaled-text.json': set('additionalTexts', 'note', 'scale', 1),
};

describe('a probe is red only because of its defect', () => {
  it.each(Object.keys(NEUTRAL))('%s is clean without it', (file) => {
    const t = JSON.parse(readFileSync(dir + file, 'utf8'));
    NEUTRAL[file]!(t.pages[0].state as State);
    expect(checkFile(t).map((p) => `${p.rule}: ${p.detail}`)).toEqual([]);
  });
});
