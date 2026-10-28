// SPDX-License-Identifier: AGPL-3.0-only
import {
  brandFingerprint,
  contrastRatio,
  deriveBrandColors,
  deriveSchemes,
  normalizeColor,
  rebindPageState,
  resolveScheme,
} from '@ggraphic/core';
import { activeBrand, registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { afterEach, describe, expect, it } from 'vitest';

import { studioBrand } from '../../brand';
import { formatSize } from '../document';
import { rememberLogoSize } from '../../logoSize';
import {
  HEADLINE_TEMPLATE_ID,
  NUMBER_TEMPLATE_ID,
  QUOTE_TEMPLATE_ID,
  STUDIO_TEMPLATE_IDS,
} from './ids';
import { seedFor, seedPageState } from './seeds';

const LOGO = '/api/brand-assets/' + 'a'.repeat(32) + '.png';
const withLogo = { ...studioBrand, id: 'org-logo', logo: { src: LOGO, label: 'Org logo' } };

afterEach(() => registerBrandPacks([studioBrand]));

describe('brand logo on templates', () => {
  it.each([HEADLINE_TEMPLATE_ID, QUOTE_TEMPLATE_ID, NUMBER_TEMPLATE_ID] as const)(
    'puts the brand logo bottom right on %s, in its own proportions',
    (template) => {
      rememberLogoSize(LOGO, 400, 100);
      registerBrandPacks([withLogo, studioBrand]);
      const state = seedPageState(template, 1080, 1350);
      const images = state['userImageInstances'] as {
        id: string;
        src: string;
        x: number;
        y: number;
        width: number;
        height: number;
      }[];
      expect(images).toHaveLength(1);
      const logo = images[0]!;
      expect(logo.src).toBe(LOGO);
      expect(logo.width / logo.height).toBeCloseTo(4, 1);
      // Inside the page, in the lower right quarter.
      expect(logo.x + logo.width).toBeLessThanOrEqual(1080);
      expect(logo.y + logo.height).toBeLessThanOrEqual(1350);
      expect(logo.x).toBeGreaterThan(540);
      expect(logo.y).toBeGreaterThan(675);
      expect(state['layerOrder']).toContain(logo.id);
    }
  );

  it('binds the logo src to brand.logo', () => {
    rememberLogoSize(LOGO, 400, 100);
    registerBrandPacks([withLogo, studioBrand]);
    const logo = (
      seedPageState(HEADLINE_TEMPLATE_ID, 1080, 1350)['userImageInstances'] as {
        bind?: Record<string, { ref: string; value: string }>;
      }[]
    )[0]!;
    expect(logo.bind?.['src']).toMatchObject({ ref: 'brand.logo', value: LOGO });
  });

  it('stores the envelope and fit on the logo binding, and the fit is the box', () => {
    rememberLogoSize(LOGO, 400, 100);
    registerBrandPacks([withLogo, studioBrand]);
    const logo = (
      seedPageState(HEADLINE_TEMPLATE_ID, 1080, 1350)['userImageInstances'] as {
        x: number;
        y: number;
        width: number;
        height: number;
        bind?: Record<string, { box?: object; fit?: object }>;
      }[]
    )[0]!;
    const { x, y, width, height } = logo;
    expect(logo.bind?.['src']?.fit).toEqual({ x, y, width, height });
    expect(logo.bind?.['src']?.box).toMatchObject({ width: 238, height: 108 });
  });

  it('adds nothing for a brand without a logo or an unmeasured logo', () => {
    expect(seedFor(HEADLINE_TEMPLATE_ID, 1080, 1350).userImageInstances ?? []).toEqual([]);
    rememberLogoSize(LOGO, 0, 0);
    registerBrandPacks([withLogo, studioBrand]);
    expect(seedFor(HEADLINE_TEMPLATE_ID, 1080, 1350).userImageInstances ?? []).toEqual([]);
  });
});

type Bound = { id: string; bind?: Record<string, { ref: string; value: string }> } & Record<
  string,
  unknown
>;
type SeedState = {
  backgroundColor: string;
  bind?: Record<string, { ref: string; value: string }>;
  brandScheme?: string;
  brandStamp?: string;
  additionalTexts: Bound[];
  shapeInstances: Bound[];
};
const stateOf = (template: Parameters<typeof seedPageState>[0]) =>
  seedPageState(template, 1080, 1350) as unknown as SeedState;
const same = (a: unknown, b: string) => normalizeColor(String(a)) === normalizeColor(b);

// The literals the seeds produced before they were bound, on the Studio's own brand.
const WINE = '#6B1632';
const MAGENTA = '#D4146E';
const ROSE = '#FF7AB6';
const BLUSH = '#FDF0F5';
const WHITE = '#FFFFFF';

describe('seeds under a brand whose light world was deduplicated', () => {
  it('draw the quote in the world that absorbed it', () => {
    const near = { ...studioBrand, colors: { ...studioBrand.colors, secondary: '#FAFAFA' } };
    registerBrandPacks([near, studioBrand]);
    const quote = stateOf(QUOTE_TEMPLATE_ID);
    const secondary = deriveSchemes(near).find((s) => s.id === 'secondary')!;
    expect(quote.brandScheme).toBe('light');
    expect(same(quote.backgroundColor, secondary.roles.ground)).toBe(true);
    expect(same(quote.backgroundColor, near.colors.primary)).toBe(false);
  });
});

describe('bound seeds', () => {
  const colourOf = (state: SeedState, id: string) =>
    state.additionalTexts.find((t) => t.id === id)!['fill'];

  it("keeps today's colours for the default brand", () => {
    registerBrandPacks([studioBrand]);
    const headline = stateOf(HEADLINE_TEMPLATE_ID);
    expect(same(headline.backgroundColor, WINE)).toBe(true);
    expect(same(headline.shapeInstances[0]!['fill'], ROSE)).toBe(true);
    expect(same(colourOf(headline, 'headline'), WHITE)).toBe(true);
    // Small text takes the world's softer ink: the accent is only guaranteed 3:1.
    const softInk = resolveScheme(studioBrand, 'primary')!.roles.ink2;
    expect(same(colourOf(headline, 'subline'), softInk)).toBe(true);
    expect(same(colourOf(headline, 'body'), WHITE)).toBe(true);
    expect(same(colourOf(headline, 'cta'), softInk)).toBe(true);

    const quote = stateOf(QUOTE_TEMPLATE_ID);
    expect(same(quote.backgroundColor, BLUSH)).toBe(true);
    expect(same(colourOf(quote, 'quote-mark'), MAGENTA)).toBe(true);
    expect(same(colourOf(quote, 'headline'), WINE)).toBe(true);
    // The speaker line is the world's softer ink: magenta/yellow secondaries do not read on a light ground.
    expect(same(colourOf(quote, 'subline'), resolveScheme(studioBrand, 'light')!.roles.ink2)).toBe(
      true
    );

    const number = stateOf(NUMBER_TEMPLATE_ID);
    expect(same(number.backgroundColor, MAGENTA)).toBe(true);
    // Deliberately not ROSE any more: rose on magenta is 2.11:1, so the world's accent falls back to white (5.09:1).
    expect(same(colourOf(number, 'number'), WHITE)).toBe(true);
    expect(same(colourOf(number, 'headline'), WHITE)).toBe(true);
    expect(same(colourOf(number, 'subline'), WHITE)).toBe(true);
  });

  it.each([HEADLINE_TEMPLATE_ID, QUOTE_TEMPLATE_ID, NUMBER_TEMPLATE_ID] as const)(
    'binds every colour and font on %s',
    (template) => {
      const state = stateOf(template);
      expect(state.bind?.['backgroundColor']?.value).toBe(state.backgroundColor);
      for (const shape of state.shapeInstances) {
        expect(shape.bind?.['fill']?.value, shape.id).toBe(shape['fill']);
      }
      for (const text of state.additionalTexts) {
        expect(text.bind?.['fill']?.value, text.id).toBe(text['fill']);
        // The field carries the stack of typography.ts; the binding the bare family.
        const family = text.bind?.['fontFamily']?.value as string;
        expect(family, text.id).not.toContain(',');
        expect(text['fontFamily'], text.id).toMatch(new RegExp(`^${family}, `));
      }
    }
  );

  it('gives each template its colour world and stamps the brand', () => {
    expect(stateOf(HEADLINE_TEMPLATE_ID).brandScheme).toBe('primary');
    expect(stateOf(QUOTE_TEMPLATE_ID).brandScheme).toBe('light');
    expect(stateOf(NUMBER_TEMPLATE_ID).brandScheme).toBe('secondary');
    for (const t of [HEADLINE_TEMPLATE_ID, QUOTE_TEMPLATE_ID, NUMBER_TEMPLATE_ID] as const) {
      expect(stateOf(t).brandStamp).toBe(brandFingerprint(activeBrand()));
    }
  });

  it('binds the speaker to the softer ink and the big number to the world accent', () => {
    const speaker = stateOf(QUOTE_TEMPLATE_ID).additionalTexts.find((t) => t.id === 'subline')!;
    expect(speaker.bind?.['fill']?.ref).toBe('ink2');
    const big = stateOf(NUMBER_TEMPLATE_ID).additionalTexts.find((t) => t.id === 'number')!;
    expect(big.bind?.['fill']?.ref).toBe('accent');
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
   * WCAG "large text" is 24 CSS px, as rendered. Seed type sizes are artboard pixels, set for a
   * 1080 px short side (`scaleFor`) and shown shrunk. A phone shows the artboard about 360 CSS px
   * wide, a third of its size, so 24 CSS px is 72 artboard px on a 1080 short side. Relative to
   * the artboard that is a text height of 1/15 of the short side, the same on every format
   * (24 px on a 1080 artboard would be only ~8 CSS px, nowhere near large). Anything smaller
   * needs 4.5:1.
   */
  const LARGE_TEXT_SHARE_OF_SHORT_SIDE = 72 / 1080;
  const FORMATS = ['profile-square', 'post-portrait', 'slide-16-9'].map((id) => ({
    id,
    ...formatSize(id),
  }));

  describe.each(brands)('on the $id brand', (brand) => {
    const worlds = () => deriveSchemes(brand).map((s) => s.id);

    it.each(FORMATS)(
      'every text of every template reads on the page background of every world the brand offers ($id; the background only, not text over shapes or photos)',
      ({ width, height }) => {
        registerBrandPacks([brand, studioBrand]);
        const failures: string[] = [];
        for (const template of STUDIO_TEMPLATE_IDS) {
          const seeded = seedPageState(template, width, height);
          for (const world of worlds()) {
            // The AI can put a template in any offered world: bind the page into it the same way.
            const { brandStamp: _stamp, ...rest } = seeded;
            const page = rebindPageState({ ...rest, brandScheme: world }, { brand }).state;
            const ground = page['backgroundColor'] as string;
            for (const t of page['additionalTexts'] as {
              id: string;
              fill: string;
              fontSize: number;
            }[]) {
              const ratio = contrastRatio(t.fill, ground) ?? 0;
              const large = t.fontSize >= LARGE_TEXT_SHARE_OF_SHORT_SIDE * Math.min(width, height);
              const need = large ? 3 : 4.5;
              if (ratio < need) {
                failures.push(
                  `${template}/${world}/${t.id}: ${ratio.toFixed(2)} < ${need} (${t.fill} on ${ground})`
                );
              }
            }
          }
        }
        expect(failures).toEqual([]);
      }
    );
  });
});
