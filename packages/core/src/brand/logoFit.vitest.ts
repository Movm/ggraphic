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
});
