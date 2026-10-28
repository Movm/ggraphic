// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The core's BrandPack as a zod schema. The two assertions at the bottom fail to
 * compile when the schema and `@ggraphic/core`'s type drift apart in either direction.
 */
import {
  BRAND_LAYOUT_BOUNDS,
  isBindingRef,
  LOGO_CORNERS,
  type BindingRef,
  type BrandPack,
} from '@ggraphic/core';
import { z } from 'zod';

export const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'expected a colour as #RRGGBB')
  .transform((v) => v.toUpperCase());

const bindingRef = z.custom<BindingRef>(isBindingRef, 'expected a binding ref');

const swatch = z.object({
  id: z.string().min(1),
  label: z.string(),
  color: hexColor,
  ref: bindingRef.optional(),
});

export const brandColorRoles = [
  'primary',
  'secondary',
  'accent',
  'accentOnLight',
  'attention',
  'textOnDark',
  'textOnLight',
  'surface',
] as const;

export const brandColorsSchema = z.strictObject(
  Object.fromEntries(brandColorRoles.map((role) => [role, hexColor])) as Record<
    (typeof brandColorRoles)[number],
    typeof hexColor
  >
);

// Font family names end up in CSS and canvas font strings: letters, digits, space, - and _.
export const fontFamily = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u, 'letters, digits, spaces, - and _ only');

export const brandLayoutSchema = z.object({
  margin: z.number().min(BRAND_LAYOUT_BOUNDS.margin.min).max(BRAND_LAYOUT_BOUNDS.margin.max),
  logoCorner: z.enum(LOGO_CORNERS),
  logoMaxWidth: z
    .number()
    .min(BRAND_LAYOUT_BOUNDS.logoMaxWidth.min)
    .max(BRAND_LAYOUT_BOUNDS.logoMaxWidth.max),
  logoMaxHeight: z
    .number()
    .min(BRAND_LAYOUT_BOUNDS.logoMaxHeight.min)
    .max(BRAND_LAYOUT_BOUNDS.logoMaxHeight.max),
});

export const brandPackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  colors: brandColorsSchema,
  backgrounds: z
    .array(swatch.extend({ ink: hexColor, glow: z.array(hexColor).readonly().optional() }))
    .min(1),
  defaultBackground: hexColor,
  palette: z.array(swatch),
  textPalette: z.array(swatch),
  markers: z.object({ swatches: z.array(swatch), ink: hexColor }),
  chart: z.array(hexColor).readonly(),
  effects: z.object({
    tints: z.array(hexColor).readonly(),
    shadows: z.array(hexColor).readonly(),
    outlines: z.array(hexColor).readonly(),
  }),
  fonts: z.object({
    headline: fontFamily,
    body: fontFamily,
    quoteShort: fontFamily,
    quoteEmphasis: fontFamily,
    serif: fontFamily.optional(),
    condensed: fontFamily.optional(),
    boldFamilies: z.record(z.string(), z.string()).readonly().optional(),
  }),
  fontFaces: z.array(
    z.object({
      family: fontFamily,
      src: z.string().regex(/^\/api\/brand-assets\/[0-9a-f]{32}\.(woff2|ttf|otf)$/),
      weight: z.int().min(100).max(900).optional(),
      style: z.enum(['normal', 'italic']).optional(),
    })
  ),
  lineHeightFactor: z.number().positive(),
  logo: z
    .object({
      src: z.string().regex(/^\/api\/brand-assets\/[0-9a-f]{32}\.(png|webp)$/),
      label: z.string(),
    })
    .nullable(),
  logoAlt: z
    .object({
      src: z.string().regex(/^\/api\/brand-assets\/[0-9a-f]{32}\.(png|webp)$/),
      label: z.string(),
      ground: z.enum(['dark', 'light']),
    })
    .nullable()
    .optional(),
  layout: brandLayoutSchema.optional(),
  quoteMark: z.object({ src: z.string() }).nullable(),
});

type Parsed = z.output<typeof brandPackSchema>;
// Compile-time only: each side must be assignable to the other.
export const _schemaIsBrandPack = (p: Parsed): BrandPack => p;
export const _brandPackIsSchema = (p: BrandPack): z.input<typeof brandPackSchema> => p;
