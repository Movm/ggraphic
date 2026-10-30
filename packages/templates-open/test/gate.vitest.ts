// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';

import { OPEN_TEMPLATES } from '../src/index.js';
import { checkFile } from './gateRun.js';
import { testBrandPacks } from './testBrands.js';

describe('render gate stage 1 over the pack', () => {
  it('every template of the pack passes stage 1', () => {
    const problems = OPEN_TEMPLATES.flatMap((raw) => checkFile(raw));
    const lines = problems.map(
      (p) =>
        `${p.templateId} [${p.rule}] ${p.brand ?? ''} ${p.scheme ?? ''} ${p.format ?? ''}: ${p.detail}`
    );
    expect(lines).toEqual([]);
    // Every template × brand × scheme × format: ~3 s locally, ~8 s on CI, and the pack keeps growing.
  }, 60_000);

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
