// SPDX-License-Identifier: MPL-2.0
import { rebindPageState } from '@ggraphic/core';
import { describe, expect, it } from 'vitest';

import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';

import { duotoneLook } from './imageFilters.js';
import { currentImageLook, imageLookPatch } from './imageLook.js';

describe('imageLookPatch', () => {
  it('B/W: grayscale and contrast 6, duotone and its bindings gone', () => {
    const look = duotoneLook(
      { bind: { shadowColor: { ref: 'brand.accent', value: '#fc0' } } },
      'dark'
    )!;
    const patch = imageLookPatch('bw', look, 'dark') as Record<string, unknown> & {
      bind?: Record<string, unknown>;
    };
    expect(patch).toMatchObject({
      grayscale: true,
      contrast: 6,
      duotoneLow: null,
      duotoneHigh: null,
    });
    expect(Object.keys(patch.bind ?? {})).toEqual(['shadowColor']);
  });

  it('Duotone: the shared preset logic, bound to the page scheme', () => {
    expect(imageLookPatch('duotone', {}, 'dark')).toEqual(duotoneLook(undefined, 'dark'));
  });

  it('Darken: only brightness -0.3', () => {
    expect(imageLookPatch('darken', { grayscale: true }, 'dark')).toEqual({ brightness: -0.3 });
  });

  it('None clears what a look set and keeps a hand-set contrast or brightness', () => {
    const bw = imageLookPatch('none', { grayscale: true, contrast: 6, brightness: -0.3 }, null);
    expect(bw).toMatchObject({ grayscale: false, contrast: 0, brightness: 0, duotoneLow: null });
    const hand = imageLookPatch('none', { contrast: 20, brightness: 0.2 }, null);
    expect(hand).not.toHaveProperty('contrast');
    expect(hand).not.toHaveProperty('brightness');
  });

  it('the current look is derived from the fields', () => {
    expect(currentImageLook({ duotoneLow: '#000', duotoneHigh: '#fff', grayscale: true })).toBe(
      'duotone'
    );
    expect(currentImageLook({ duotoneLow: '#000' })).toBe('none');
    expect(currentImageLook({ grayscale: true })).toBe('bw');
    expect(currentImageLook({ brightness: -0.3 })).toBe('darken');
    expect(currentImageLook({ brightness: -0.2 })).toBe('none');
    expect(currentImageLook({})).toBe('none');
  });

  it('a page world change recolours a Duotone image chosen through the control', () => {
    const image = { id: 'i', ...imageLookPatch('duotone', {}, 'dark') } as Record<string, unknown>;
    const moved = rebindPageState(
      { brandScheme: 'light', userImageInstances: [image] },
      { brand: activeBrand() }
    );
    const img = (moved.state['userImageInstances'] as Record<string, unknown>[])[0]!;
    const light = duotoneLook(undefined, 'light')!;
    expect(img['duotoneLow']).toBe(light.duotoneLow);
    expect(img['duotoneHigh']).toBe(light.duotoneHigh);
  });
});
