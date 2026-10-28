// SPDX-License-Identifier: AGPL-3.0-only
import { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
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

  it('adds nothing for a brand without a logo or an unmeasured logo', () => {
    expect(seedFor(HEADLINE_TEMPLATE_ID, 1080, 1350).userImageInstances ?? []).toEqual([]);
    rememberLogoSize(LOGO, 0, 0);
    registerBrandPacks([withLogo, studioBrand]);
    expect(seedFor(HEADLINE_TEMPLATE_ID, 1080, 1350).userImageInstances ?? []).toEqual([]);
  });
});
