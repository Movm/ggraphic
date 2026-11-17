// SPDX-License-Identifier: AGPL-3.0-only
import {
  type BrandFontFace,
  type BrandFonts,
  type BrandImage,
  type BrandLogoAlt,
  type BrandPack,
  type BrandSwatch,
} from './brandPack.js';
import { deriveBrandColors, deriveGrounds, type BrandColorInputs } from './derive.js';
import { type BrandLayout } from './layout.js';

/** What a host decides about its brand; `defineBrand` derives the rest. */
export interface BrandInputs {
  /** Stable key, stored with documents. Never rename one that has shipped. */
  id: string;
  /** Shown where a person picks the brand. */
  name: string;
  /** The three colours a person chooses; the other five roles and the grounds are derived. */
  colors: BrandColorInputs;
  /**
   * Headline and body are required; `quoteShort` falls back to the headline, `quoteEmphasis` to
   * the serif and then the headline. `cuts` declares the real cuts of the families.
   */
  fonts: Pick<BrandFonts, 'headline' | 'body'> & Partial<BrandFonts>;
  /** Font files the editor loads; absent = the host loads the families itself. */
  fontFaces?: BrandFontFace[];
  logo?: BrandImage | null;
  logoAlt?: BrandLogoAlt | null;
  layout?: BrandLayout;
  /** Headline line height = font size × this factor; 1.1 when absent. */
  lineHeightFactor?: number;
  /**
   * What a print export needs beyond the screen colours; see `BrandPack.print`. Keys are CSS hex
   * colours (`#rgb` and `#rrggbb` in any case; an alpha digit is dropped) and are stored as
   * lower-case `#rrggbb`. Each value is cyan, magenta, yellow, black, each 0–100.
   */
  print?: {
    cmyk?: Readonly<Record<string, readonly [number, number, number, number]>>;
  };
}

/** The `#rrggbb` a CMYK key stands for, as the PDF writer looks colours up; null for non-hex. */
function cmykKey(colour: string): string | null {
  const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(colour.trim());
  if (!match) return null;
  const digits = match[1]!.toLowerCase();
  if (digits.length <= 4) return `#${Array.from(digits.slice(0, 3), (d) => d + d).join('')}`;
  return `#${digits.slice(0, 6)}`;
}

function printOf(id: string, print: BrandInputs['print']): BrandPack['print'] | undefined {
  if (!print?.cmyk) return undefined;
  const cmyk: Record<string, readonly [number, number, number, number]> = {};
  for (const [key, value] of Object.entries(print.cmyk)) {
    const hex = cmykKey(key);
    if (!hex) throw new Error(`defineBrand("${id}"): print.cmyk key "${key}" is not a hex colour`);
    const valid =
      Array.isArray(value) &&
      value.length === 4 &&
      value.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100);
    if (!valid) {
      throw new Error(
        `defineBrand("${id}"): print.cmyk["${key}"] must be four numbers from 0 to 100`
      );
    }
    const known = cmyk[hex];
    if (known && known.some((n, i) => n !== value[i])) {
      throw new Error(`defineBrand("${id}"): print.cmyk names ${hex} twice with different values`);
    }
    cmyk[hex] = [value[0]!, value[1]!, value[2]!, value[3]!];
  }
  return { cmyk };
}

const WHITE = '#ffffff';
const BLACK = '#000000';

/**
 * A full brand pack from the few inputs a host decides: the colour roles and the grounds come from
 * `deriveBrandColors` and `deriveGrounds`, the pickers offer the roles bound to them (so a picked
 * swatch follows the brand), and fonts fall back as `BrandInputs.fonts` says. Throws when a colour
 * is not a colour: a brand is defined once, by the host, and a broken one should not start.
 */
export function defineBrand(input: BrandInputs): BrandPack {
  const colors = deriveBrandColors(input.colors);
  if (!colors) {
    throw new Error(`defineBrand("${input.id}"): primary, secondary and accent must be colours`);
  }
  const backgrounds = deriveGrounds(input.colors);
  const role = (id: keyof typeof colors, label: string): BrandSwatch => ({
    id,
    label,
    color: colors[id],
    ref: `brand.${id}`,
  });
  const white: BrandSwatch = { id: 'white', label: 'White', color: WHITE };
  const black: BrandSwatch = { id: 'black', label: 'Black', color: BLACK };
  const { headline } = input.fonts;
  const print = printOf(input.id, input.print);

  return {
    id: input.id,
    name: input.name,
    colors,
    backgrounds,
    // The primary world comes first, and `deriveGrounds` always keeps it.
    defaultBackground: backgrounds[0]?.color ?? colors.primary,
    palette: [
      role('primary', 'Primary'),
      role('secondary', 'Secondary'),
      role('accent', 'Accent'),
      role('accentOnLight', 'Accent on light'),
      role('attention', 'Attention'),
      role('surface', 'Surface'),
      white,
      black,
    ],
    textPalette: [black, role('textOnDark', 'Text on dark'), role('textOnLight', 'Text on light')],
    markers: {
      swatches: [role('accent', 'Accent'), role('surface', 'Surface'), white],
      ink: colors.textOnLight,
    },
    // Light colours never open the list: on white they only read next to a dark one.
    chart: [
      colors.primary,
      colors.secondary,
      colors.attention,
      colors.accentOnLight,
      colors.accent,
    ],
    effects: {
      tints: [colors.primary, colors.secondary, colors.accentOnLight, colors.accent],
      shadows: [BLACK, colors.primary, colors.textOnLight, colors.secondary],
      outlines: [WHITE, BLACK, colors.primary, colors.attention],
    },
    fonts: {
      ...input.fonts,
      quoteShort: input.fonts.quoteShort ?? headline,
      quoteEmphasis: input.fonts.quoteEmphasis ?? input.fonts.serif ?? headline,
    },
    fontFaces: input.fontFaces ?? [],
    lineHeightFactor: input.lineHeightFactor ?? 1.1,
    logo: input.logo ?? null,
    ...(input.logoAlt !== undefined && { logoAlt: input.logoAlt }),
    ...(input.layout && { layout: input.layout }),
    ...(print && { print }),
    quoteMark: null,
  };
}
