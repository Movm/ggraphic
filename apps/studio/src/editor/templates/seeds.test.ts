// SPDX-License-Identifier: AGPL-3.0-only
/**
 * What the data-driven seeds must keep that `seedsAsData.test.ts` (placing against the golden) does not
 * say: stored legacy pages keep their layout, `seedFor` serves the legacy ids, and every catalogue
 * template reads on its ground in every world, brand and format.
 */
import { contrastRatio, deriveBrandColors, offeredSchemes } from '@ggraphic/core';
import { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { studioBrand } from '../../brand';
import { formatSize } from '../document';

import { studioCatalog, templatesFor } from './catalog';
import { templatePageState } from './instantiate';
import { pageStateFrom } from './pageState';
import { seedFor, seedPageState } from './seeds';

import golden from './__golden__/code-seeds.json';

afterEach(() => registerBrandPacks([studioBrand]));

type Box = { id: string; x: number; y: number; width?: number; fontSize?: number };

describe('a legacy headline page', () => {
  it('keeps its configId and layout through pageStateFrom', () => {
    const stored = structuredClone(golden.plain['studio-headline']) as Record<string, unknown>;
    const page = pageStateFrom(stored, seedFor('studio-headline', 1080, 1350));
    const key = (e: Box) => [e.id, e.x, e.y, e.width, e.fontSize];
    for (const list of ['additionalTexts', 'shapeInstances'] as const) {
      expect((page[list] as unknown as Box[]).map(key)).toEqual((stored[list] as Box[]).map(key));
    }
    expect(page.layerOrder).toEqual(stored['layerOrder']);
  });
});

describe('seedFor', () => {
  it('gives the blank page and an unknown id nothing', () => {
    expect(seedFor('studio-blank', 1080, 1350)).toEqual({});
    expect(seedFor('studio-gone', 1080, 1350)).toEqual({});
    expect(seedPageState('studio-gone', 1080, 1350)['additionalTexts']).toEqual([]);
  });

  it("gives a blank page where the template does not declare the sheet's aspect", async () => {
    vi.resetModules();
    const { OPEN_TEMPLATES, OPEN_TEMPLATE_MANIFEST } = await import('@ggraphic/templates-open');
    const quote = OPEN_TEMPLATES.find((t) => (t as { id: string }).id === 'studio-quote')!;
    vi.doMock('@ggraphic/templates-open', () => ({
      OPEN_TEMPLATES: [{ ...(quote as object), id: 'portrait-only', formats: ['4:5'] }],
      OPEN_TEMPLATE_MANIFEST,
    }));
    try {
      const fresh = await import('./seeds');
      // The same template places on the aspect it declares ...
      expect(fresh.seedFor('portrait-only', 1080, 1350).additionalTexts?.length).toBeGreaterThan(0);
      // ... and is not stretched onto one it does not (a square and a wide sheet).
      expect(fresh.seedFor('portrait-only', 1080, 1080)).toEqual({});
      expect(fresh.seedFor('portrait-only', 1920, 1080)).toEqual({});
    } finally {
      vi.doUnmock('@ggraphic/templates-open');
      vi.resetModules();
    }
  });

  it('gives a catalogue id the placed page of the matching format', () => {
    const wide = seedFor('studio-quote', 1920, 1080);
    const placed = templatePageState(studioCatalog().entries[1]!, 'slide-16-9')!;
    expect(wide.additionalTexts).toEqual(placed['additionalTexts']);
  });
});

describe('text contrast', () => {
  /** The pack the browser test used: a green primary with a yellow secondary. */
  const greenColors = deriveBrandColors({
    primary: '#0F5F3A',
    secondary: '#F2B705',
    accent: '#7FD1A0',
  })!;
  const brands = [studioBrand, { ...studioBrand, id: 'green', colors: greenColors }];
  /**
   * WCAG "large text" is 24 CSS px as rendered. A phone shows the artboard about a third of its size,
   * so that is 72 artboard px on a 1080 short side: a text height of 1/15 of the short side, the same
   * on every format. Anything smaller needs 4.5:1.
   */
  const LARGE_TEXT_SHARE_OF_SHORT_SIDE = 72 / 1080;
  const FORMATS = ['profile-square', 'post-portrait', 'slide-16-9'].map((id) => ({
    id,
    ...formatSize(id),
  }));

  describe.each(brands)('on the $id brand', (brand) => {
    it.each(FORMATS)(
      'every text of every template reads on its ground in every world it offers ($id; the page background, or the shape that holds the text; not text over photos)',
      ({ id: formatId, width, height }) => {
        registerBrandPacks([brand, studioBrand]);
        const failures: string[] = [];
        let checked = 0;
        for (const entry of templatesFor(formatId, brand)) {
          for (const world of offeredSchemes(entry.template, brand)) {
            const page = templatePageState(entry, formatId, { schemeId: world });
            if (!page) {
              failures.push(`${entry.id}/${world}: not placeable`);
              continue;
            }
            const ground = page['backgroundColor'] as string;
            const shapes = (page['shapeInstances'] ?? []) as {
              id: string;
              x: number;
              y: number;
              width: number;
              height: number;
              fill: string;
              opacity?: number;
              glow?: boolean;
              shade?: string;
              pattern?: string;
              hug?: { text: string | string[] };
            }[];
            const order = page['layerOrder'] as string[];
            for (const t of page['additionalTexts'] as {
              id: string;
              x: number;
              y: number;
              width: number;
              fill: string;
              fontSize: number;
            }[]) {
              checked += 1;
              // Only a flat, opaque shape below the text is a ground: a glow, a fade, a veil or a
              // pattern is not.
              const grounds = shapes
                .filter((sh) => !sh.glow && !sh.shade && !sh.pattern && (sh.opacity ?? 1) === 1)
                .filter((sh) => order.indexOf(sh.id) < order.indexOf(t.id))
                .reverse();
              // A plate that hugs the text is its ground, even where it is narrower than the
              // text's box; otherwise the shape that holds the text's whole first line.
              const holder =
                grounds.find((sh) => [sh.hug?.text ?? []].flat().includes(t.id)) ??
                grounds.find(
                  (sh) =>
                    t.x >= sh.x - sh.width / 2 &&
                    t.x + t.width <= sh.x + sh.width / 2 &&
                    t.y >= sh.y - sh.height / 2 &&
                    t.y + t.fontSize <= sh.y + sh.height / 2
                );
              const ratio = contrastRatio(t.fill, holder?.fill ?? ground) ?? 0;
              const large = t.fontSize >= LARGE_TEXT_SHARE_OF_SHORT_SIDE * Math.min(width, height);
              const need = large ? 3 : 4.5;
              if (ratio < need) {
                failures.push(
                  `${entry.id}/${world}/${t.id}: ${ratio.toFixed(2)} < ${need} (${t.fill} on ${holder?.fill ?? ground})`
                );
              }
            }
          }
        }
        expect(checked).toBeGreaterThan(0);
        expect(failures).toEqual([]);
      }
    );
  });
});
