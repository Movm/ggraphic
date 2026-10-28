// SPDX-License-Identifier: AGPL-3.0-only
import { brandFingerprint, normalizeColor } from '@ggraphic/core';
import { activeBrand, registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { afterEach, describe, expect, it } from 'vitest';

import { studioBrand } from '../../brand';
import { rememberLogoSize } from '../../logoSize';
import { HEADLINE_TEMPLATE_ID, NUMBER_TEMPLATE_ID, QUOTE_TEMPLATE_ID } from './ids';
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
    expect(logo.bind?.['src']).toEqual({ ref: 'brand.logo', value: LOGO });
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

describe('bound seeds', () => {
  const colourOf = (state: SeedState, id: string) =>
    state.additionalTexts.find((t) => t.id === id)!['fill'];

  it("keeps today's colours for the default brand", () => {
    registerBrandPacks([studioBrand]);
    const headline = stateOf(HEADLINE_TEMPLATE_ID);
    expect(same(headline.backgroundColor, WINE)).toBe(true);
    expect(same(headline.shapeInstances[0]!['fill'], ROSE)).toBe(true);
    expect(same(colourOf(headline, 'headline'), WHITE)).toBe(true);
    expect(same(colourOf(headline, 'subline'), ROSE)).toBe(true);
    expect(same(colourOf(headline, 'body'), WHITE)).toBe(true);
    expect(same(colourOf(headline, 'cta'), ROSE)).toBe(true);

    const quote = stateOf(QUOTE_TEMPLATE_ID);
    expect(same(quote.backgroundColor, BLUSH)).toBe(true);
    expect(same(colourOf(quote, 'quote-mark'), MAGENTA)).toBe(true);
    expect(same(colourOf(quote, 'headline'), WINE)).toBe(true);
    expect(same(colourOf(quote, 'subline'), MAGENTA)).toBe(true);

    const number = stateOf(NUMBER_TEMPLATE_ID);
    expect(same(number.backgroundColor, MAGENTA)).toBe(true);
    expect(same(colourOf(number, 'number'), ROSE)).toBe(true);
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
        expect(text.bind?.['fontFamily']?.value, text.id).toBe(text['fontFamily']);
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

  it('binds the speaker to the secondary colour and the big number to the accent', () => {
    const speaker = stateOf(QUOTE_TEMPLATE_ID).additionalTexts.find((t) => t.id === 'subline')!;
    expect(speaker.bind?.['fill']?.ref).toBe('brand.secondary');
    const big = stateOf(NUMBER_TEMPLATE_ID).additionalTexts.find((t) => t.id === 'number')!;
    expect(big.bind?.['fill']?.ref).toBe('brand.accent');
  });
});
