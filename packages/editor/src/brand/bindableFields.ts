// SPDX-License-Identifier: MPL-2.0
/**
 * Which fields of each element kind may carry a brand binding (`bind`), and
 * which colour fields are left out on purpose. `bindableFields.vitest.ts`
 * holds a default instance of every kind against both tables, so a colour or
 * font field added to a kind turns it red until it is listed in one of them.
 * Keyed by the kind's `stateKey`; `iconStates` stands for the icon kind, whose
 * state lives there, and `page` for the page's own fields.
 */
import type { IconState } from '../configs/factory/baseTypes.js';
import type { AdditionalText } from '../configs/types.js';
import type { CircleBadgeInstance } from '../primitives/CircleBadge.js';
import type { ChartInstance } from '../utils/chartTypes.js';
import type { FrameInstance } from '../utils/frameUtils.js';
import type { IllustrationInstance } from '../utils/illustrations/types.js';
import type { PillBadgeInstance } from '../utils/pillBadgeUtils.js';
import type { ShapeInstance } from '../utils/shapes.js';
import type { UserImageInstance } from '../utils/userImageUtils.js';

// A field name that no longer exists on its type is a compile error here.
type FieldsOf<T> = readonly (T extends unknown ? keyof T & string : never)[];

const BINDABLE = {
  iconStates: ['color'] satisfies FieldsOf<IconState>,
  shapeInstances: ['fill', 'shadowColor'] satisfies FieldsOf<ShapeInstance>,
  frameInstances: ['borderColor', 'shadowColor'] satisfies FieldsOf<FrameInstance>,
  additionalTexts: [
    'fontFamily',
    'fill',
    'stroke',
    'shadowColor',
  ] satisfies FieldsOf<AdditionalText>,
  illustrationInstances: ['color'] satisfies FieldsOf<IllustrationInstance>,
  assetInstances: [],
  circleBadgeInstances: ['backgroundColor', 'textColor'] satisfies FieldsOf<CircleBadgeInstance>,
  pillBadgeInstances: [
    'backgroundColor',
    'textColor',
    'fontFamily',
  ] satisfies FieldsOf<PillBadgeInstance>,
  // `src` is bound only to the brand logo.
  userImageInstances: ['shadowColor', 'tint', 'src'] satisfies FieldsOf<UserImageInstance>,
  chartInstances: ['background'] satisfies FieldsOf<ChartInstance>,
  // The page's background and the colours its templates pick through `fillStateKey`.
  page: [
    'backgroundColor',
    'primaryColor',
    'secondaryColor',
    'accentColor',
    'boxColor',
    'line3Color',
    'labelColor',
    'headlineColor',
    'subtextColor',
    'subtext2Color',
    'titleColor',
    'beschreibungColor',
  ],
} as const;

/** stateKey -> top-level colour/font fields that may carry a binding, plus `'page'` for page-level fields. */
export const BINDABLE_FIELDS: Readonly<Record<string, readonly string[]>> = BINDABLE;

const NESTED = 'nested/array; bound by templates in P2';

/** stateKey -> colour field that is never bound, with the reason. */
export const EXEMPT_FIELDS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  shapeInstances: { fillGradient: NESTED },
  additionalTexts: {
    fillGradient: NESTED,
    accent: NESTED,
    marker: NESTED,
  },
  circleBadgeInstances: { textLines: NESTED },
  chartInstances: { colors: NESTED },
};
