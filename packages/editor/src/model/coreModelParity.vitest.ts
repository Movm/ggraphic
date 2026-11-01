// SPDX-License-Identifier: MPL-2.0
/**
 * The element data model lives in `@ggraphic/core`; the editor's modules hand out the very same
 * types and constants under their old paths. The shapes are stored in canvas documents, so a
 * drift between the two would only surface on load. Type parity is checked by `tsc` over this
 * file, the constants at runtime.
 */
import * as core from '@ggraphic/core';
import { type StockImageAttribution } from '@ggraphic/schema';
import { describe, expect, expectTypeOf, it } from 'vitest';

import * as canvasAssets from '../utils/canvasAssets.js';
import * as textAlign from '../utils/textAlign.js';

import type * as baseTypes from '../configs/factory/baseTypes.js';
import type * as configTypes from '../configs/types.js';
import type * as circleBadge from '../primitives/CircleBadge.js';
import type * as tabTypes from '../sidebar/tabTypes.js';
import type * as chartTypes from '../utils/chartTypes.js';
import type * as cornerRadius from '../utils/cornerRadius.js';
import type * as externalIcons from '../utils/externalIcons.js';
import type * as frameUtils from '../utils/frameUtils.js';
import type * as gradientFill from '../utils/gradientFill.js';
import type * as illustrations from '../utils/illustrations/types.js';
import type * as pillBadge from '../utils/pillBadgeUtils.js';
import type * as shapeDevices from '../utils/shapeDevices.js';
import type * as shapes from '../utils/shapes.js';
import type * as textUtils from '../utils/textUtils.js';
import type * as userImage from '../utils/userImageUtils.js';

describe('core element model parity', () => {
  it('hands out the same types under the old paths', () => {
    expectTypeOf<configTypes.AdditionalText>().toEqualTypeOf<core.AdditionalText>();
    expectTypeOf<configTypes.FontWeight>().toEqualTypeOf<core.FontWeight>();
    expectTypeOf<textUtils.TextAccent>().toEqualTypeOf<core.TextAccent>();
    expectTypeOf<textUtils.TextMarker>().toEqualTypeOf<core.TextMarker>();
    expectTypeOf<textAlign.TextAlign>().toEqualTypeOf<core.TextAlign>();
    expectTypeOf<gradientFill.GradientFill>().toEqualTypeOf<core.GradientFill>();
    expectTypeOf<gradientFill.GradientStop>().toEqualTypeOf<core.GradientStop>();
    expectTypeOf<cornerRadius.CornerRadius>().toEqualTypeOf<core.CornerRadius>();
    expectTypeOf<cornerRadius.Corners>().toEqualTypeOf<core.Corners>();
    expectTypeOf<shapes.ShapeInstance>().toEqualTypeOf<core.ShapeInstance>();
    expectTypeOf<shapes.ShapeType>().toEqualTypeOf<core.ShapeType>();
    expectTypeOf<shapes.ShapeBlendMode>().toEqualTypeOf<core.ShapeBlendMode>();
    expectTypeOf<shapeDevices.TailSide>().toEqualTypeOf<core.TailSide>();
    expectTypeOf<canvasAssets.AssetInstance>().toEqualTypeOf<core.AssetInstance>();
    expectTypeOf<chartTypes.ChartInstance>().toEqualTypeOf<core.ChartInstance>();
    expectTypeOf<chartTypes.ChartType>().toEqualTypeOf<core.ChartType>();
    expectTypeOf<chartTypes.ChartDataPoint>().toEqualTypeOf<core.ChartDataPoint>();
    expectTypeOf<chartTypes.ChartSeries>().toEqualTypeOf<core.ChartSeries>();
    expectTypeOf<chartTypes.ChartLegendPosition>().toEqualTypeOf<core.ChartLegendPosition>();
    expectTypeOf<circleBadge.CircleBadgeInstance>().toEqualTypeOf<core.CircleBadgeInstance>();
    expectTypeOf<circleBadge.CircleBadgeTextLine>().toEqualTypeOf<core.CircleBadgeTextLine>();
    expectTypeOf<pillBadge.PillBadgeInstance>().toEqualTypeOf<core.PillBadgeInstance>();
    expectTypeOf<pillBadge.PillBadgeFontStyle>().toEqualTypeOf<core.PillBadgeFontStyle>();
    expectTypeOf<userImage.UserImageInstance>().toEqualTypeOf<core.UserImageInstance>();
    expectTypeOf<userImage.ElementPlacement>().toEqualTypeOf<core.ElementPlacement>();
    expectTypeOf<frameUtils.FrameInstance>().toEqualTypeOf<core.FrameInstance>();
    expectTypeOf<frameUtils.FrameClipType>().toEqualTypeOf<core.FrameClipType>();
    expectTypeOf<frameUtils.FrameCategory>().toEqualTypeOf<core.FrameCategory>();
    expectTypeOf<illustrations.IllustrationInstance>().toEqualTypeOf<core.IllustrationInstance>();
    expectTypeOf<illustrations.KawaiiInstance>().toEqualTypeOf<core.KawaiiInstance>();
    expectTypeOf<illustrations.SvgInstance>().toEqualTypeOf<core.SvgInstance>();
    expectTypeOf<illustrations.KawaiiMood>().toEqualTypeOf<core.KawaiiMood>();
    expectTypeOf<illustrations.KawaiiIllustrationType>().toEqualTypeOf<core.KawaiiIllustrationType>();
    expectTypeOf<illustrations.SvgSource>().toEqualTypeOf<core.SvgSource>();
    expectTypeOf<baseTypes.IconState>().toEqualTypeOf<core.IconState>();
    expectTypeOf<externalIcons.IconSource>().toEqualTypeOf<core.IconSource>();
    expectTypeOf<tabTypes.BackgroundColorOption>().toEqualTypeOf<core.BackgroundColorOption>();
  });

  it('keeps the core free of a schema dependency without letting the credit shape drift', () => {
    // The core cannot import the schema's type, so it mirrors it; this is the only guard.
    expectTypeOf<
      NonNullable<core.UserImageInstance['attribution']>
    >().toEqualTypeOf<StockImageAttribution>();
  });

  it('hands out the same constants, not copies', () => {
    expect(canvasAssets.ASSET_TARGET_SIZE).toBe(core.ASSET_TARGET_SIZE);
    expect(textAlign.TEXT_ALIGNS).toBe(core.TEXT_ALIGNS);
  });
});
