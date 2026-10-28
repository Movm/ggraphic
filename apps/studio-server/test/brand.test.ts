// SPDX-License-Identifier: AGPL-3.0-only
import { brandDefault } from '@ggraphic/core';
import { describe, expect, it } from 'vitest';
import {
  detectFontType,
  detectLogoType,
  parseAssetName,
  randomAssetName,
} from '../src/brand/assets.ts';
import { brandPackSchema } from '../src/brand/brandPackSchema.ts';
import { buildBrandPack } from '../src/brand/build.ts';
import { brandSettingsBody, fontUploadFields } from '../src/contract.ts';
import { BRAND_SETTINGS as SETTINGS, PNG_1X1 } from './helpers.ts';

const ascii = (s: string) => Buffer.from(s, 'latin1');

describe('brand asset types', () => {
  it.each([
    ['woff2', Buffer.concat([ascii('wOF2'), Buffer.alloc(20)])],
    ['otf', Buffer.concat([ascii('OTTO'), Buffer.alloc(20)])],
    ['ttf', Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.alloc(20)])],
    ['ttf', Buffer.concat([ascii('true'), Buffer.alloc(20)])],
  ])('detects %s fonts', (ext, buf) => {
    expect(detectFontType(buf)).toBe(ext);
  });

  it.each([
    ['woff 1', Buffer.concat([ascii('wOFF'), Buffer.alloc(20)])],
    ['collection', Buffer.concat([ascii('ttcf'), Buffer.alloc(20)])],
    ['png', PNG_1X1],
    ['short', ascii('wOF2')],
    ['html', ascii('<html><script>x</script></html>')],
  ])('rejects %s as font', (_n, buf) => {
    expect(detectFontType(buf)).toBeNull();
  });

  it('accepts PNG and WebP logos and refuses SVG', () => {
    expect(detectLogoType(PNG_1X1)).toBe('png');
    expect(detectLogoType(Buffer.concat([ascii('RIFF'), Buffer.alloc(4), ascii('WEBPVP8 ')]))).toBe(
      'webp'
    );
    expect(detectLogoType(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectLogoType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
  });

  it('names files randomly and parses only its own names', () => {
    const name = randomAssetName('woff2');
    expect(parseAssetName(name)).toBe('woff2');
    expect(parseAssetName(`../${name}`)).toBeNull();
    expect(parseAssetName(`${'a'.repeat(32)}.svg`)).toBeNull();
    expect(parseAssetName(`${'a'.repeat(32)}.woff2/..`)).toBeNull();
  });
});

describe('brand settings', () => {
  it('normalises hex colours and requires every role', () => {
    const parsed = brandSettingsBody.parse(SETTINGS);
    expect(parsed.colors.secondary).toBe('#ABCDEF');
    expect(parsed.logoAssetId).toBeNull();
    const { surface: _drop, ...missing } = SETTINGS.colors;
    expect(brandSettingsBody.safeParse({ ...SETTINGS, colors: missing }).success).toBe(false);
    expect(
      brandSettingsBody.safeParse({ ...SETTINGS, colors: { ...SETTINGS.colors, extra: '#000000' } })
        .success
    ).toBe(false);
  });

  it.each(['red', '#FFF', '#GGGGGG', '#1234567', 'url(x)', '#12345'])(
    'rejects colour %s',
    (color) => {
      expect(
        brandSettingsBody.safeParse({ ...SETTINGS, colors: { ...SETTINGS.colors, primary: color } })
          .success
      ).toBe(false);
    }
  );

  it.each(['Ral"eway', "x'); color: red", 'a{b}', '', ' '.repeat(3), 'A'.repeat(61)])(
    'rejects the family name %j',
    (family) => {
      expect(
        brandSettingsBody.safeParse({
          ...SETTINGS,
          fonts: { headline: family, body: 'Instrument Sans' },
        }).success
      ).toBe(false);
    }
  );

  it('needs at least one and at most twelve grounds', () => {
    expect(brandSettingsBody.safeParse({ ...SETTINGS, backgrounds: [] }).success).toBe(false);
    const many = Array.from({ length: 13 }, () => SETTINGS.backgrounds[0]);
    expect(brandSettingsBody.safeParse({ ...SETTINGS, backgrounds: many }).success).toBe(false);
  });

  it('requires a declared licence for a font', () => {
    expect(fontUploadFields.safeParse({ family: 'Mine' }).success).toBe(false);
    expect(fontUploadFields.safeParse({ family: 'Mine', licence: '  ' }).success).toBe(false);
    expect(fontUploadFields.parse({ family: 'Mine', licence: 'OFL-1.1', weight: '700' })).toEqual({
      family: 'Mine',
      licence: 'OFL-1.1',
      weight: 700,
      style: 'normal',
    });
    expect(
      fontUploadFields.safeParse({ family: 'Mine', licence: 'x', weight: '450' }).success
    ).toBe(false);
  });
});

describe('buildBrandPack', () => {
  const orgId = '00000000-0000-4000-8000-000000000001';

  it('builds a valid BrandPack from the settings', () => {
    const settings = brandSettingsBody.parse(SETTINGS);
    const pack = buildBrandPack(
      orgId,
      settings,
      [{ fileName: `${'a'.repeat(32)}.woff2`, family: 'Mine', weight: 700, style: 'normal' }],
      { fileName: `${'b'.repeat(32)}.png` }
    );
    expect(brandPackSchema.safeParse(pack).success).toBe(true);
    expect(pack).toMatchObject({
      id: `org-${orgId}`,
      name: 'Example',
      defaultBackground: '#123456',
      fonts: {
        headline: 'Raleway',
        body: 'Instrument Sans',
        quoteShort: 'Raleway',
        quoteEmphasis: 'Instrument Sans',
      },
      fontFaces: [
        { family: 'Mine', src: `/api/brand-assets/${'a'.repeat(32)}.woff2`, weight: 700 },
      ],
      logo: { src: `/api/brand-assets/${'b'.repeat(32)}.png`, label: 'Example logo' },
      markers: { ink: '#123456' },
    });
    expect(pack.backgrounds.map((b) => b.id)).toEqual(['ground-1', 'ground-2']);
    // Each colour once per picker.
    const colors = pack.palette.map((s) => s.color);
    expect(new Set(colors).size).toBe(colors.length);
    expect(colors).toContain('#FFFFFF');
    // Same set of keys as the core's default pack.
    expect(Object.keys(pack).sort()).toEqual(Object.keys(brandDefault).sort());
  });

  it('gives the org brand pack swatches their role refs', () => {
    const pack = buildBrandPack(orgId, brandSettingsBody.parse(SETTINGS), [], null);
    const ref = (swatches: { id: string; ref?: string }[], id: string) =>
      swatches.find((s) => s.id === id)?.ref;
    expect(ref(pack.palette, 'primary')).toBe('brand.primary');
    expect(ref(pack.palette, 'accentOnLight')).toBe('brand.accentOnLight');
    expect(ref(pack.palette, 'surface')).toBe('brand.surface');
    expect(ref(pack.palette, 'white')).toBeUndefined();
    expect(ref(pack.textPalette, 'textOnDark')).toBe('brand.textOnDark');
    expect(ref(pack.markers.swatches, 'accent')).toBe('brand.accent');
    expect(ref(pack.markers.swatches, 'surface')).toBe('brand.surface');
    expect(brandPackSchema.safeParse(pack).success).toBe(true);
  });

  it('refuses a swatch ref that is not a binding ref', () => {
    const pack = buildBrandPack(orgId, brandSettingsBody.parse(SETTINGS), [], null);
    const bad = { ...pack, palette: [{ ...pack.palette[0]!, ref: 'brand.nope' }] };
    expect(brandPackSchema.safeParse(bad).success).toBe(false);
  });

  it('makes the primary colour the default ground, not the first ground', () => {
    const settings = brandSettingsBody.parse({
      ...SETTINGS,
      colors: { ...SETTINGS.colors, primary: '#0F3A52' },
    });
    const pack = buildBrandPack(orgId, settings, [], null);
    expect(settings.backgrounds[0]!.color).not.toBe('#0F3A52');
    expect(pack.defaultBackground).toBe('#0F3A52');
  });

  it('validates the core default pack with the same schema', () => {
    expect(brandPackSchema.safeParse(brandDefault).success).toBe(true);
  });
});
