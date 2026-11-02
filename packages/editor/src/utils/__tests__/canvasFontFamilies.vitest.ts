// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from 'vitest';

import { canvasFontFamilies } from '../canvasFontFamilies.js';

import type { FullCanvasConfig } from '../../configs/types.js';

type FontInput = Pick<FullCanvasConfig, 'fonts' | 'elements'>;

describe('canvasFontFamilies', () => {
  it('sammelt die Primärschrift und die Schrift jedes Textelements, ohne Fallback-Stack und doppelt', () => {
    const config = {
      fonts: { primary: 'FixtureSans', fontSize: 60 },
      elements: [
        { type: 'text', fontFamily: 'Instrument Sans, Arial, sans-serif' },
        { type: 'text', fontFamily: 'FixtureSans, Arial, sans-serif' },
        { type: 'image' },
      ],
    } as unknown as FontInput;

    expect(canvasFontFamilies(config)).toEqual(['FixtureSans', 'Instrument Sans']);
  });

  it('kommt ohne `fonts` aus', () => {
    const config = {
      elements: [{ type: 'text', fontFamily: 'Instrument Sans' }],
    } as unknown as FontInput;

    expect(canvasFontFamilies(config)).toEqual(['Instrument Sans']);
  });
});
