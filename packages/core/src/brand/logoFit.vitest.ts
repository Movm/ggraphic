// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { fitLogoBox } from './logoFit.js';

const page = { width: 1080, height: 1350 };

describe('fitLogoBox', () => {
  it('a wider logo keeps the bottom-right corner', () => {
    const box = { x: 900, y: 1200, width: 120, height: 80 };
    expect(fitLogoBox(box, { width: 400, height: 100 }, page)).toEqual({
      x: 900,
      y: 1250,
      width: 120,
      height: 30,
    });
  });

  it('a logo in the top-left keeps its top-left corner', () => {
    const box = { x: 40, y: 40, width: 120, height: 80 };
    expect(fitLogoBox(box, { width: 100, height: 100 }, page)).toEqual({
      x: 40,
      y: 40,
      width: 80,
      height: 80,
    });
  });

  it('a tall logo is contained by the box height', () => {
    const box = { x: 40, y: 40, width: 120, height: 80 };
    expect(fitLogoBox(box, { width: 50, height: 100 }, page)).toEqual({
      x: 40,
      y: 40,
      width: 40,
      height: 80,
    });
  });

  it('keeps the top-right corner', () => {
    const box = { x: 900, y: 40, width: 120, height: 80 };
    expect(fitLogoBox(box, { width: 400, height: 100 }, page)).toEqual({
      x: 900,
      y: 40,
      width: 120,
      height: 30,
    });
  });

  it('keeps the bottom-left corner', () => {
    const box = { x: 40, y: 1200, width: 120, height: 80 };
    expect(fitLogoBox(box, { width: 100, height: 100 }, page)).toEqual({
      x: 40,
      y: 1200,
      width: 80,
      height: 80,
    });
  });

  it('floors so the result stays strictly inside the box', () => {
    const box = { x: 900, y: 1200, width: 100, height: 100 };
    const r = fitLogoBox(box, { width: 300, height: 100 }, page);
    expect(r).toEqual({ x: 900, y: 1267, width: 100, height: 33 });
  });

  it('returns the box unchanged for a degenerate size or box', () => {
    const box = { x: 900, y: 1200, width: 120, height: 80 };
    expect(fitLogoBox(box, { width: 0, height: 0 }, page)).toBe(box);
    expect(fitLogoBox(box, { width: Infinity, height: 10 }, page)).toBe(box);
    const flat = { ...box, width: 0 };
    expect(fitLogoBox(flat, { width: 10, height: 10 }, page)).toBe(flat);
  });
});
