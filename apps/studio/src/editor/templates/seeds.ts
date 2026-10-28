// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The Studio's starter designs, drawn from the neutral brand only. Each one
 * lays out on the page's own format: positions are fractions of the sheet,
 * type sizes follow its short side.
 *
 * Texts carry role ids (`TEXT_ROLES`) so the AI draft knows which one to fill.
 */
import { brandDefault } from '@ggraphic/core';
import { type AdditionalText } from '@ggraphic/editor/configs/types';
import { createShape } from '@ggraphic/editor/utils/shapes';

import {
  BLANK_TEMPLATE_ID,
  HEADLINE_TEMPLATE_ID,
  NUMBER_TEMPLATE_ID,
  QUOTE_TEMPLATE_ID,
  type StudioTemplateId,
} from './ids';
import { type PageSeed } from './pageState';
import { bodyFont, headlineFont, quoteFont, scaleFor } from './typography';

/** The ids of the texts an AI draft fills, by draft field. */
export const TEXT_ROLES = {
  headline: 'headline',
  subline: 'subline',
  body: 'body',
  callToAction: 'cta',
} as const;

const { colors } = brandDefault;
const PAPER = colors.surface;
const NIGHT = colors.primary;

interface Frame {
  width: number;
  height: number;
  /** Side margin. */
  m: number;
  /** Type scale. */
  s: number;
  /** Text box width inside the margins. */
  inner: number;
}

const frameOf = (width: number, height: number): Frame => {
  const m = Math.round(Math.min(width, height) * 0.09);
  return { width, height, m, s: scaleFor(width, height), inner: width - 2 * m };
};

function text(
  f: Frame,
  id: string,
  type: AdditionalText['type'],
  content: string,
  yFraction: number,
  style: Pick<AdditionalText, 'fontFamily' | 'fill'> &
    Partial<Pick<AdditionalText, 'fontStyle' | 'align' | 'lineHeight'>> & { size: number }
): AdditionalText {
  const { size, ...rest } = style;
  return {
    id,
    type,
    text: content,
    x: f.m,
    y: Math.round(f.height * yFraction),
    width: f.inner,
    fontSize: Math.round(size * f.s),
    align: 'left',
    lineHeight: brandDefault.lineHeightFactor,
    ...rest,
  };
}

function headlineSeed(f: Frame): PageSeed {
  const bar = {
    ...createShape('rect', f.m + 60 * f.s, Math.round(f.height * 0.24), colors.accent),
    id: 'accent-bar',
    width: Math.round(120 * f.s),
    height: Math.round(14 * f.s),
  };
  return {
    backgroundColor: NIGHT,
    shapeInstances: [bar],
    additionalTexts: [
      text(f, TEXT_ROLES.headline, 'header', 'A clear headline', 0.28, {
        size: 104,
        fontFamily: headlineFont(),
        fontStyle: 'bold',
        fill: colors.textOnDark,
      }),
      text(f, TEXT_ROLES.subline, 'subheader', 'One line that says why it matters', 0.5, {
        size: 48,
        fontFamily: headlineFont(),
        fill: colors.accent,
      }),
      text(f, TEXT_ROLES.body, 'body', 'Add the details here: what, when and where.', 0.62, {
        size: 34,
        fontFamily: bodyFont(),
        fill: colors.textOnDark,
        lineHeight: 1.35,
      }),
      text(f, TEXT_ROLES.callToAction, 'body', 'Find out more', 0.84, {
        size: 34,
        fontFamily: bodyFont(),
        fontStyle: 'bold',
        fill: colors.accent,
      }),
    ],
  };
}

function quoteSeed(f: Frame): PageSeed {
  return {
    backgroundColor: PAPER,
    additionalTexts: [
      text(f, 'quote-mark', 'header', '“', 0.08, {
        size: 280,
        fontFamily: quoteFont(),
        fill: colors.accentOnLight,
        lineHeight: 1,
      }),
      text(f, TEXT_ROLES.headline, 'header', 'Good design is as little design as possible.', 0.3, {
        size: 72,
        fontFamily: quoteFont(),
        fontStyle: 'italic',
        fill: colors.textOnLight,
        lineHeight: 1.2,
      }),
      text(f, TEXT_ROLES.subline, 'subheader', '— Name of the speaker', 0.74, {
        size: 38,
        fontFamily: bodyFont(),
        fontStyle: 'bold',
        fill: colors.secondary,
      }),
    ],
  };
}

function numberSeed(f: Frame): PageSeed {
  return {
    backgroundColor: colors.secondary,
    additionalTexts: [
      text(f, 'number', 'header', '73%', 0.16, {
        size: 300,
        fontFamily: headlineFont(),
        fontStyle: 'bold',
        fill: colors.accent,
        lineHeight: 1,
      }),
      text(f, TEXT_ROLES.headline, 'header', 'of what this number stands for', 0.5, {
        size: 64,
        fontFamily: headlineFont(),
        fontStyle: 'bold',
        fill: colors.textOnDark,
      }),
      text(f, TEXT_ROLES.subline, 'body', 'Source or context in one short line', 0.74, {
        size: 34,
        fontFamily: bodyFont(),
        fill: colors.textOnDark,
      }),
    ],
  };
}

const SEEDS: Record<StudioTemplateId, (f: Frame) => PageSeed> = {
  // No ground of its own: a blank page added to a design takes the ground of the page before.
  [BLANK_TEMPLATE_ID]: () => ({}),
  [HEADLINE_TEMPLATE_ID]: headlineSeed,
  [QUOTE_TEMPLATE_ID]: quoteSeed,
  [NUMBER_TEMPLATE_ID]: numberSeed,
};

/** The fresh page of `templateId` on a `width` × `height` sheet. */
export function seedFor(templateId: StudioTemplateId, width: number, height: number): PageSeed {
  return SEEDS[templateId](frameOf(width, height));
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
  return {
    ...(seed.backgroundColor ? { backgroundColor: seed.backgroundColor } : {}),
    shapeInstances: shapes,
    additionalTexts: texts,
    layerOrder: [...shapes, ...texts].map((e) => e.id),
  };
}
