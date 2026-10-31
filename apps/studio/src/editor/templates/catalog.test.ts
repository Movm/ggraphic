// SPDX-License-Identifier: AGPL-3.0-only
import { OPEN_TEMPLATES } from '@ggraphic/templates-open';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { studioBrand } from '../../brand';

import {
  buildCatalog,
  catalogTemplate,
  formatAspect,
  studioCatalog,
  templatesFor,
  templatesIn,
} from './catalog';

const valid = OPEN_TEMPLATES[0];

describe('the catalogue', () => {
  it('the pack yields its templates and no problems', () => {
    const { entries, problems } = studioCatalog();
    expect(problems).toEqual([]);
    expect(entries.map((e) => e.id)).toEqual([
      'studio-headline',
      'studio-quote',
      'studio-number',
      'studio-event-giant-date',
      'studio-event-photo-date',
      'studio-event-programme',
      'studio-event-date-bands',
      'studio-event-countdown',
      'studio-event-panel',
      'studio-photo-quote',
      'studio-photo-number',
      'studio-data-bar-ranking',
      'studio-data-share-bar',
      'studio-data-three-columns',
      'studio-photo-text-box',
      'studio-photo-text-fade',
      'studio-photo-text-marker',
      'studio-photo-text-panel',
      'studio-photo-text-question',
      'studio-photo-text-quiet',
      'studio-annotated-headline',
      'studio-carousel-cover',
      'studio-carousel-inner',
      'studio-community-question',
      'studio-comparison-stacked',
      'studio-demand-photo-band',
      'studio-fact-bar-chart',
      'studio-figure-of-the-month',
      'studio-framed-photo',
      'studio-good-news-slide',
      'studio-invitation-panel',
      'studio-number-one-digit',
      'studio-number-percent',
      'studio-number-photo-strip',
      'studio-number-two-columns',
      'studio-number-word-stack',
      'studio-person-broadcast',
      'studio-person-name-block',
      'studio-person-name-boxes',
      'studio-person-name-top',
      'studio-person-new-face',
      'studio-person-pair',
      'studio-petition-face',
      'studio-poster-type',
      'studio-quote-card',
      'studio-quote-giant-mark',
      'studio-quote-portrait',
      'studio-quote-side-portrait',
      'studio-quote-two-voices',
      'studio-quote-typographic',
      'studio-split-photos-band',
      'studio-statement-bar',
      'studio-statement-panel-dots',
      'studio-statement-photo',
      'studio-statement-sandwich',
      'studio-statement-serif',
      'studio-statement-split-word',
      'studio-statement-stack',
      'studio-study-kicker-boxes',
    ]);
    expect(entries.every((e) => e.source === 'pack')).toBe(true);
    expect(entries.filter((e) => e.needsPhoto).map((e) => e.id)).toEqual([
      'studio-event-photo-date',
      'studio-event-countdown',
      'studio-event-panel',
      'studio-photo-quote',
      'studio-photo-number',
      'studio-photo-text-box',
      'studio-photo-text-fade',
      'studio-photo-text-marker',
      'studio-photo-text-panel',
      'studio-photo-text-question',
      'studio-photo-text-quiet',
      'studio-annotated-headline',
      'studio-carousel-cover',
      'studio-carousel-inner',
      'studio-community-question',
      'studio-comparison-stacked',
      'studio-demand-photo-band',
      'studio-framed-photo',
      'studio-good-news-slide',
      'studio-invitation-panel',
      'studio-number-photo-strip',
      'studio-person-broadcast',
      'studio-person-name-block',
      'studio-person-name-boxes',
      'studio-person-name-top',
      'studio-person-new-face',
      'studio-person-pair',
      'studio-petition-face',
      'studio-quote-giant-mark',
      'studio-quote-portrait',
      'studio-quote-side-portrait',
      'studio-quote-two-voices',
      'studio-split-photos-band',
      'studio-statement-photo',
      'studio-statement-sandwich',
      'studio-study-kicker-boxes',
    ]);
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
    expect(problems[0]!.reason).toMatch(/formatVersion|newer|format/i);
    expect(problems[1]!.reason).toMatch(/\S/);
    expect(problems[1]!.reason).not.toBe(problems[0]!.reason);
  });

  describe('asset references', () => {
    /** The pack's first template with one more element on its first page. */
    const withElement = (key: string, el: Record<string, unknown>) => {
      const copy = structuredClone(valid) as {
        id: string;
        pages: { state: Record<string, unknown> }[];
      };
      copy.id = 'with-asset';
      const state = copy.pages[0]!.state;
      state[key] = [...((state[key] as unknown[] | undefined) ?? []), el];
      return copy;
    };
    const image = (src: string, bind?: unknown) => ({
      id: 'extra',
      src,
      fileName: '',
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.2,
      rotation: 0,
      scale: 1,
      opacity: 1,
      ...(bind ? { bind } : {}),
    });

    it('rejects a src that is not in the pack manifest, with the field and the path', () => {
      const { entries, problems } = buildCatalog([
        { source: 'pack', files: [withElement('userImageInstances', image('/assets/stray.png'))] },
      ]);
      expect(entries).toEqual([]);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatchObject({ source: 'pack', id: 'with-asset' });
      expect(problems[0]!.reason).toMatch(/extra\.src/);
      expect(problems[0]!.reason).toMatch(/\/assets\/stray\.png/);
      expect(problems[0]!.reason).toMatch(/manifest/);
    });

    it('rejects an imageSrc on a frame the same way', () => {
      const frame = {
        id: 'fr',
        imageSrc: '/assets/stray.png',
        x: 0,
        y: 0,
        width: 0.5,
        height: 0.5,
      };
      const { entries, problems } = buildCatalog([
        { source: 'pack', files: [withElement('frameInstances', frame)] },
      ]);
      expect(entries).toEqual([]);
      expect(problems[0]!.reason).toMatch(/fr\.imageSrc/);
    });

    it('lets the logo through: its src is bound to the brand and empty in the file', () => {
      const { entries, problems } = buildCatalog([
        {
          source: 'pack',
          files: [withElement('userImageInstances', image('/assets/x.png', { src: 'brand.logo' }))],
        },
      ]);
      expect(problems).toEqual([]);
      expect(entries).toHaveLength(1);
    });

    it('accepts a src that the manifest lists', () => {
      const { entries, problems } = buildCatalog(
        [{ source: 'pack', files: [withElement('userImageInstances', image('/assets/ok.png'))] }],
        new Set(['/assets/ok.png'])
      );
      expect(problems).toEqual([]);
      expect(entries).toHaveLength(1);
    });
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
    expect(templatesIn(entries, 'post-portrait', studioBrand).map((e) => e.id)).toContain(
      'portrait-only'
    );
    const wide = templatesIn(entries, 'slide-16-9', studioBrand).map((e) => e.id);
    expect(wide).not.toContain('portrait-only');
    expect(wide).toContain('studio-headline');
    expect(templatesFor('story')).toEqual([]);
  });

  it('leaves out a template whose worlds the brand drops, keeps one with a world left', () => {
    // A brand whose light ground equals its secondary has no light world.
    const near = { ...studioBrand, colors: { ...studioBrand.colors, secondary: '#FAFAFA' } };
    const lightOnly = { ...(valid as object), id: 'light-only', schemes: ['light'] };
    const { entries } = buildCatalog([{ source: 'pack', files: [valid, lightOnly] }]);
    const ids = (brand: typeof near) =>
      templatesIn(entries, 'post-portrait', brand).map((e) => e.id);
    expect(ids(studioBrand)).toContain('light-only');
    expect(ids(near)).not.toContain('light-only');
    // The quote also offers the primary world, so it stays.
    expect(templatesFor('post-portrait', near).map((e) => e.id)).toContain('studio-quote');
  });
});

describe('problems are warned once', () => {
  afterEach(() => vi.restoreAllMocks());

  it('studioCatalog is built once, so a problem is warned at most once', async () => {
    vi.resetModules();
    vi.doMock('@ggraphic/templates-open', () => ({
      OPEN_TEMPLATES: [{ id: 'broken' }],
      OPEN_TEMPLATE_MANIFEST: { assets: [] },
    }));
    try {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fresh = await import('./catalog');
      fresh.studioCatalog();
      fresh.studioCatalog();
      fresh.templatesFor('post-portrait');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain('broken');
    } finally {
      vi.doUnmock('@ggraphic/templates-open');
      vi.resetModules();
    }
  });
});
