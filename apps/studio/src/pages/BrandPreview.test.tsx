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

describe('BrandPreview accent ground', () => {
  const accent = { color: '#FF7AB6', ink: '#4A0E22', accent: '#4A0E22' };
  const page = (container: HTMLElement) =>
    container.querySelector('.studio-brand-preview__page') as HTMLElement;

  it("draws the accent bar and the highlighted lines in the ground's own accent", () => {
    const { container } = render(
      <BrandPreview settings={settings} logoUrl={null} ground={accent} />
    );
    expect(page(container).style.background).toBe('rgb(255, 122, 182)');
    // Rose on rose would vanish: the bar and the two accent lines take the ground's accent.
    const bar = page(container).querySelector(
      'span[aria-hidden]:not([data-outline])'
    ) as HTMLElement;
    expect(bar.style.background).toBe('rgb(74, 14, 34)');
    expect(screen.getByText('Find out more').style.color).toBe('rgb(74, 14, 34)');
  });

  it('keeps the brand accent on a ground that names none', () => {
    const { container } = render(
      <BrandPreview
        settings={settings}
        logoUrl={null}
        ground={{ color: '#6B1632', ink: '#ffffff' }}
      />
    );
    const bar = page(container).querySelector(
      'span[aria-hidden]:not([data-outline])'
    ) as HTMLElement;
    expect(bar.style.background).toBe('rgb(255, 122, 182)');
  });
});

describe('BrandPreview layout', () => {
  it('starts the accent rule flush with the headline, as the template does', () => {
    const { container } = render(
      <BrandPreview settings={settings} logoUrl={null} ground={{ color: '#6B1632', ink: '#fff' }} />
    );
    const page = container.querySelector('.studio-brand-preview__page')!;
    const rule = page.querySelector('span[aria-hidden]') as HTMLElement;
    const headline = screen.getByText('A clear headline');
    expect(rule.style.left).toBe(headline.style.left);
  });
});
