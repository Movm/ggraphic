// SPDX-License-Identifier: AGPL-3.0-only
import Konva from 'konva';
import { describe, expect, it } from 'vitest';

import { beginFilteredPan } from './filteredPan.js';

function photoNode() {
  const photo = { width: 400, height: 800 } as unknown as HTMLImageElement;
  const node = new Konva.Image({ image: photo, crop: { x: 0, y: 200, width: 400, height: 400 } });
  node.filters([Konva.Filters.Grayscale]);
  return { node, photo };
}

describe('beginFilteredPan', () => {
  it('pans the filtered copy without filters, its crop scaled to the copy', () => {
    const { node } = photoNode();
    const source = { width: 200, height: 400 } as unknown as HTMLCanvasElement;
    const pan = beginFilteredPan(node, source, 400)!;
    expect(node.image()).toBe(source);
    expect(node.filters()).toEqual([]);
    expect(node.crop()).toEqual({ x: 0, y: 100, width: 200, height: 200 });
    pan.crop({ x: 0, y: 300, width: 400, height: 400 });
    expect(node.crop()).toEqual({ x: 0, y: 150, width: 200, height: 200 });
  });

  it('puts the photo, its filters and the crop in photo pixels back on end', () => {
    const { node, photo } = photoNode();
    const source = { width: 200, height: 400 } as unknown as HTMLCanvasElement;
    const pan = beginFilteredPan(node, source, 400)!;
    pan.crop({ x: 0, y: 300, width: 400, height: 400 });
    pan.end();
    expect(node.image()).toBe(photo);
    expect(node.filters()).toEqual([Konva.Filters.Grayscale]);
    expect(node.crop()).toEqual({ x: 0, y: 300, width: 400, height: 400 });
  });

  it('does nothing when the source is the photo itself', () => {
    const { node, photo } = photoNode();
    expect(beginFilteredPan(node, photo, 400)).toBeNull();
    expect(node.filters()).toEqual([Konva.Filters.Grayscale]);
  });
});
