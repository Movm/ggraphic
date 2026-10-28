// SPDX-License-Identifier: AGPL-3.0-only
import type { BrandPack, BrandSwatch } from '@ggraphic/core';
import type { BrandSettings } from '../contract.ts';
import { brandPackSchema } from './brandPackSchema.ts';

const WHITE = '#FFFFFF';
const BLACK = '#000000';

/** Families the Studio web app bundles (OFL); an organisation may pick them without upload. */
export const BUNDLED_FONT_FAMILIES = ['Raleway', 'Instrument Sans', 'Fraunces'] as const;

export interface FontAsset {
  fileName: string;
  family: string;
  weight: number;
  style: 'normal' | 'italic';
}

export interface LogoAsset {
  fileName: string;
}

const ROLE_LABELS: Record<keyof BrandSettings['colors'], string> = {
  primary: 'Primary',
  secondary: 'Secondary',
  accent: 'Accent',
  accentOnLight: 'Accent on light',
  attention: 'Attention',
  textOnDark: 'Text on dark',
  textOnLight: 'Text on light',
  surface: 'Surface',
};

/** First swatch per colour wins; the picker shows each colour once. */
function unique(swatches: BrandSwatch[]): BrandSwatch[] {
  const seen = new Set<string>();
  return swatches.filter((s) => {
    if (seen.has(s.color)) return false;
    seen.add(s.color);
    return true;
  });
}

const role = (settings: BrandSettings, key: keyof BrandSettings['colors']): BrandSwatch => ({
  id: key,
  label: ROLE_LABELS[key],
  color: settings.colors[key],
});

const uniqueColors = (colors: string[]) => [...new Set(colors)];

/**
 * The organisation's BrandPack from what its owners set. Pickers, markers, chart and
 * effect colours are derived from the eight colour roles and the grounds, the way
 * the Studio's own pack pairs them. Validated against the core's type before it leaves.
 */
export function buildBrandPack(
  organisationId: string,
  settings: BrandSettings,
  fonts: FontAsset[],
  logo: LogoAsset | null
): BrandPack {
  const c = settings.colors;
  const backgrounds = settings.backgrounds.map((b, i) => ({
    id: `ground-${i + 1}`,
    label: b.label,
    color: b.color,
    ink: b.ink,
  }));
  const pack: BrandPack = {
    id: `org-${organisationId}`,
    name: settings.name,
    colors: { ...c },
    backgrounds,
    // The brand form promises the primary colour as the default ground.
    defaultBackground: c.primary,
    palette: unique([
      role(settings, 'primary'),
      role(settings, 'secondary'),
      role(settings, 'accent'),
      role(settings, 'accentOnLight'),
      role(settings, 'attention'),
      role(settings, 'surface'),
      role(settings, 'textOnLight'),
      ...backgrounds.map(({ id, label, color }) => ({ id, label, color })),
      { id: 'white', label: 'White', color: WHITE },
      { id: 'black', label: 'Black', color: BLACK },
    ]),
    textPalette: unique([
      role(settings, 'textOnDark'),
      role(settings, 'textOnLight'),
      role(settings, 'accent'),
      role(settings, 'accentOnLight'),
      { id: 'black', label: 'Black', color: BLACK },
    ]),
    markers: {
      swatches: unique([
        role(settings, 'accent'),
        role(settings, 'surface'),
        { id: 'white', label: 'White', color: WHITE },
      ]),
      ink: c.textOnLight,
    },
    chart: uniqueColors([c.primary, c.secondary, c.attention, c.accentOnLight, c.accent]),
    effects: {
      tints: uniqueColors([c.primary, c.secondary, c.accentOnLight, c.accent]),
      shadows: uniqueColors([BLACK, c.primary, c.textOnLight, c.secondary]),
      outlines: uniqueColors([WHITE, BLACK, c.primary, c.attention]),
    },
    fonts: {
      headline: settings.fonts.headline,
      body: settings.fonts.body,
      quoteShort: settings.fonts.headline,
      quoteEmphasis: settings.fonts.body,
    },
    fontFaces: fonts.map((f) => ({
      family: f.family,
      src: `/api/brand-assets/${f.fileName}`,
      weight: f.weight,
      style: f.style,
    })),
    lineHeightFactor: 1.1,
    logo: logo
      ? { src: `/api/brand-assets/${logo.fileName}`, label: `${settings.name} logo` }
      : null,
    quoteMark: null,
  };
  return brandPackSchema.parse(pack);
}
