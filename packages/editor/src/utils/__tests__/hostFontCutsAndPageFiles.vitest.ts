// SPDX-License-Identifier: MPL-2.0
import { brandDefault, type BrandPack } from '@ggraphic/core';
import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';

import type { RunStyle } from '@ggraphic/schema';

import { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { registerMessages } from '@ggraphic/editor/i18n/messages';
import { runFont } from '@ggraphic/editor/utils/textUtils';
import { zipPageImages } from '@ggraphic/editor/utils/zipPageImages';

// A host whose emphasis family ships a real Black Italic and loads it itself.
const BOLD_ITALIC: RunStyle = {
  bold: true,
  italic: true,
  underline: false,
  accent: false,
  marker: false,
};

const PACK: BrandPack = {
  ...brandDefault,
  fonts: { ...brandDefault.fonts, quoteEmphasis: 'Vollkorn', boldItalicFamilies: ['Vollkorn'] },
};

afterEach(() => {
  registerBrandPacks([brandDefault]);
  registerMessages('de');
});

describe('a bold italic run', () => {
  it('keeps the real cut of a family a registered pack declares', () => {
    registerBrandPacks([PACK]);
    expect(runFont('Vollkorn', 'normal', BOLD_ITALIC, null)).toEqual({
      fontFamily: 'Vollkorn',
      fontStyle: 'bold italic',
    });
  });

  it('draws italic for a family nobody declares', () => {
    expect(runFont('Raleway', 'normal', BOLD_ITALIC, null).fontStyle).toBe('italic');
  });

  it('keeps the built-in real cut', () => {
    expect(runFont('Fraunces', 'normal', BOLD_ITALIC, null).fontStyle).toBe('bold italic');
  });
});

describe('exported page files', () => {
  const png = `data:image/png;base64,${btoa('x')}`;
  const names = async () =>
    Object.keys(unzipSync(new Uint8Array(await zipPageImages([png]).arrayBuffer())));

  it('take the page word from the catalogue', async () => {
    expect(await names()).toEqual(['seite-1.png']);
    registerMessages('en');
    expect(await names()).toEqual(['page-1.png']);
  });
});
