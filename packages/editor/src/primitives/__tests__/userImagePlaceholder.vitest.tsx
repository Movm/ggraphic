// SPDX-License-Identifier: MPL-2.0
import { createCanvas } from '@napi-rs/canvas';
import { mixColors, resolveScheme } from '@ggraphic/core';
import { render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { activeBrand } from '../../brand/brandRegistry.js';
import { CanvasStage, type CanvasStageRef } from '../CanvasStage.js';
import { UserImagePrimitive } from '../UserImagePrimitive.js';

import type { UserImageInstance } from '../../utils/userImageUtils.js';

function mockImages(outcome: 'load' | 'fail') {
  vi.spyOn(window, 'Image').mockImplementation(function () {
    const image = Object.assign(createCanvas(600, 400), {
      naturalWidth: 600,
      naturalHeight: 400,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
    });
    Object.defineProperty(image, 'src', {
      set: () => queueMicrotask(() => (outcome === 'load' ? image.onload?.() : image.onerror?.())),
    });
    return image as unknown as HTMLImageElement;
  });
}
afterEach(() => vi.restoreAllMocks());

const photo = (extra: Partial<UserImageInstance> = {}): UserImageInstance => ({
  id: 'slot',
  src: '',
  fileName: '',
  x: 50,
  y: 80,
  width: 600,
  height: 400,
  scale: 1,
  rotation: 0,
  opacity: 1,
  fit: 'cover',
  ...extra,
});

function mount(userImage: UserImageInstance, brandScheme: string | null = null) {
  const ref = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={ref} width={800} height={600} responsive={false}>
      <UserImagePrimitive
        userImage={userImage}
        brandScheme={brandScheme}
        isSelected={false}
        onSelect={() => {}}
        onDragEnd={() => {}}
        onTransformEnd={() => {}}
      />
    </CanvasStage>
  );
  return { ref, stage: ref.current!.getStage()! };
}

describe('empty photo slot', () => {
  it('draws the placeholder for an empty src, in the colours of the page scheme', async () => {
    mockImages('load');
    const { stage } = mount(photo(), 'secondary');
    await waitFor(() => expect(stage.findOne('.export-hidden')).toBeTruthy());

    const scheme = resolveScheme(activeBrand(), 'secondary')!;
    const group = stage.findOne('.export-hidden') as Konva.Group;
    const fill = group.findOne<Konva.Rect>('Rect')!;
    expect(fill.fill()).toBe(mixColors(scheme.roles.ground, scheme.roles.ink, 0.12));
    expect([fill.width(), fill.height()]).toEqual([600, 400]);
    expect(stage.findOne('.user-photo')).toBeUndefined();

    const icon = group.findOne<Konva.Group>('.placeholder-icon')!;
    expect(icon.opacity()).toBe(0.6);
    expect(
      icon.find<Konva.Shape>('Line, Circle').every((s) => s.stroke() === scheme.roles.ink2)
    ).toBe(true);
    const box = icon.getClientRect({ relativeTo: group });
    // The stroke adds a few px around the 0.18 × 400 icon box.
    expect(box.width).toBeGreaterThanOrEqual(0.18 * 400);
    expect(box.width).toBeLessThan(0.18 * 400 * 1.15);
    expect(Math.abs(box.x + box.width / 2 - 300)).toBeLessThan(3);
    expect(Math.abs(box.y + box.height / 2 - 200)).toBeLessThan(3);
    expect(group.find('Text')).toHaveLength(0);
  });

  it('falls back to the primary scheme without a page scheme', async () => {
    mockImages('load');
    const { stage } = mount(photo());
    await waitFor(() => expect(stage.findOne('.export-hidden')).toBeTruthy());
    const scheme = resolveScheme(activeBrand(), 'primary')!;
    expect(stage.findOne<Konva.Group>('.export-hidden')!.findOne<Konva.Rect>('Rect')!.fill()).toBe(
      mixColors(scheme.roles.ground, scheme.roles.ink, 0.12)
    );
  });

  it('draws the placeholder when the photo fails to load', async () => {
    mockImages('fail');
    const { stage } = mount(photo({ src: 'https://assets.test/gone.jpg' }));
    await waitFor(() => expect(stage.findOne('.export-hidden')).toBeTruthy());
    expect(stage.findOne('.user-photo')).toBeUndefined();
  });

  it('leaves a loaded photo without any placeholder', async () => {
    mockImages('load');
    const { stage } = mount(photo({ src: 'https://assets.test/photo.jpg' }));
    await waitFor(() => expect(stage.findOne('.user-photo')).toBeTruthy());
    expect(stage.findOne('.export-hidden')).toBeUndefined();
  });

  it('is hidden in an export capture and kept in a preview capture', async () => {
    mockImages('load');
    const { ref, stage } = mount(photo());
    await waitFor(() => expect(stage.findOne('.export-hidden')).toBeTruthy());
    const placeholder = stage.findOne('.export-hidden')!;
    const seen: boolean[] = [];
    vi.spyOn(Konva.Stage.prototype, 'toDataURL').mockImplementation(() => {
      seen.push(placeholder.isVisible());
      return 'data:image/png;base64,x';
    });

    ref.current!.toDataURL({ format: 'png' });
    ref.current!.toDataURL({ format: 'png', keepPlaceholders: true });

    expect(seen).toEqual([false, true]);
    expect(placeholder.isVisible()).toBe(true);
  });
});
