// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The Studio's starter designs, drawn from the neutral brand only. Each one
 * lays out on the page's own format: positions are fractions of the sheet,
 * type sizes follow its short side.
 *
 * Texts carry role ids (`TEXT_ROLES`) so the AI draft knows which one to fill.
 */
import {
  brandFingerprint,
  fitLogoBox,
  normalizeColor,
  resolveRef,
  resolveScheme,
  withBinding,
  type BindingRef,
  type Bindings,
  type BrandFontRole,
  type SchemeId,
} from '@ggraphic/core';
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { type AdditionalText } from '@ggraphic/editor/configs/types';
import { createShape } from '@ggraphic/editor/utils/shapes';
import { type UserImageInstance } from '@ggraphic/editor/utils/userImageUtils';

import { logoSizeOf } from '../../logoSize';

import {
  BLANK_TEMPLATE_ID,
  HEADLINE_TEMPLATE_ID,
  NUMBER_TEMPLATE_ID,
  QUOTE_TEMPLATE_ID,
  type StudioTemplateId,
} from './ids';
import { type PageSeed } from './pageState';
import { fontStackFor, scaleFor } from './typography';

/** The ids of the texts an AI draft fills, by draft field. */
export const TEXT_ROLES = {
  headline: 'headline',
  subline: 'subline',
  body: 'body',
  callToAction: 'cta',
} as const;

interface Frame {
  width: number;
  height: number;
  /** Side margin. */
  m: number;
  /** Type scale. */
  s: number;
  /** Text box width inside the margins. */
  inner: number;
  /** The value a ref stands for in this page's colour world, colours in canonical form. */
  paint: (ref: BindingRef) => string;
}

/** What `ref` resolves to under the brand's `schemeId` world; fonts as the plain family name. */
function painterFor(schemeId: SchemeId): Frame['paint'] {
  const brand = activeBrand();
  const scheme = resolveScheme(brand, schemeId);
  return (ref) => {
    const value = resolveRef(ref, brand, scheme) ?? brand.defaultBackground;
    return ref.startsWith('font.') ? value : normalizeColor(value);
  };
}

const frameOf = (width: number, height: number, schemeId: SchemeId): Frame => {
  const m = Math.round(Math.min(width, height) * 0.09);
  return {
    width,
    height,
    m,
    s: scaleFor(width, height),
    inner: width - 2 * m,
    paint: painterFor(schemeId),
  };
};

/** `element` with each field in `refs` set to its resolved value and bound to its ref. */
function bound<T extends object>(f: Frame, element: T, refs: Record<string, BindingRef>): T {
  const out: Record<string, unknown> = { ...(element as Record<string, unknown>) };
  let bind: Bindings | undefined;
  for (const [field, ref] of Object.entries(refs)) {
    const value = f.paint(ref);
    // A font field carries the stack, its binding the bare family.
    out[field] = ref.startsWith('font.')
      ? fontStackFor(ref.slice(5) as BrandFontRole, value)
      : value;
    bind = withBinding(bind, field, { ref, value });
  }
  return { ...out, bind } as T;
}

function text(
  f: Frame,
  id: string,
  type: AdditionalText['type'],
  content: string,
  yFraction: number,
  style: Partial<Pick<AdditionalText, 'fontStyle' | 'align' | 'lineHeight'>> & {
    size: number;
    fill: BindingRef;
    font: BrandFontRole;
  }
): AdditionalText {
  const { size, fill, font, ...rest } = style;
  return bound(
    f,
    {
      id,
      type,
      text: content,
      x: f.m,
      y: Math.round(f.height * yFraction),
      width: f.inner,
      fontSize: Math.round(size * f.s),
      align: 'left' as const,
      lineHeight: activeBrand().lineHeightFactor,
      fontFamily: '',
      fill: '',
      ...rest,
    },
    { fill, fontFamily: `font.${font}` }
  );
}

/** The page-level keys of a seed whose ground follows the brand. */
function pageBinding(
  f: Frame,
  schemeId: SchemeId
): Pick<PageSeed, 'backgroundColor' | 'bind' | 'brandScheme' | 'brandStamp'> {
  const value = f.paint('ground');
  return {
    backgroundColor: value,
    bind: withBinding(undefined, 'backgroundColor', { ref: 'ground', value }),
    brandScheme: schemeId,
    brandStamp: brandFingerprint(activeBrand()),
  };
}

/**
 * The brand's logo, bottom right inside the margins, in its own proportions. An
 * ordinary placed image: the user can move, resize or delete it. Nothing when the
 * brand has no logo or the logo's size is not known (it did not load).
 */
function logoImages(f: Frame): UserImageInstance[] {
  const logo = activeBrand().logo;
  const size = logo ? logoSizeOf(logo.src) : null;
  if (!logo || !size) return [];
  // The envelope is the corner the logo may fill; every later logo is fitted into it again.
  const maxWidth = Math.round(f.width * 0.22);
  const maxHeight = Math.round(f.height * 0.08);
  const box = {
    x: f.width - f.m - maxWidth,
    y: f.height - f.m - maxHeight,
    width: maxWidth,
    height: maxHeight,
  };
  const fit = fitLogoBox(box, size, f);
  return [
    {
      id: 'brand-logo',
      src: logo.src,
      fileName: logo.label,
      ...fit,
      rotation: 0,
      scale: 1,
      opacity: 1,
      bind: withBinding(undefined, 'src', { ref: 'brand.logo', value: logo.src, box, fit }),
    },
  ];
}

function headlineSeed(f: Frame): PageSeed {
  const bar = bound(
    f,
    {
      ...createShape('rect', f.m + 60 * f.s, Math.round(f.height * 0.24), f.paint('accent')),
      id: 'accent-bar',
      width: Math.round(120 * f.s),
      height: Math.round(14 * f.s),
    },
    { fill: 'accent' }
  );
  return {
    ...pageBinding(f, 'primary'),
    shapeInstances: [bar],
    userImageInstances: logoImages(f),
    additionalTexts: [
      text(f, TEXT_ROLES.headline, 'header', 'A clear headline', 0.28, {
        size: 104,
        font: 'headline',
        fontStyle: 'bold',
        fill: 'ink',
      }),
      text(f, TEXT_ROLES.subline, 'subheader', 'One line that says why it matters', 0.5, {
        size: 48,
        font: 'headline',
        // Not the accent: it only has to reach 3:1 on the ground, and this is small text.
        fill: 'ink2',
      }),
      text(f, TEXT_ROLES.body, 'body', 'Add the details here: what, when and where.', 0.62, {
        size: 34,
        font: 'body',
        fill: 'ink',
        lineHeight: 1.35,
      }),
      text(f, TEXT_ROLES.callToAction, 'body', 'Find out more', 0.84, {
        size: 34,
        font: 'body',
        fontStyle: 'bold',
        fill: 'ink2',
      }),
    ],
  };
}

function quoteSeed(f: Frame): PageSeed {
  return {
    ...pageBinding(f, 'light'),
    userImageInstances: logoImages(f),
    additionalTexts: [
      text(f, 'quote-mark', 'header', '“', 0.08, {
        size: 280,
        font: 'quoteEmphasis',
        fill: 'accent',
        lineHeight: 1,
      }),
      text(f, TEXT_ROLES.headline, 'header', 'Good design is as little design as possible.', 0.3, {
        size: 72,
        font: 'quoteEmphasis',
        fontStyle: 'italic',
        fill: 'ink',
        lineHeight: 1.2,
      }),
      text(f, TEXT_ROLES.subline, 'subheader', '— Name of the speaker', 0.74, {
        size: 38,
        font: 'body',
        fontStyle: 'bold',
        // A role of the page's world: the brand's secondary is a ground colour, not a text one.
        fill: 'ink2',
      }),
    ],
  };
}

function numberSeed(f: Frame): PageSeed {
  return {
    ...pageBinding(f, 'secondary'),
    userImageInstances: logoImages(f),
    additionalTexts: [
      text(f, 'number', 'header', '73%', 0.16, {
        size: 300,
        font: 'headline',
        fontStyle: 'bold',
        fill: 'accent',
        lineHeight: 1,
      }),
      text(f, TEXT_ROLES.headline, 'header', 'of what this number stands for', 0.5, {
        size: 64,
        font: 'headline',
        fontStyle: 'bold',
        fill: 'ink',
      }),
      text(f, TEXT_ROLES.subline, 'body', 'Source or context in one short line', 0.74, {
        size: 34,
        font: 'body',
        fill: 'ink',
      }),
    ],
  };
}

/** Each template with the colour world its page is bound to. */
const SEEDS: Record<StudioTemplateId, { scheme: SchemeId; build: (f: Frame) => PageSeed }> = {
  // No ground of its own: a blank page added to a design takes the ground of the page before.
  [BLANK_TEMPLATE_ID]: { scheme: 'primary', build: () => ({}) },
  [HEADLINE_TEMPLATE_ID]: { scheme: 'primary', build: headlineSeed },
  [QUOTE_TEMPLATE_ID]: { scheme: 'light', build: quoteSeed },
  [NUMBER_TEMPLATE_ID]: { scheme: 'secondary', build: numberSeed },
};

/** The fresh page of `templateId` on a `width` × `height` sheet. */
export function seedFor(templateId: StudioTemplateId, width: number, height: number): PageSeed {
  const { scheme, build } = SEEDS[templateId];
  return build(frameOf(width, height, scheme));
}

/**
 * The seed as stored page state. A page the editor opens with (`initialPages`)
 * goes into the pages document as given, and the editor writes back only what
 * changes later: a document must therefore start with the seed spelled out,
 * or the AI draft and the autosave would see an empty page.
 */
export function seedPageState(
  templateId: StudioTemplateId,
  width: number,
  height: number
): Record<string, unknown> {
  const seed = seedFor(templateId, width, height);
  const shapes = seed.shapeInstances ?? [];
  const texts = seed.additionalTexts ?? [];
  const images = seed.userImageInstances ?? [];
  return {
    ...(seed.backgroundColor ? { backgroundColor: seed.backgroundColor } : {}),
    ...(seed.bind ? { bind: seed.bind } : {}),
    ...(seed.brandScheme ? { brandScheme: seed.brandScheme } : {}),
    ...(seed.brandStamp ? { brandStamp: seed.brandStamp } : {}),
    shapeInstances: shapes,
    ...(images.length ? { userImageInstances: images } : {}),
    additionalTexts: texts,
    layerOrder: [...shapes, ...images, ...texts].map((e) => e.id),
  };
}
