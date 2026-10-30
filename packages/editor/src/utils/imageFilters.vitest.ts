// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { rebindPageState, type Bindings } from '@ggraphic/core';

import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import {
  DuotoneFilter,
  FlipFilter,
  IMAGE_PRESETS,
  TintFilter,
  VignetteFilter,
  backgroundAdjustments,
  duotoneLook,
  getActiveImageFilters,
  imageFilterAttrs,
  withoutDuotone,
} from '@ggraphic/editor/utils/imageFilters';

import type Konva from 'konva';

type FilterFn = (this: Konva.Node, imageData: ImageData) => void;

/**
 * Runs a filter on a node stand-in: the filters only read attrs. Konva types a
 * filter as `FilterFunction | string`; these two are functions.
 */
const run = (filter: typeof FlipFilter, attrs: Record<string, unknown>, img: ImageData) =>
  (filter as FilterFn).call({ getAttr: (k: string) => attrs[k] } as unknown as Konva.Node, img);

/** width × height pixels; the red channel holds the pixel's index. */
function pixels(width: number, height: number, value?: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = value ?? i;
    data[i * 4 + 1] = value ?? 0;
    data[i * 4 + 2] = value ?? 0;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data, colorSpace: 'srgb' } as ImageData;
}
const reds = (img: ImageData) => Array.from(img.data.filter((_, i) => i % 4 === 0));

describe('image filters', () => {
  it('turns the vignette and the flip on only when set', () => {
    expect(getActiveImageFilters({})).toEqual([]);
    expect(getActiveImageFilters({ vignette: 0.5 })).toEqual([VignetteFilter]);
    expect(getActiveImageFilters({ flipY: true })).toEqual([FlipFilter]);
  });

  it('mirrors left–right and top–bottom', () => {
    const img = pixels(3, 2);
    run(FlipFilter, { flipX: true }, img);
    expect(reds(img)).toEqual([2, 1, 0, 5, 4, 3]);
    run(FlipFilter, { flipX: true, flipY: true }, img);
    expect(reds(img)).toEqual([3, 4, 5, 0, 1, 2]);
  });

  it('darkens the corners and leaves the middle', () => {
    const img = pixels(9, 9, 200);
    run(VignetteFilter, { vignette: 1 }, img);
    const at = (x: number, y: number) => img.data[(y * 9 + x) * 4]!;
    expect(at(4, 4)).toBe(200);
    expect(at(0, 0)).toBeLessThan(20);
    expect(img.data[3]).toBe(255);
  });

  it('reads the background photo look off the page state', () => {
    expect(backgroundAdjustments({})).toBeNull();
    expect(backgroundAdjustments({ backgroundImageAdjustments: { vignette: 0.3 } })).toEqual({
      vignette: 0.3,
    });
  });

  describe('duotone', () => {
    it('includes DuotoneFilter only when both duotone fields are set', () => {
      expect(getActiveImageFilters({ duotoneLow: '#000000' })).toEqual([]);
      expect(getActiveImageFilters({ duotoneHigh: '#ffffff' })).toEqual([]);
      expect(getActiveImageFilters({ duotoneLow: '', duotoneHigh: '#ffffff' })).toEqual([]);
      expect(getActiveImageFilters({ duotoneLow: null, duotoneHigh: null })).toEqual([]);
      expect(getActiveImageFilters({ duotoneLow: '#000000', duotoneHigh: '#ffffff' })).toEqual([
        DuotoneFilter,
      ]);
    });

    it('passes both colours to the node', () => {
      const attrs = imageFilterAttrs({ duotoneLow: '#102030', duotoneHigh: '#f0e0d0' });
      expect(attrs).toMatchObject({ duotoneLow: '#102030', duotoneHigh: '#f0e0d0' });
    });

    it('maps a pixel through the ramp by its luma', () => {
      const img = pixels(1, 1, 0);
      run(DuotoneFilter, { duotoneLow: '#102030', duotoneHigh: '#f0e0d0' }, img);
      expect(Array.from(img.data.slice(0, 4))).toEqual([0x10, 0x20, 0x30, 255]);
      const white = pixels(1, 1, 255);
      run(DuotoneFilter, { duotoneLow: '#102030', duotoneHigh: '#f0e0d0' }, white);
      expect(Array.from(white.data.slice(0, 4))).toEqual([0xf0, 0xe0, 0xd0, 255]);
    });

    it('the Duotone preset clears grayscale, tint and tintStrength', () => {
      const preset = IMAGE_PRESETS.find((p) => p.id === 'duotone')!;
      expect(preset).toBeDefined();
      expect(preset.values).toMatchObject({ grayscale: false, tintStrength: 0, tint: null });
      expect(preset.values.duotoneLow ?? null).toBeNull();
    });

    it('a legacy tinted image without duotone fields is unchanged', () => {
      const legacy = { tint: '#00ff00', tintStrength: 1 };
      expect(getActiveImageFilters(legacy)).toEqual([TintFilter]);
      const img = pixels(1, 1, 128);
      run(TintFilter, { tint: '#00ff00', tintStrength: 1 }, img);
      const before = Array.from(img.data);
      run(DuotoneFilter, {}, img);
      expect(Array.from(img.data)).toEqual(before);
    });

    it("duotoneLook binds both fields to the page scheme's duo roles", () => {
      const look = duotoneLook(undefined, 'dark');
      expect(look).not.toBeNull();
      expect(look!.bind).toEqual({
        duotoneLow: { ref: 'duo-low', value: look!.duotoneLow },
        duotoneHigh: { ref: 'duo-high', value: look!.duotoneHigh },
      });
      expect(look).toMatchObject({ grayscale: false, tint: null, tintStrength: 0 });
      // No scheme on the page: scheme primary.
      expect(duotoneLook(undefined, null)).toEqual(duotoneLook(undefined, 'primary'));
    });

    it('withoutDuotone clears the fields and only their bindings', () => {
      const bind: Bindings = {
        duotoneLow: { ref: 'duo-low', value: '#111111' },
        duotoneHigh: { ref: 'duo-high', value: '#eeeeee' },
        shadowColor: { ref: 'brand.accent', value: '#ffcc00' },
      };
      const cleared = withoutDuotone({ bind });
      expect(cleared).toMatchObject({ duotoneLow: null, duotoneHigh: null });
      expect(Object.keys(cleared.bind ?? {})).toEqual(['shadowColor']);
      expect(withoutDuotone({ bind: { duotoneLow: bind.duotoneLow! } }).bind).toBeUndefined();
    });

    it('a world change recolours a bound duotone image; a hand edit loses only its binding', () => {
      const brand = activeBrand();
      const look = duotoneLook(undefined, 'dark')!;
      const image = {
        id: 'i',
        duotoneLow: look.duotoneLow,
        duotoneHigh: look.duotoneHigh,
        bind: look.bind,
      };
      // The page moves to another world: the bound fields follow.
      const light = rebindPageState(
        { brandScheme: 'light', userImageInstances: [image] },
        { brand }
      );
      const moved = (light.state['userImageInstances'] as (typeof image)[])[0]!;
      const lightLook = duotoneLook(undefined, 'light')!;
      expect(moved.duotoneLow).toBe(lightLook.duotoneLow);
      expect(moved.duotoneHigh).toBe(lightLook.duotoneHigh);
      // One field was edited by hand: it keeps its value and loses only its binding.
      const edited = { ...image, duotoneHigh: '#abcdef' };
      const kept = rebindPageState(
        { brandScheme: 'light', userImageInstances: [edited] },
        { brand }
      );
      const result = (kept.state['userImageInstances'] as (typeof image)[])[0]!;
      expect(result.duotoneHigh).toBe('#abcdef');
      expect(result.bind?.duotoneHigh).toBeUndefined();
      expect(result.duotoneLow).toBe(lightLook.duotoneLow);
      expect(result.bind?.duotoneLow?.ref).toBe('duo-low');
    });
  });
});
