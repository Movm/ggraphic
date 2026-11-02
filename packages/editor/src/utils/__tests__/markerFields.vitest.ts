// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { brandDefault, rebindPageState } from '@ggraphic/core';

import { BINDABLE_FIELDS } from '../../brand/bindableFields.js';
import { effectiveAccent, effectiveMarker } from '../textUtils.js';

describe('effectiveMarker', () => {
  it('builds a plate from the flat fields', () => {
    expect(effectiveMarker({ markerFill: '#D4146E', markerColor: '#FFFFFF' })).toEqual({
      fill: '#D4146E',
      color: '#FFFFFF',
      padX: 0.18,
      padY: 0.04,
    });
  });

  it('lets a flat field beat the nested one and keeps the rest of it', () => {
    expect(
      effectiveMarker({
        marker: { fill: '#111111', color: '#222222', padX: 0.3, padY: 0.12 },
        markerFill: '#D4146E',
      })
    ).toEqual({ fill: '#D4146E', color: '#222222', padX: 0.3, padY: 0.12 });
  });

  it('returns the nested marker untouched when no flat field is set (RF1)', () => {
    const marker = { fill: '#111111', color: '#222222' };
    expect(effectiveMarker({ marker })).toBe(marker);
    expect(effectiveMarker({})).toBeUndefined();
    expect(effectiveMarker({ marker: null })).toBeUndefined();
  });
});

describe('effectiveAccent', () => {
  it('lets accentFill beat the nested fill and keeps the face', () => {
    expect(
      effectiveAccent({
        accent: { fill: '#111111', fontFamily: 'Fraunces', fontStyle: 'italic' },
        accentFill: '#FFD400',
      })
    ).toEqual({ fill: '#FFD400', fontFamily: 'Fraunces', fontStyle: 'italic' });
    expect(effectiveAccent({ accentFill: '#FFD400' })).toEqual({ fill: '#FFD400' });
  });

  it('returns the nested accent untouched without the flat field (RF1)', () => {
    const accent = { fill: '#111111' };
    expect(effectiveAccent({ accent })).toBe(accent);
    expect(effectiveAccent({})).toBeUndefined();
  });
});

describe('bindable', () => {
  it('lists the flat fields', () => {
    expect(BINDABLE_FIELDS['additionalTexts']).toEqual(
      expect.arrayContaining(['markerFill', 'markerColor', 'accentFill'])
    );
  });

  it('RF3: rebinding markerFill changes the drawn plate colour', () => {
    const text = {
      markerFill: '#000001',
      markerColor: '#FFFFFF',
      bind: { markerFill: { ref: 'brand.primary', value: '#000001' } },
    };
    const state = { additionalTexts: [text] };
    const next = rebindPageState(state, { brand: brandDefault }).state;
    const out = (next['additionalTexts'] as (typeof text)[])[0]!;
    const primary = brandDefault.colors.primary.toLowerCase();
    expect(out.markerFill).toBe(primary);
    expect(effectiveMarker(out)?.fill).toBe(primary);
    expect(effectiveMarker(text)?.fill).toBe('#000001');
  });
});
