// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DocumentBrandContext } from '../../brand/documentBrand.js';
import { PACK_B } from '../../testing/documentBrandPacks.js';
import { duotoneLook, fallbackTintOf, IMAGE_PRESETS } from '../../utils/imageFilters.js';
import { ImageAdjustSection } from './ImageAdjustSection.js';
import { axe } from '../../test-utils';

import type { UserImageInstance } from '../../utils/userImageUtils.js';

const image = (extra: Partial<UserImageInstance> = {}): UserImageInstance => ({
  id: 'img',
  src: 'data:image/png;base64,AAAA',
  fileName: 'p.png',
  x: 0,
  y: 0,
  width: 400,
  height: 300,
  rotation: 0,
  scale: 1,
  opacity: 1,
  ...extra,
});

function setup(selectedImage: UserImageInstance, brandScheme?: string | null) {
  const onUpdateImage = vi.fn();
  const view = render(
    <ImageAdjustSection
      selectedImage={selectedImage}
      onUpdateImage={onUpdateImage}
      brandScheme={brandScheme}
    />
  );
  return { onUpdateImage, ...view };
}

describe('ImageAdjustSection duotone', () => {
  it('selecting Duotone binds both fields to duo-low/duo-high of the page scheme', () => {
    const { onUpdateImage } = setup(
      image({ grayscale: true, tint: '#00ff00', tintStrength: 1 }),
      'dark'
    );
    fireEvent.click(
      screen.getByRole('button', { name: IMAGE_PRESETS.find((p) => p.id === 'duotone')!.label })
    );
    const look = duotoneLook(undefined, 'dark')!;
    expect(onUpdateImage).toHaveBeenCalledTimes(1);
    const [id, patch] = onUpdateImage.mock.calls[0]!;
    expect(id).toBe('img');
    expect(patch).toMatchObject({
      duotoneLow: look.duotoneLow,
      duotoneHigh: look.duotoneHigh,
      grayscale: false,
      tint: null,
      tintStrength: 0,
      bind: {
        duotoneLow: { ref: 'duo-low', value: look.duotoneLow },
        duotoneHigh: { ref: 'duo-high', value: look.duotoneHigh },
      },
    });
  });

  it('a page without a scheme uses the primary scheme', () => {
    const { onUpdateImage } = setup(image());
    fireEvent.click(
      screen.getByRole('button', { name: IMAGE_PRESETS.find((p) => p.id === 'duotone')!.label })
    );
    expect(onUpdateImage.mock.calls[0]![1].duotoneLow).toBe(
      duotoneLook(undefined, 'primary')!.duotoneLow
    );
  });

  it('choosing another preset clears both fields and their bindings only', () => {
    const look = duotoneLook(
      { bind: { shadowColor: { ref: 'brand.accent', value: '#fc0' } } },
      'dark'
    )!;
    const { onUpdateImage } = setup(
      image({ duotoneLow: look.duotoneLow, duotoneHigh: look.duotoneHigh, bind: look.bind }),
      'dark'
    );
    fireEvent.click(
      screen.getByRole('button', { name: IMAGE_PRESETS.find((p) => p.id === 'grayscale')!.label })
    );
    const patch = onUpdateImage.mock.calls[0]![1];
    expect(patch).toMatchObject({ grayscale: true, duotoneLow: null, duotoneHigh: null });
    expect(Object.keys(patch.bind)).toEqual(['shadowColor']);
  });

  it('has no axe violations', async () => {
    const { container } = setup(image());
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('ImageAdjustSection tint fallback follows the document brand', () => {
  // PACK_B's accent (#F9A03F) is not among its tints, so the fallback is tints[0].
  const inBrandB = (img: UserImageInstance) => {
    const onUpdateImage = vi.fn();
    const view = render(
      <DocumentBrandContext.Provider value={PACK_B}>
        <ImageAdjustSection selectedImage={img} onUpdateImage={onUpdateImage} />
      </DocumentBrandContext.Provider>
    );
    return { onUpdateImage, ...view };
  };

  it('fallbackTintOf takes the accent when it is a swatch, else the first swatch', () => {
    expect(fallbackTintOf(PACK_B)).toBe('#0B6E4F');
    const accentIsSwatch = {
      colors: { accent: '#C1121F' },
      effects: { tints: PACK_B.effects.tints },
    };
    expect(fallbackTintOf(accentIsSwatch)).toBe('#C1121F');
  });

  it('moving Intensität on an image without tint writes the brand fallback tint', () => {
    const { onUpdateImage } = inBrandB(image());
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Stärke' }), { key: 'ArrowRight' });
    expect(onUpdateImage).toHaveBeenCalledTimes(1);
    expect(onUpdateImage.mock.calls[0]![1]).toMatchObject({ tint: '#0B6E4F' });
  });

  it('keeps the image tint when it already has one', () => {
    const { onUpdateImage } = inBrandB(image({ tint: '#C1121F', tintStrength: 0.5 }));
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Stärke' }), { key: 'ArrowRight' });
    expect(onUpdateImage.mock.calls[0]![1]).not.toHaveProperty('tint');
  });

  it('highlights the first swatch, not the accent, for an image with strength but no tint', () => {
    inBrandB(image({ tintStrength: 1 }));
    const pressed = screen.getAllByRole('button', { pressed: true });
    expect(pressed).toHaveLength(1);
    expect(pressed[0]!.getAttribute('style')).toMatch(/rgb\(11, 110, 79\)|#0b6e4f/i);
  });
});
