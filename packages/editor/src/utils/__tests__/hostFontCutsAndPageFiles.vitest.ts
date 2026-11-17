// SPDX-License-Identifier: AGPL-3.0-only
import { brandDefault, type BrandPack } from '@ggraphic/core';
import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';

import type { RunStyle } from '@ggraphic/schema';

import { registerBrandPacks } from '../../brand/brandRegistry.js';
import { registerMessages } from '../../i18n/messages.js';
import { fontMarkSupport } from '../fontMarkSupport.js';
import { runFont } from '../textUtils.js';
import { zipPageImages } from '../zipPageImages.js';

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
  fonts: {
    ...brandDefault.fonts,
    body: 'PT Sans',
    quoteEmphasis: 'Vollkorn',
    cuts: {
      'PT Sans': { bold: true, italic: true },
      Vollkorn: { bold: true, boldItalic: true },
    },
  },
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

describe('the marks a family is offered', () => {
  it('follow the cuts a registered pack declares', () => {
    registerBrandPacks([PACK]);
    expect(fontMarkSupport('PT Sans, Arial, sans-serif')).toEqual({
      bold: true,
      italic: true,
      boldItalic: false,
    });
    expect(fontMarkSupport('Vollkorn')).toEqual({ bold: true, italic: false, boldItalic: true });
  });

  it('keep the built-in table where no pack declares the family', () => {
    expect(fontMarkSupport('Fraunces')).toEqual({ bold: true, italic: true, boldItalic: true });
    expect(fontMarkSupport('Raleway')).toEqual({ bold: false, italic: false, boldItalic: false });
  });
});

describe('boldItalic', () => {
  it('is the answer runFont draws by, for every family', () => {
    registerBrandPacks([
      {
        ...PACK,
        fonts: {
          ...PACK.fonts,
          cuts: { ...PACK.fonts.cuts, 'PT Sans': { bold: true, italic: true, boldItalic: true } },
        },
      },
    ]);
    for (const family of ['Fraunces', 'PT Sans', 'Vollkorn', 'Raleway', 'Instrument Sans']) {
      const real = runFont(family, 'normal', BOLD_ITALIC, null).fontStyle === 'bold italic';
      expect(fontMarkSupport(family).boldItalic).toBe(real);
    }
    expect(fontMarkSupport('PT Sans').boldItalic).toBe(true);
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
