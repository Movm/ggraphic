// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Every default an editor panel or factory offers comes from the brand of the
 * DOCUMENT, not from the first registered pack: shape tiles, chart tiles,
 * swatch names and the text marker, on the canvas and in the PPTX export, and
 * what the action factories put on a page. Each case uses `PACK_B` while the
 * registry is `[PACK_A, PACK_B]`, so `activeBrand()` is `PACK_A` throughout.
 */
import { render } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { activeBrand, registerBrandPacks } from './brandRegistry.js';
import { DocumentBrandContext } from './documentBrand.js';
import { Marker } from '../components/markerMark.js';
import { createElementActions } from '../configs/factory/actionFactories.js';
import { textParagraphs } from '../export/pptx/textModel.js';
import { shapeItems } from '../sidebar/sections/assets/useElementCatalog.js';
import { ChartTypePreview } from '../sidebar/sections/ChartsSection.js';
import { ALL_PALETTE_SHAPES, getShapeVariant } from '../sidebar/sections/ShapesSection.js';
import { colorName } from '../utils/colorNames.js';
import { createCircleBadgeInstance } from '../utils/circleBadgeUtils.js';
import { createFrameInstance } from '../utils/frameUtils.js';
import { markerBoxes } from '../utils/markerBoxes.js';
import { defaultTextMarker, markerInkOn } from '../utils/markerColors.js';
import { createPillBadgeInstance } from '../utils/pillBadgeUtils.js';
import { createShape } from '../utils/shapes.js';

import { PACK_A, PACK_B } from '../testing/documentBrandPacks.js';

import type { BaseCanvasState } from '../configs/factory/baseTypes.js';

const lower = (values: readonly string[]) => values.map((v) => v.toLowerCase());
const B_ROLES = lower([
  PACK_B.colors.primary,
  PACK_B.colors.secondary,
  PACK_B.colors.accent,
  PACK_B.colors.accentOnLight,
  PACK_B.colors.attention,
]);
const A_ONLY = lower(PACK_A.palette.map((c) => c.color)).filter(
  (value) => !lower(PACK_B.palette.map((c) => c.color)).includes(value)
);

beforeAll(() => {
  registerBrandPacks([PACK_A, PACK_B]);
});

describe('shape tiles cycle the colours of the document brand', () => {
  const cycle = (brand: typeof PACK_A) =>
    ALL_PALETTE_SHAPES.filter((s) => !s.id.startsWith('hand-marker')).map((s) =>
      getShapeVariant(s.id, brand).color.toLowerCase()
    );

  it('another pack: its own colour roles, none of the first pack', () => {
    expect(new Set(cycle(PACK_B))).toEqual(new Set(B_ROLES));
  });

  it('the first pack: unchanged', () => {
    expect(cycle(PACK_A).slice(0, 5)).toEqual(
      lower([
        PACK_A.colors.primary,
        PACK_A.colors.secondary,
        PACK_A.colors.accent,
        PACK_A.colors.accentOnLight,
        PACK_A.colors.attention,
      ])
    );
  });

  it('a text-marker shape takes the first marker box of the pack', () => {
    expect(getShapeVariant('hand-marker', PACK_B).color).toBe(PACK_B.markers.swatches[0]!.color);
  });

  it('the Elemente tiles insert what they show', () => {
    for (const item of shapeItems(PACK_B)) {
      if (item.action.kind !== 'shape') throw new Error('not a shape tile');
      expect(A_ONLY).not.toContain(item.action.color?.toLowerCase());
    }
  });

  it('a shape created for the pack starts a marker shape in its box', () => {
    const shape = createShape('hand-marker', 0, 0, '#000000', undefined, PACK_B);
    expect(shape.fill).toBe(PACK_B.markers.swatches[0]!.color);
  });
});

describe('chart tiles draw the chart series of the document brand', () => {
  it('another pack', () => {
    const { container } = render(
      <DocumentBrandContext.Provider value={PACK_B}>
        <ChartTypePreview type="bar" />
      </DocumentBrandContext.Provider>
    );
    const fills = [...container.querySelectorAll('rect')].map((r) => r.getAttribute('fill'));
    expect(fills.slice(0, 3)).toEqual(PACK_B.chart.slice(0, 3));
  });
});

describe('swatch names', () => {
  it('name a colour of the document pack', () => {
    expect(colorName('#F9A03F', PACK_B)).toBe('Amber');
  });

  it('keep the name another pack gives a shared effect swatch', () => {
    // Night is in the first pack only; the document's pack lacks it.
    expect(colorName(PACK_A.colors.primary, PACK_B)).toBe('Night');
  });

  it('say "Farbe #HEX" from the catalogue where no pack knows the colour', () => {
    expect(colorName('#123456', PACK_B)).toBe('Farbe #123456');
  });
});

describe('text markers ink and box in the document brand', () => {
  it('a freely picked light box gets the dark ink of the pack', () => {
    expect(markerInkOn('#FFFFFF', PACK_B)).toBe(PACK_B.markers.ink);
    expect(markerInkOn('#FFFFFF', PACK_A)).toBe(PACK_A.markers.ink);
    expect(markerInkOn('#FFFFFF')).toBe(activeBrand().markers.ink);
  });

  it('markerBoxes passes the pack through to the ink', () => {
    const line = {
      indent: 0,
      runs: [{ text: 'Hallo', x: 0, width: 50, marker: true, markerColor: '#FFFFFF' }],
    };
    const [box] = markerBoxes([line] as never, () => 10, defaultTextMarker(PACK_B), {
      fontSize: 40,
      lineHeightPx: 48,
      top: 0,
      originX: [0],
      brand: PACK_B,
    });
    expect(box?.ink).toBe(PACK_B.markers.ink);
  });

  it('the editing view writes the ink of the configured pack', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, Marker.configure({ brand: PACK_B })],
      content: '<p><mark data-marker data-color="#FFFFFF">Hallo</mark></p>',
    });
    expect(editor.getHTML()).toContain(`--mark-ink: ${PACK_B.markers.ink}`);
    editor.destroy();
  });

  it('the PPTX export boxes and inks a marker in the pack', () => {
    const text = { id: 't', text: '++Hallo++', fill: '#FFFFFF' } as never;
    const [run] = textParagraphs(text, PACK_B)[0]?.runs ?? [];
    expect(run?.highlight).toBe(PACK_B.markers.swatches[0]?.color);
    expect(run?.color).toBe(PACK_B.markers.ink);
  });
});

describe('the element factories take the brand of the document', () => {
  it('create badges and frames in the colours of the pack', () => {
    expect(createPillBadgeInstance('slider', {}, PACK_B).backgroundColor).toBe(
      PACK_B.colors.primary
    );
    expect(createCircleBadgeInstance('default', {}, PACK_B).backgroundColor).toBe(
      PACK_B.colors.primary
    );
    expect(createFrameInstance('circle', 0, 0, PACK_B).borderColor).toBe(PACK_B.colors.primary);
  });

  /** The state `createElementActions` writes into, with the history calls stubbed. */
  function actionsFor(brand: typeof PACK_A | undefined, chartColors?: readonly string[]) {
    let state = {
      additionalTexts: [],
      shapeInstances: [],
      pillBadgeInstances: [],
      circleBadgeInstances: [],
      chartInstances: [],
      frameInstances: [],
    } as unknown as BaseCanvasState;
    const actions = createElementActions<BaseCanvasState>(
      () => state,
      (partial) => {
        state = typeof partial === 'function' ? partial(state) : { ...state, ...partial };
      },
      vi.fn(),
      vi.fn(),
      1000,
      1000,
      '#ffffff',
      chartColors,
      1,
      ...(brand ? [brand] : [])
    );
    return { actions, read: () => state };
  }

  it('put the pack into new badges, charts, frames, shapes and texts', () => {
    const { actions, read } = actionsFor(PACK_B);
    actions.addPillBadge();
    actions.addCircleBadge();
    actions.addChart('bar');
    actions.addFrame('circle');
    actions.addShape('hand-marker');
    actions.addHeader();
    const state = read();
    expect(state.pillBadgeInstances[0]!.backgroundColor).toBe(PACK_B.colors.primary);
    expect(state.circleBadgeInstances[0]!.backgroundColor).toBe(PACK_B.colors.primary);
    expect(state.chartInstances[0]!.colors).toEqual(PACK_B.chart);
    expect(state.frameInstances[0]!.borderColor).toBe(PACK_B.colors.primary);
    expect(state.shapeInstances[0]!.fill).toBe(PACK_B.markers.swatches[0]!.color);
    expect(state.additionalTexts[0]!.fontFamily).toContain(PACK_B.fonts.headline);
  });

  it('keep an explicit chart palette ahead of the brand', () => {
    const { actions, read } = actionsFor(PACK_B, ['#111111', '#222222']);
    actions.addChart('bar');
    expect(read().chartInstances[0]!.colors).toEqual(['#111111', '#222222']);
  });

  it('fall back to the active brand where no pack is given', () => {
    const { actions, read } = actionsFor(undefined);
    actions.addPillBadge();
    actions.addChart('bar');
    expect(read().pillBadgeInstances[0]!.backgroundColor).toBe(activeBrand().colors.primary);
    expect(read().chartInstances[0]!.colors).toEqual(activeBrand().chart);
  });
});
