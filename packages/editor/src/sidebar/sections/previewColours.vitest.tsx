// SPDX-License-Identifier: MPL-2.0
import { brandDefault, type BrandPack } from '@ggraphic/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A brand whose palette ids match none of the Grünerator colour names.
const other: BrandPack = {
  ...brandDefault,
  id: 'other',
  colors: {
    ...brandDefault.colors,
    primary: '#111111',
    secondary: '#222222',
    accent: '#333333',
    accentOnLight: '#444444',
    attention: '#555555',
  },
  palette: [{ id: 'zzz', label: 'Zzz', color: '#999999' }],
};

describe('preview colours follow the brand roles', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { registerBrandPacks } = await import('../../brand/brandRegistry.js');
    registerBrandPacks([other]);
  });

  it('cycles shape variants through the colour roles, not palette ids', async () => {
    const { ALL_PALETTE_SHAPES, getShapeVariant } = await import('./FormenSection');
    const colors = ALL_PALETTE_SHAPES.slice(0, 5)
      .map((shape) => getShapeVariant(shape.id))
      .map((variant) => variant.color);
    expect(colors).toEqual(['#111111', '#222222', '#333333', '#444444', '#555555']);
  });

  it('keeps the dark-surface preview token on the primary role only', async () => {
    const { ALL_PALETTE_SHAPES, getShapeVariant } = await import('./FormenSection');
    const first = getShapeVariant(ALL_PALETTE_SHAPES[0].id);
    const second = getShapeVariant(ALL_PALETTE_SHAPES[1].id);
    expect(first.darkPreviewClass).toBe('!text-editor-primary-preview');
    expect(second.darkPreviewClass).toBe('');
  });

  it('paints the gradient text tile with the secondary and accent roles', async () => {
    const { GradientTextIcon } = await import('./tools/ToolsSection');
    const html = renderToStaticMarkup(<GradientTextIcon />);
    expect(html).toContain('stop-color="#222222"');
    expect(html).toContain('stop-color="#333333"');
  });
});
