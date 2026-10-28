// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { studioBrand } from '../brand';

import { BrandPreview } from './BrandPreview';

const settings = {
  name: 'Org',
  colors: studioBrand.colors,
  backgrounds: [],
  fonts: studioBrand.fonts,
  logoAssetId: 'a',
  logoAlt: null,
  layout: null,
} as never;

const srcOf = () =>
  (screen.getByRole('img', { name: /logo/ }) as HTMLImageElement).getAttribute('src');

describe('BrandPreview logos', () => {
  const props = {
    settings,
    logoUrl: '/main.png',
    logoAlt: { url: '/alt.png', ground: 'dark' as const },
  };

  it('shows the second logo on the grounds it is for', () => {
    render(<BrandPreview {...props} ground={{ color: '#6B1632', ink: '#ffffff' }} />);
    expect(srcOf()).toBe('/alt.png');
  });

  it('shows the main logo on the other grounds', () => {
    render(<BrandPreview {...props} ground={{ color: '#FDF0F5', ink: '#6B1632' }} />);
    expect(srcOf()).toBe('/main.png');
  });

  it('shows the main logo when there is no second one', () => {
    render(<BrandPreview {...props} logoAlt={null} ground={{ color: '#6B1632', ink: '#fff' }} />);
    expect(srcOf()).toBe('/main.png');
  });
});
