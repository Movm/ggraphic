// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';

import { OPEN_TEMPLATES } from '../src/index.js';
import { checkFile } from './gateRun.js';
import { testBrandPacks } from './testBrands.js';

describe('render gate stage 1 over the pack', () => {
  // One test per template: each gets its own budget, and a failure names the template. The
  // contrast check over photos runs every brand × scheme × format × 256 photo colours; at 79
  // templates the whole pack took 82 s on CI in one test (01.11.2026), over a single 60 s budget.
  it.each(OPEN_TEMPLATES.map((raw) => [(raw as { id?: string }).id ?? '(no id)', raw] as const))(
    '%s passes stage 1',
    (_id, raw) => {
      const lines = checkFile(raw).map(
        (p) =>
          `${p.templateId} [${p.rule}] ${p.brand ?? ''} ${p.scheme ?? ''} ${p.format ?? ''}: ${p.detail}`
      );
      expect(lines).toEqual([]);
    },
    60_000
  );

  it('testBrandPacks has brandDefault plus the 11 ids', () => {
    const packs = testBrandPacks();
    expect(packs).toHaveLength(12);
    expect(packs[0]?.id).toBe('default');
    expect(packs.slice(1).map((p) => p.name)).toEqual([
      'studio',
      'red',
      'forest',
      'neon',
      'yellow',
      'blue',
      'pastel',
      'violet',
      'paper',
      'photo',
      'night',
    ]);
    expect(packs.slice(1).every((p) => p.id === `test-${p.name}` && p.logo === null)).toBe(true);
  });

  it('the packs are derived by the documented rule', () => {
    const studio = testBrandPacks().find((p) => p.name === 'studio');
    expect(studio?.colors.surface).toBe('#ffffff');
    expect(studio?.colors.primary).toBe('#6b1632');
    expect(studio?.colors.secondary).toBe('#3a0a1b');
    expect(studio?.colors.textOnDark).toBe('#ffffff');
    expect(studio?.colors.textOnLight).toBe('#3a0a1b');
    const yellow = testBrandPacks().find((p) => p.name === 'yellow');
    // ink #121212 is darker than on-accent #ffd93b.
    expect(yellow?.colors.textOnDark).toBe('#ffd93b');
    expect(yellow?.colors.textOnLight).toBe('#121212');
  });
});
