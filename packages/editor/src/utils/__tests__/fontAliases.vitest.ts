// SPDX-License-Identifier: MPL-2.0
import { afterEach, describe, expect, it } from 'vitest';

import { brandDefault, type BrandPack } from '@ggraphic/core';

import { registerBrandPacks } from '../../brand/brandRegistry.js';
import { pptxFont } from '../../export/pptx/pptxFonts.js';
import { styledFontSpecs } from '../../hooks/useFontLoader.js';
import { canvasFontFamilies } from '../canvasFontFamilies.js';
import { aliasFontFamily, resolveFontFamily } from '../fontAliases.js';
import { fontMarkSupport, primaryFontFamily } from '../fontMarkSupport.js';

// Saved designs and brand packs may still name the replaced families.
describe('font aliases', () => {
  it('maps the replaced families to their successors', () => {
    expect(aliasFontFamily('PT Sans')).toBe('Instrument Sans');
    expect(aliasFontFamily('Vollkorn')).toBe('Fraunces');
    expect(aliasFontFamily('Raleway')).toBe('Raleway');
  });

  it('rewrites the aliased entry of a CSS stack and keeps the fallbacks', () => {
    expect(resolveFontFamily('PT Sans, Arial, sans-serif')).toBe(
      'Instrument Sans, Arial, sans-serif'
    );
    expect(resolveFontFamily('"Vollkorn", serif')).toBe('"Fraunces", serif');
    expect(resolveFontFamily('Raleway, Arial')).toBe('Raleway, Arial');
  });

  it('resolves for marks, loading and PPTX export', () => {
    expect(primaryFontFamily('PT Sans, Arial')).toBe('Instrument Sans');
    expect(fontMarkSupport('Vollkorn')).toEqual({ bold: true, italic: true, boldItalic: true });
    expect(styledFontSpecs('PT Sans', 60)).toEqual([
      'bold 60px Instrument Sans',
      'italic 60px Instrument Sans',
    ]);
    expect(
      canvasFontFamilies({
        elements: [
          { type: 'text', fontFamily: 'PT Sans, Arial, sans-serif' },
          { type: 'text', fontFamily: 'Vollkorn' },
        ] as never,
      })
    ).toEqual(['Instrument Sans', 'Fraunces']);
    expect(pptxFont('PT Sans, Arial', true, false).fontFace).toBe('Instrument Sans');
    expect(pptxFont('Vollkorn', false, true).fontFace).toBe('Fraunces');
  });
});

// A host whose brand ships the old family keeps it: it loads that font, not the successor.
describe('font aliases with a pack that declares the old family', () => {
  const PT_SANS_PACK: BrandPack = {
    ...brandDefault,
    fonts: { ...brandDefault.fonts, body: 'PT Sans' },
  };
  const VOLLKORN_FACE_PACK: BrandPack = {
    ...brandDefault,
    fontFaces: [{ family: 'Vollkorn', src: '/fonts/vollkorn.woff2', style: 'italic' }],
  };

  afterEach(() => registerBrandPacks([brandDefault]));

  it('keeps a family a registered pack names or ships', () => {
    registerBrandPacks([brandDefault, PT_SANS_PACK, VOLLKORN_FACE_PACK]);
    expect(aliasFontFamily('PT Sans')).toBe('PT Sans');
    expect(resolveFontFamily('"Vollkorn", serif')).toBe('"Vollkorn", serif');
    expect(styledFontSpecs('PT Sans', 60)).toEqual(['bold 60px PT Sans', 'italic 60px PT Sans']);
    expect(pptxFont('Vollkorn', false, true).fontFace).toBe('Vollkorn');
  });

  it('aliases again once the pack is no longer registered', () => {
    registerBrandPacks([PT_SANS_PACK]);
    expect(aliasFontFamily('PT Sans')).toBe('PT Sans');
    registerBrandPacks([brandDefault]);
    expect(aliasFontFamily('PT Sans')).toBe('Instrument Sans');
  });
});
