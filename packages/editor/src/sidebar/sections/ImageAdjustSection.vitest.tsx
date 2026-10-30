// SPDX-License-Identifier: MPL-2.0
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { duotoneLook, IMAGE_PRESETS } from '@ggraphic/editor/utils/imageFilters';
import { ImageAdjustSection } from '@ggraphic/editor/sidebar/sections/ImageAdjustSection';
import { axe } from '../../test-utils';

import type { UserImageInstance } from '@ggraphic/editor/utils/userImageUtils';

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
      screen.getByRole('button', { name: IMAGE_PRESETS.find((p) => p.id === 'grau')!.label })
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
