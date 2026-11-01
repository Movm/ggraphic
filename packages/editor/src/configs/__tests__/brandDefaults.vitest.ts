// SPDX-License-Identifier: MPL-2.0
/**
 * A NEW element takes its defaults from the document's brand, not from the
 * first registered pack. The tests register `[PACK_A, PACK_B]`, so
 * `activeBrand()` is always `PACK_A`: a page of `PACK_B` used to add its header
 * in the first pack's font. The pack has to come from the page's config.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { registerBrandPacks } from '../../brand/brandRegistry.js';

import { brandTestConfig, type BrandTestState } from '../../testing/documentBrandConfig.js';
import { PACK_A, PACK_B } from '../../testing/documentBrandPacks.js';

import type { BrandPack } from '@ggraphic/core';

beforeAll(() => {
  registerBrandPacks([PACK_A, PACK_B]);
});

/** Real actions over a recorded state. */
function drive(brand: BrandPack | undefined) {
  const config = brandTestConfig('page', brand);
  let state: BrandTestState = config.createInitialState({});
  const actions = config.createActions(
    () => state,
    (partial) => {
      state = typeof partial === 'function' ? partial(state) : { ...state, ...partial };
    },
    () => undefined,
    () => undefined,
    {}
  );
  return { actions, state: () => state };
}

describe.each([
  ['a page without a brand', undefined, PACK_A],
  ['a page of the first pack', PACK_A, PACK_A],
  ['a page of another pack', PACK_B, PACK_B],
] as const)('new elements on %s', (_name, named, pack) => {
  it('adds header, subheader and body text in the pack fonts', () => {
    const { actions, state } = drive(named);
    actions.addHeader();
    actions.addSubheader();
    actions.addText();
    const fonts = Object.fromEntries(
      state()
        .additionalTexts.slice(-3)
        .map((t) => [t.type, t.fontFamily])
    );
    expect(fonts['header']).toBe(`${pack.fonts.headline}, Arial, sans-serif`);
    expect(fonts['subheader']).toBe(`${pack.fonts.headline}, Arial, sans-serif`);
    expect(fonts['body']).toBe(`${pack.fonts.body}, Arial, sans-serif`);
  });

  it('adds a pill badge in the pack colours and headline font', () => {
    const { actions, state } = drive(named);
    actions.addPillBadge();
    actions.addPillBadge('slider-inverted');
    const [pill, inverted] = state().pillBadgeInstances;
    expect(pill).toMatchObject({
      fontFamily: pack.fonts.headline,
      backgroundColor: pack.colors.primary,
    });
    expect(inverted).toMatchObject({
      fontFamily: pack.fonts.headline,
      backgroundColor: pack.colors.surface,
      textColor: pack.colors.primary,
    });
  });

  it('adds a circle badge in the pack colours and headline font', () => {
    const { actions, state } = drive(named);
    actions.addCircleBadge();
    actions.addCircleBadge('default-inverted');
    const [circle, inverted] = state().circleBadgeInstances;
    expect(circle!.backgroundColor).toBe(pack.colors.primary);
    expect(circle!.textLines[0]!.fontFamily).toBe(pack.fonts.headline);
    expect(inverted).toMatchObject({
      backgroundColor: pack.colors.surface,
      textColor: pack.colors.primary,
    });
  });

  it('adds frames, charts and shapes in the pack colours', () => {
    const { actions, state } = drive(named);
    actions.addFrame('square');
    actions.addChart('bar');
    actions.addShape('rect');
    actions.addShape('hand-marker');
    expect(state().frameInstances[0]!.borderColor).toBe(pack.colors.primary);
    expect(state().chartInstances[0]!.colors).toEqual(pack.chart);
    expect(state().shapeInstances[0]!.fill).toBe(pack.palette[0]!.color);
    expect(state().shapeInstances[1]!.fill).toBe(pack.markers.swatches[0]!.color);
  });
});
