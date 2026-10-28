// SPDX-License-Identifier: AGPL-3.0-only
import { OPEN_TEMPLATES } from '@ggraphic/templates-open';
import { describe, expect, it } from 'vitest';

import { studioBrand } from '../../brand';

import {
  buildCatalog,
  catalogTemplate,
  formatAspect,
  studioCatalog,
  templatesFor,
} from './catalog';

const valid = OPEN_TEMPLATES[0];

describe('the catalogue', () => {
  it('the pack yields the three templates and no problems', () => {
    const { entries, problems } = studioCatalog();
    expect(problems).toEqual([]);
    expect(entries.map((e) => e.id)).toEqual(['studio-headline', 'studio-quote', 'studio-number']);
    expect(entries.every((e) => e.source === 'pack' && !e.needsPhoto)).toBe(true);
    expect(catalogTemplate('studio-quote')?.family).toBe('quote');
    expect(catalogTemplate('nope')).toBeNull();
  });

  it('a broken file is skipped and reported, the others load', () => {
    const { entries, problems } = buildCatalog([
      { source: 'pack', files: [valid, { formatVersion: 2, id: 'future' }, { id: 'x' }] },
    ]);
    expect(entries).toHaveLength(1);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatchObject({ source: 'pack', id: 'future' });
    expect(problems[1]).toMatchObject({ source: 'pack', id: 'x' });
    expect(problems.every((p) => p.reason.length > 0)).toBe(true);
  });

  it('a duplicate id keeps the first', () => {
    const second = { ...(valid as object), version: 7 };
    const { entries, problems } = buildCatalog([
      { source: 'pack', files: [valid] },
      { source: 'organisation', files: [second] },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.version).not.toBe(7);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ source: 'organisation', id: entries[0]!.id });
  });

  it('maps the Studio formats to aspects', () => {
    expect(formatAspect('profile-square')).toBe('1:1');
    expect(formatAspect('post-portrait')).toBe('4:5');
    expect(formatAspect('slide-16-9')).toBe('16:9');
    expect(formatAspect('story')).toBeNull();
  });

  it("templatesFor('slide-16-9') leaves out a 4:5-only template", () => {
    const portraitOnly = {
      ...(valid as { id: string; formats: string[] }),
      id: 'portrait-only',
      formats: ['4:5'],
    };
    const { entries } = buildCatalog([{ source: 'pack', files: [valid, portraitOnly] }]);
    expect(entries.map((e) => e.id)).toContain('portrait-only');
    // The same filter templatesFor applies, on the studio catalogue plus the extra entry.
    expect(templatesFor('slide-16-9').map((e) => e.id)).not.toContain('portrait-only');
    expect(entries.find((e) => e.id === 'portrait-only')!.formats).not.toContain('16:9');
    expect(templatesFor('story')).toEqual([]);
  });

  it('templatesFor leaves out a template whose worlds the brand drops', () => {
    // The quote lives only in the light world; a brand whose light ground equals its secondary has no such world.
    const near = { ...studioBrand, colors: { ...studioBrand.colors, secondary: '#FAFAFA' } };
    expect(templatesFor('post-portrait', studioBrand).map((e) => e.id)).toContain('studio-quote');
    expect(templatesFor('post-portrait', near).map((e) => e.id)).not.toContain('studio-quote');
  });
});
