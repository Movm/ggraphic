// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { FONT_FAMILY_ALIASES, type BrandFontFace } from '@ggraphic/core';
import { describe, expect, it, vi } from 'vitest';

import {
  embeddingOf,
  parseUnicodeRange,
  resolveFontFiles,
  subsetTag,
  SYNTHETIC_ITALIC_SLANT,
  type FontFile,
  type FontFileSet,
  type FontSourceDeps,
} from './fontFiles.js';

import type { CanvasExportFontService } from '../../hostServices.js';
import type { FontSpec } from '../scene/types.js';

const FAMILY = 'Instrument Sans';
const fontsourceDir = path.dirname(
  createRequire(import.meta.url).resolve('@fontsource/instrument-sans/package.json')
);
const fontsourceFile = (name: string) =>
  new Uint8Array(readFileSync(path.join(fontsourceDir, 'files', `${name}.woff2`)));

const LATIN = fontsourceFile('instrument-sans-latin-400-normal');
const VARIABLE = new Uint8Array(
  readFileSync(
    path.join(
      path.dirname(
        createRequire(import.meta.url).resolve(
          '@fontsource-variable/bricolage-grotesque/package.json'
        )
      ),
      'files',
      'bricolage-grotesque-latin-wght-normal.woff2'
    )
  )
);
const LATIN_EXT = fontsourceFile('instrument-sans-latin-ext-400-normal');

/** The `@font-face` blocks of a fontsource stylesheet, as the `CSSFontFaceRule` surface the resolver reads. */
function fontsourceRules(sheet: string) {
  const css = readFileSync(path.join(fontsourceDir, sheet), 'utf8');
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((block) => {
    const declarations = new Map<string, string>();
    for (const line of block[1]!.split(';')) {
      const colon = line.indexOf(':');
      if (colon > 0) declarations.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
    }
    return { style: { getPropertyValue: (name: string) => declarations.get(name) ?? '' } };
  });
}

function rule(declarations: Record<string, string>) {
  return { style: { getPropertyValue: (name: string) => declarations[name] ?? '' } };
}

const face = (overrides: Partial<FontSpec> = {}): FontSpec => ({
  family: FAMILY,
  weight: 400,
  style: 'normal',
  size: 16,
  ...overrides,
});

/** A fetcher that answers every url with `bytes` and records what was asked for. */
function recordingFetch(bytes: Uint8Array = LATIN) {
  const urls: string[] = [];
  const fetchBytes = async (url: string) => {
    urls.push(url);
    return bytes;
  };
  return { urls, fetchBytes };
}

const brand = (src: string, weight?: number, style?: 'normal' | 'italic', family = FAMILY) =>
  ({ family, src, weight, style }) satisfies BrandFontFace;

describe('resolveFontFiles: sources', () => {
  it('host service wins over brand faces and css', async () => {
    const load = vi.fn<CanvasExportFontService['load']>(async () => LATIN);
    const { urls, fetchBytes } = recordingFetch(LATIN_EXT);
    const set = await resolveFontFiles(face(), {
      host: { load },
      brandFaces: [brand('brand-400.woff2', 400)],
      cssRules: () => [
        rule({ 'font-family': `'${FAMILY}'`, src: 'url(css-400.woff2) format("woff2")' }),
      ],
      fetchBytes,
    });
    expect(load).toHaveBeenCalledWith({ family: FAMILY, weight: 400, style: 'normal' });
    expect(urls).toEqual([]);
    expect(set.files).toHaveLength(1);
    expect(set.files[0]!.bytes).toBe(LATIN);
    expect(set.files[0]!.ranges).toBeNull();
  });

  it('falls through to brand faces, then css, when the host has no file', async () => {
    const host = { load: async () => null };
    const first = recordingFetch();
    await resolveFontFiles(face(), {
      host,
      brandFaces: [brand('brand-400.woff2', 400)],
      cssRules: () => [rule({ 'font-family': FAMILY, src: 'url(css-400.woff2)' })],
      fetchBytes: first.fetchBytes,
    });
    expect(first.urls).toEqual(['brand-400.woff2']);

    const second = recordingFetch();
    await resolveFontFiles(face(), {
      host,
      brandFaces: [brand('other.woff2', 400, 'normal', 'Other')],
      cssRules: () => [rule({ 'font-family': FAMILY, src: 'url(css-400.woff2)' })],
      fetchBytes: second.fetchBytes,
    });
    expect(second.urls).toEqual(['css-400.woff2']);
  });

  it('yields an empty set when nothing is found, and skips bytes fontkit cannot read', async () => {
    const none = await resolveFontFiles(face(), { fetchBytes: async () => null });
    expect(none.files).toEqual([]);
    expect(none.fileFor(0x41)).toBeNull();

    const garbage = await resolveFontFiles(face(), {
      brandFaces: [brand('a.woff2', 400)],
      fetchBytes: async () => new Uint8Array([1, 2, 3, 4]),
    });
    expect(garbage.files).toEqual([]);
  });

  it('a failing download is a missing font, not a failed export', async () => {
    const set = await resolveFontFiles(face(), {
      brandFaces: [brand('a.woff2', 400)],
      fetchBytes: async () => {
        throw new TypeError('network down');
      },
    });
    expect(set.files).toEqual([]);
  });

  it.each([
    ['rejects', async () => Promise.reject(new Error('font server down'))],
    [
      'throws before it returns a promise',
      () => {
        throw new Error('not configured');
      },
    ],
  ])(
    'a host service that %s is a missing font: the brand faces are asked next',
    async (_how, load) => {
      const { urls, fetchBytes } = recordingFetch();

      const set = await resolveFontFiles(face(), {
        host: { load: load as CanvasExportFontService['load'] },
        brandFaces: [brand('brand-400.woff2', 400)],
        fetchBytes,
      });

      expect(urls).toEqual(['brand-400.woff2']);
      expect(set.files).toHaveLength(1);
    }
  );

  it('a host service that throws leaves an empty set when no other source has the face', async () => {
    const set = await resolveFontFiles(face(), {
      host: { load: async () => Promise.reject(new Error('font server down')) },
      fetchBytes: async () => null,
    });

    expect(set.files).toEqual([]);
  });

  it('applies font aliases first', async () => {
    const [from, to] = Object.entries(FONT_FAMILY_ALIASES)[0]!;
    const load = vi.fn<CanvasExportFontService['load']>(async () => null);
    const { urls, fetchBytes } = recordingFetch();
    await resolveFontFiles(face({ family: from }), {
      host: { load },
      cssRules: () => [rule({ 'font-family': `"${to}"`, src: 'url(aliased.woff2)' })],
      fetchBytes,
    });
    expect(load).toHaveBeenCalledWith({ family: to, weight: 400, style: 'normal' });
    expect(urls).toEqual(['aliased.woff2']);
  });
});

describe('resolveFontFiles: brand faces', () => {
  const faces = [
    brand('w300.woff2', 300),
    brand('w400.woff2'), // weight defaults to 400
    brand('w700.woff2', 700),
    brand('w400i.woff2', 400, 'italic'),
  ];
  const pick = async (weight: number, style: 'normal' | 'italic' = 'normal') => {
    const { urls, fetchBytes } = recordingFetch();
    await resolveFontFiles(face({ weight, style }), { brandFaces: faces, fetchBytes });
    return urls;
  };

  it('matches weight and style exactly', async () => {
    expect(await pick(700)).toEqual(['w700.woff2']);
    expect(await pick(400)).toEqual(['w400.woff2']);
    expect(await pick(400, 'italic')).toEqual(['w400i.woff2']);
  });

  it('takes the nearest weight when the exact one is missing: lighter first up to 500, heavier first above', async () => {
    expect(await pick(500)).toEqual(['w400.woff2']);
    expect(await pick(200)).toEqual(['w300.woff2']);
    expect(await pick(600)).toEqual(['w700.woff2']);
    expect(await pick(900)).toEqual(['w700.woff2']);
    // Nothing heavier than 700 and nothing lighter than 300 to prefer: fall back to the other side.
    const onlyLight = [brand('a.woff2', 300), brand('b.woff2', 200)];
    const { urls, fetchBytes } = recordingFetch();
    await resolveFontFiles(face({ weight: 800 }), { brandFaces: onlyLight, fetchBytes });
    expect(urls).toEqual(['a.woff2']);
  });

  it('follows the CSS rule between 400 and 500: heavier up to 500 before lighter', async () => {
    const around = [brand('light.woff2', 300), brand('medium.woff2', 500)];
    const { urls, fetchBytes } = recordingFetch();
    await resolveFontFiles(face({ weight: 400 }), { brandFaces: around, fetchBytes });
    expect(urls).toEqual(['medium.woff2']);
  });

  it('never trades a style for a weight: a real italic of another weight beats the upright cut', async () => {
    const { urls, fetchBytes } = recordingFetch();
    const set = await resolveFontFiles(face({ weight: 700, style: 'italic' }), {
      brandFaces: [brand('w700.woff2', 700), brand('w400i.woff2', 400, 'italic')],
      fetchBytes,
    });
    expect(urls).toEqual(['w400i.woff2']);
    expect(set.files.map((file) => file.slant)).toEqual([0]);
  });

  it('an italic nobody ships is the upright cut of the weight, flagged to be slanted like a browser does', async () => {
    const { urls, fetchBytes } = recordingFetch();
    const set = await resolveFontFiles(face({ weight: 700, style: 'italic' }), {
      brandFaces: [brand('w400.woff2', 400), brand('w700.woff2', 700)],
      fetchBytes,
    });
    expect(urls).toEqual(['w700.woff2']);
    expect(set.files).toHaveLength(1);
    expect(set.files[0]!.slant).toBe(SYNTHETIC_ITALIC_SLANT);
    expect(SYNTHETIC_ITALIC_SLANT).toBe(0.25);
    // The upright request is not slanted, and an unshipped family stays missing, not slanted.
    const upright = await resolveFontFiles(face({ weight: 700 }), {
      brandFaces: [brand('w700.woff2', 700)],
      fetchBytes,
    });
    expect(upright.files.map((file) => file.slant)).toEqual([0]);
    const none = await resolveFontFiles(face({ family: 'Nobody', style: 'italic' }), {
      brandFaces: [brand('w700.woff2', 700)],
      fetchBytes,
    });
    expect(none.files).toEqual([]);
  });

  it('a bold asked for and a lighter cut served is flagged to be emboldened, a real bold is not', async () => {
    const { fetchBytes } = recordingFetch();
    const regularOnly = await resolveFontFiles(face({ weight: 700 }), {
      brandFaces: [brand('w400.woff2', 400)],
      fetchBytes,
    });
    expect(regularOnly.files.map((file) => file.fakeBold)).toEqual([true]);
    const realBold = await resolveFontFiles(face({ weight: 700 }), {
      brandFaces: [brand('w400.woff2', 400), brand('w700.woff2', 700)],
      fetchBytes,
    });
    expect(realBold.files.map((file) => file.fakeBold)).toEqual([false]);
    const regular = await resolveFontFiles(face({ weight: 400 }), {
      brandFaces: [brand('w400.woff2', 400)],
      fetchBytes,
    });
    expect(regular.files.map((file) => file.fakeBold)).toEqual([false]);
    // 600 is bold, 500 is not.
    const semi = await resolveFontFiles(face({ weight: 600 }), {
      brandFaces: [brand('w400.woff2', 400)],
      fetchBytes,
    });
    expect(semi.files.map((file) => file.fakeBold)).toEqual([true]);
    const medium = await resolveFontFiles(face({ weight: 500 }), {
      brandFaces: [brand('w400.woff2', 400)],
      fetchBytes,
    });
    expect(medium.files.map((file) => file.fakeBold)).toEqual([false]);
  });

  it('the bold family of boldFamilies is a real bold, and the faux italic and bold combine', async () => {
    const { fetchBytes } = recordingFetch();
    const real = await resolveFontFiles(face({ family: 'Foo', weight: 700 }), {
      brandFaces: [
        brand('regular.woff2', 400, 'normal', 'Foo'),
        brand('bold.woff2', 400, 'normal', 'Foo Bold'),
      ],
      boldFamilies: { Foo: 'Foo Bold' },
      fetchBytes,
    });
    expect(real.files.map((file) => file.fakeBold)).toEqual([false]);
    const both = await resolveFontFiles(face({ weight: 700, style: 'italic' }), {
      brandFaces: [brand('w400.woff2', 400)],
      fetchBytes,
    });
    expect(both.files.map((file) => [file.slant, file.fakeBold])).toEqual([[0.25, true]]);
  });

  describe('a variable font file (wght 200..800, default 800)', () => {
    const brandFaces = [{ family: 'Bricolage Grotesque', src: 'variable.woff2' }];
    const ask = (weight: number) =>
      resolveFontFiles(face({ family: 'Bricolage Grotesque', weight }), {
        brandFaces,
        fetchBytes: async () => VARIABLE,
      });

    it('is at its default instance for the default weight, and says so where it cannot do better', async () => {
      expect((await ask(800)).files.map((file) => file.variation)).toEqual(['none']);
      // A WOFF2 cannot be instanced by fontkit: the default instance is drawn, and flagged.
      expect((await ask(400)).files.map((file) => file.variation)).toEqual(['default-only']);
      expect(
        (
          await resolveFontFiles(face(), {
            brandFaces: [brand('w.woff2', 400)],
            fetchBytes: async () => LATIN,
          })
        ).files.map((file) => file.variation)
      ).toEqual(['none']);
    });

    it('is never emboldened: its axis covers the weight, whatever the face declares', async () => {
      expect((await ask(700)).files.map((file) => file.fakeBold)).toEqual([false]);
    });
  });

  it('asks the host for the italic first, then for the upright cut it slants', async () => {
    const load = vi.fn<CanvasExportFontService['load']>(async (wanted) =>
      wanted.style === 'normal' ? LATIN : null
    );
    const set = await resolveFontFiles(face({ weight: 700, style: 'italic' }), { host: { load } });
    expect(load.mock.calls.map(([wanted]) => wanted.style)).toEqual(['italic', 'normal']);
    expect(set.files.map((file) => file.slant)).toEqual([SYNTHETIC_ITALIC_SLANT]);
  });

  it('boldFamilies: weight >= 600 tries the bold family at 400 first', async () => {
    const brandFaces = [
      brand('regular.woff2', 400, 'normal', 'Foo'),
      brand('bold-family.woff2', 400, 'normal', 'Foo Bold'),
    ];
    const boldFamilies = { Foo: 'Foo Bold' };
    const run = async (weight: number, faces: BrandFontFace[] = brandFaces) => {
      const { urls, fetchBytes } = recordingFetch();
      await resolveFontFiles(face({ family: 'Foo', weight }), {
        brandFaces: faces,
        boldFamilies,
        fetchBytes,
      });
      return urls;
    };
    expect(await run(700)).toEqual(['bold-family.woff2']);
    expect(await run(600)).toEqual(['bold-family.woff2']);
    expect(await run(500)).toEqual(['regular.woff2']);
    expect(await run(400)).toEqual(['regular.woff2']);
    // The bold family has no file: the family itself answers.
    expect(await run(700, [brandFaces[0]!])).toEqual(['regular.woff2']);
  });

  it('boldFamilies is also consulted for the host service', async () => {
    const load = vi.fn<CanvasExportFontService['load']>(async ({ family }) =>
      family === 'Foo Bold' ? LATIN : null
    );
    const set = await resolveFontFiles(face({ family: 'Foo', weight: 700 }), {
      host: { load },
      boldFamilies: { Foo: 'Foo Bold' },
    });
    expect(load).toHaveBeenNthCalledWith(1, { family: 'Foo Bold', weight: 400, style: 'normal' });
    expect(set.files).toHaveLength(1);
  });
});

describe('resolveFontFiles: css @font-face', () => {
  const rules = fontsourceRules('400.css');

  it('yields one file per unicode-range, and fileFor picks by range', async () => {
    const { urls, fetchBytes: record } = recordingFetch();
    const fetchBytes = async (url: string) => {
      await record(url);
      return url.includes('latin-ext') ? LATIN_EXT : LATIN;
    };
    const set = await resolveFontFiles(face(), { cssRules: () => rules, fetchBytes });

    expect(rules).toHaveLength(2);
    // The first url of a format fontkit reads: the woff2, never the woff after it.
    expect(urls).toEqual([
      './files/instrument-sans-latin-ext-400-normal.woff2',
      './files/instrument-sans-latin-400-normal.woff2',
    ]);
    expect(set.files).toHaveLength(2);
    const [ext, latin] = set.files as [FontFile, FontFile];
    expect(ext.bytes).toBe(LATIN_EXT);
    expect(latin.bytes).toBe(LATIN);
    expect(ext.ranges).toEqual(
      parseUnicodeRange(rules[0]!.style.getPropertyValue('unicode-range'))
    );
    expect(set.fileFor(0x0110 /* Đ */)).toBe(ext);
    expect(set.fileFor(0x0041)).toBe(latin);
    expect(set.fileFor(0x2192 /* → */)).toBeNull();
  });

  it('a code point is covered only if the declared range and the font both say so', async () => {
    // Latin-ext's range claims U+0100-02BA, the latin file has no Đ: a range alone is not coverage.
    const set = await resolveFontFiles(face(), {
      cssRules: () => [rules[0]!],
      fetchBytes: async () => LATIN,
    });
    expect(set.files).toHaveLength(1);
    expect(set.fileFor(0x0110)).toBeNull(); // in range, but the bytes are the latin file
    expect(set.fileFor(0x0041)).toBeNull(); // glyph present, but outside the declared range
  });

  it('a later rule wins where ranges overlap, like in the browser', async () => {
    // U+0304 is declared by both fontsource files.
    const set = await resolveFontFiles(face(), {
      cssRules: () => rules,
      fetchBytes: async (url) => (url.includes('latin-ext') ? LATIN_EXT : LATIN),
    });
    const file = set.fileFor(0x0304);
    expect(file).toBe(set.files[1]);
  });

  it('matches css weight and style descriptors, and weight ranges', async () => {
    const css = [
      rule({ 'font-family': FAMILY, 'font-weight': '400', src: 'url(r.woff2)' }),
      rule({ 'font-family': FAMILY, 'font-weight': 'bold', src: 'url(b.woff2)' }),
      rule({
        'font-family': FAMILY,
        'font-weight': '400',
        'font-style': 'italic',
        src: 'url(i.woff2)',
      }),
      rule({ 'font-family': 'Other', 'font-weight': '700', src: 'url(o.woff2)' }),
    ];
    const urlsFor = async (spec: Partial<FontSpec>) => {
      const { urls, fetchBytes } = recordingFetch();
      await resolveFontFiles(face(spec), { cssRules: () => css, fetchBytes });
      return urls;
    };
    expect(await urlsFor({ weight: 700 })).toEqual(['b.woff2']);
    expect(await urlsFor({ weight: 400 })).toEqual(['r.woff2']);
    expect(await urlsFor({ style: 'italic' })).toEqual(['i.woff2']);

    const variable = [
      rule({ 'font-family': FAMILY, 'font-weight': '100 900', src: 'url(v.woff2)' }),
    ];
    const { urls, fetchBytes } = recordingFetch();
    await resolveFontFiles(face({ weight: 650 }), { cssRules: () => variable, fetchBytes });
    expect(urls).toEqual(['v.woff2']);
  });

  it('src: skips local() and formats fontkit does not read, falls back to the next url, and handles data urls', async () => {
    const css = [
      rule({
        'font-family': FAMILY,
        src: 'local("Foo"), url(old.eot) format("embedded-opentype"), url("a b.woff2") format(\'woff2\'), url(c.woff) format("woff")',
      }),
    ];
    const urls: string[] = [];
    await resolveFontFiles(face(), {
      cssRules: () => css,
      fetchBytes: async (url) => {
        urls.push(url);
        return url === 'a b.woff2' ? null : LATIN; // the first readable url fails to load
      },
    });
    expect(urls).toEqual(['a b.woff2', 'c.woff']);

    const data = [
      rule({ 'font-family': FAMILY, src: 'url(data:font/woff2;base64,AAAA) format("woff2")' }),
    ];
    const { urls: dataUrls, fetchBytes } = recordingFetch();
    await resolveFontFiles(face(), { cssRules: () => data, fetchBytes });
    expect(dataUrls).toEqual(['data:font/woff2;base64,AAAA']);
  });

  it('a unicode-range that parses to nothing is ignored, like an invalid descriptor', async () => {
    const css = [rule({ 'font-family': FAMILY, src: 'url(a.woff2)', 'unicode-range': 'nonsense' })];
    const set = await resolveFontFiles(face(), {
      cssRules: () => css,
      fetchBytes: async () => LATIN,
    });
    expect(set.files[0]!.ranges).toBeNull();
  });

  it('defaults to no rules without a document', async () => {
    const set = await resolveFontFiles(face(), { fetchBytes: async () => LATIN });
    expect(set.files).toEqual([]);
  });
});

describe('resolveFontFiles: cache', () => {
  it('shares the files between sizes through the caller-provided cache and keeps the face asked for', async () => {
    const cache: NonNullable<FontSourceDeps['cache']> = new Map();
    const { urls, fetchBytes } = recordingFetch();
    const deps = { brandFaces: [brand('a.woff2', 400)], fetchBytes, cache };
    const a: FontFileSet = await resolveFontFiles(face({ size: 12 }), deps);
    const b: FontFileSet = await resolveFontFiles(face({ size: 40 }), deps);
    expect(urls).toEqual(['a.woff2']);
    expect(a.files[0]).toBe(b.files[0]);
    expect(a.face.size).toBe(12);
    expect(b.face.size).toBe(40);
    expect([...cache.keys()]).toEqual([`${FAMILY}|400|normal`]);
  });

  it('keeps nothing without one', async () => {
    const { urls, fetchBytes } = recordingFetch();
    const deps = { brandFaces: [brand('a.woff2', 400)], fetchBytes };
    await resolveFontFiles(face(), deps);
    await resolveFontFiles(face(), deps);
    expect(urls).toEqual(['a.woff2', 'a.woff2']);
  });
});

describe('embedding permission', () => {
  it('fsType 2 is outlines-only, 0x200 bitmap-only, 0 yes', () => {
    expect(embeddingOf(0)).toBe('yes');
    expect(embeddingOf(0x0002)).toBe('outlines-only');
    expect(embeddingOf(0x0200)).toBe('bitmap-only');
    // Preview and print, editable and no-subsetting still allow embedding.
    expect(embeddingOf(0x0004)).toBe('yes');
    expect(embeddingOf(0x0008)).toBe('yes');
    expect(embeddingOf(0x0100)).toBe('yes');
    // The more restrictive reading wins when both are set.
    expect(embeddingOf(0x0202)).toBe('bitmap-only');
  });

  it('reads the flag object fontkit decodes the field into', () => {
    expect(embeddingOf({ noEmbedding: true })).toBe('outlines-only');
    expect(embeddingOf({ noEmbedding: false, bitmapOnly: true })).toBe('bitmap-only');
    expect(embeddingOf({ viewOnly: true, editable: false })).toBe('yes');
  });

  it('is read from the font file', async () => {
    const set = await resolveFontFiles(face(), {
      brandFaces: [brand('a.woff2', 400)],
      fetchBytes: async () => LATIN,
    });
    expect(set.files[0]!.embeddable).toBe('yes'); // Instrument Sans is OFL
  });
});

describe('parseUnicodeRange', () => {
  it('reads singles, ranges and wildcards, in order', () => {
    expect(parseUnicodeRange('U+0131, U+0152-0153,U+25??, u+10ffff')).toEqual([
      [0x131, 0x131],
      [0x152, 0x153],
      [0x2500, 0x25ff],
      [0x10ffff, 0x10ffff],
    ]);
  });

  it('reads the real fontsource declaration', () => {
    const value = fontsourceRules('400.css')[1]!.style.getPropertyValue('unicode-range');
    const ranges = parseUnicodeRange(value);
    expect(ranges.length).toBe(value.split(',').length);
    expect(ranges[0]).toEqual([0x0000, 0x00ff]);
    expect(ranges.at(-1)).toEqual([0xfffd, 0xfffd]);
  });

  it('drops what is not a range', () => {
    expect(parseUnicodeRange('')).toEqual([]);
    expect(parseUnicodeRange('nonsense, U+ZZ, U+0100-00FF, U+110000, U+4??-5, U+41')).toEqual([
      [0x41, 0x41],
    ]);
  });
});

describe('subsetTag', () => {
  it('is six uppercase letters, deterministic, and differs between faces and file indexes', () => {
    const regular = face();
    const bold = face({ weight: 700 });
    const tag = subsetTag(regular, 0);
    expect(tag).toMatch(/^[A-Z]{6}$/);
    expect(subsetTag(regular, 0)).toBe(tag);
    expect(subsetTag(face({ size: 99 }), 0)).toBe(tag); // the size is no part of the face
    expect(subsetTag(bold, 0)).not.toBe(tag);
    expect(subsetTag(face({ style: 'italic' }), 0)).not.toBe(tag);
    expect(subsetTag(face({ family: 'Other' }), 0)).not.toBe(tag);
    expect(subsetTag(regular, 1)).not.toBe(tag);
  });
});
