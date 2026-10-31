// SPDX-License-Identifier: AGPL-3.0-only
import { type BrandPack } from '@ggraphic/core';
import { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { TEMPLATE_GATE_ADAPTER } from '@ggraphic/editor/templates/templateGeometry';
import { afterEach, describe, expect, it } from 'vitest';

import { studioBrand } from '../../brand';
import { draftDeckOps } from '../aiDraft';
import { rebindStudioDocument } from '../rebind';

import { createStudioActions } from './actions';
import { catalogTemplate } from './catalog';
import { withHuggedPlates } from './hug';
import { templatePageState } from './instantiate';
import { type StudioPageState } from './pageState';

afterEach(() => registerBrandPacks([studioBrand]));

type El = Record<string, number | string>;
const brandWith = (headline: string): BrandPack => ({
  ...studioBrand,
  id: `hug-${headline}`,
  fonts: { ...studioBrand.fonts, headline },
});
const ANTON = brandWith('Anton');
const FRAUNCES = brandWith('Fraunces');

const kicker = () => catalogTemplate('studio-study-kicker-boxes')!;
const byId = (state: Record<string, unknown>, key: string, id: string) =>
  (state[key] as El[]).find((e) => e['id'] === id)!;
const box = (state: Record<string, unknown>, key: string, id: string) =>
  TEMPLATE_GATE_ADAPTER.box(key, byId(state, key, id), 1)!;

describe('placing a template with hugging plates', () => {
  it('sizes each box plate to its line: text height plus padding, as wide as the text', () => {
    const state = templatePageState(kicker(), 'post-portrait')!;
    for (const n of [1, 2, 3]) {
      const text = byId(state, 'additionalTexts', `line-${n}`);
      const plate = box(state, 'shapeInstances', `plate-${n}`);
      const hug = byId(state, 'shapeInstances', `plate-${n}`)['hug'] as unknown as {
        padX: number;
        padY: number;
      };
      const pad = hug.padX;
      const textBox = TEMPLATE_GATE_ADAPTER.box('additionalTexts', text, 1)!;
      const line = TEMPLATE_GATE_ADAPTER.textExtent!(text)!;
      expect(plate.height).toBeCloseTo(textBox.height + 2 * hug.padY, 0);
      expect(plate.x).toBeCloseTo(textBox.x - pad, 0);
      // The plate ends where the measured line ends, not at the end of the text box.
      expect(plate.width).toBeCloseTo(line.width + 2 * pad, -1);
      expect(plate.x + plate.width).toBeGreaterThanOrEqual(textBox.x + line.width + pad - 1);
    }
  });

  it('grows with a bigger fitted font and shrinks with a smaller one', () => {
    const heightIn = (brand: BrandPack) => {
      const state = templatePageState(kicker(), 'post-portrait', { brand })!;
      const text = byId(state, 'additionalTexts', 'line-1');
      return { size: text['fontSize'] as number, plate: box(state, 'shapeInstances', 'plate-1') };
    };
    const a = heightIn(ANTON);
    const f = heightIn(FRAUNCES);
    expect(a.size).not.toBe(f.size);
    // lineHeight 1: the plate is the font size plus the same padding in both.
    expect(a.plate.height - f.plate.height).toBeCloseTo(a.size - f.size, 0);
  });

  it('follows a brand switch', () => {
    const doc = {
      formatId: 'post-portrait',
      pages: [
        {
          configId: 'x',
          state: templatePageState(kicker(), 'post-portrait', { brand: ANTON })!,
        },
      ],
    };
    const next = rebindStudioDocument(doc, { brand: FRAUNCES }).doc.pages[0]!.state;
    const fresh = templatePageState(kicker(), 'post-portrait', { brand: FRAUNCES })!;
    expect(box(next, 'shapeInstances', 'plate-1')).toEqual(box(fresh, 'shapeInstances', 'plate-1'));
    expect(box(next, 'shapeInstances', 'plate-1').width).not.toBe(
      box(doc.pages[0]!.state, 'shapeInstances', 'plate-1').width
    );
  });

  it('leaves a template without hug as placed', () => {
    const state = templatePageState(catalogTemplate('studio-headline')!, 'post-portrait')!;
    expect(withHuggedPlates(state)).toBe(state);
  });
});

describe('committing a text edit moves the plate', () => {
  function setup() {
    let state = templatePageState(kicker(), 'post-portrait')! as unknown as StudioPageState;
    const actions = createStudioActions(
      () => state,
      (change) => {
        state = typeof change === 'function' ? change(state) : { ...state, ...change };
      },
      () => undefined,
      () => undefined,
      1080,
      1350
    );
    return { actions, plate: () => box(state as never, 'shapeInstances', 'plate-1') };
  }

  it('narrows the plate with a shorter text and widens it back', () => {
    const { actions, plate } = setup();
    const before = plate().width;
    actions.updateAdditionalText('line-1', { text: 'Hallo' });
    expect(plate().width).toBeLessThan(before / 2);
    actions.updateAdditionalText('line-1', { text: 'One in four families' });
    expect(plate().width).toBe(before);
  });
});

describe('previewing a text edit while it is typed', () => {
  function setup() {
    let state = templatePageState(kicker(), 'post-portrait')! as unknown as StudioPageState;
    let history = 0;
    const actions = createStudioActions(
      () => state,
      (change) => {
        state = typeof change === 'function' ? change(state) : { ...state, ...change };
      },
      () => {
        history++;
      },
      () => {
        history++;
      },
      1080,
      1350
    );
    return {
      actions,
      state: () => state,
      history: () => history,
      plate: () => box(state as never, 'shapeInstances', 'plate-1'),
    };
  }

  it('moves the plate to the draft without a history entry, and the commit lands on the same plate', () => {
    const { actions, state, history, plate } = setup();
    const before = plate().width;
    actions.previewAdditionalText!('line-1', 'Hallo');
    const previewed = plate().width;
    expect(previewed).toBeLessThan(before / 2);
    expect(history()).toBe(0);
    // The draft stays out of the page: only the commit writes the text.
    expect(byId(state() as never, 'additionalTexts', 'line-1')['text']).not.toBe('Hallo');

    actions.updateAdditionalText('line-1', { text: 'Hallo' });
    expect(plate().width).toBe(previewed);
    expect(history()).toBe(1);
  });

  it('reverts to the page as it was when the edit ends unchanged', () => {
    const { actions, state } = setup();
    const before = state();
    actions.previewAdditionalText!('line-1', 'Hallo');
    actions.previewAdditionalText!('line-1', null);
    expect(state().shapeInstances).toEqual(before.shapeInstances);
    expect(state().additionalTexts).toEqual(before.additionalTexts);
  });
});

describe('an AI fill moves the plate', () => {
  it('hugs the filled text', () => {
    const state = templatePageState(
      catalogTemplate('studio-annotated-headline')!,
      'post-portrait'
    )!;
    const before = box(state, 'shapeInstances', 'card').height;
    const ops = draftDeckOps(
      [{ id: 'p', configId: 'c', state }],
      'p',
      { headline: 'Stadt', subline: '' },
      { width: 1080, height: 1350 }
    );
    const filled = ops.updates[0]!.state;
    // One short word is one line where the placeholder takes two.
    expect(box(filled, 'shapeInstances', 'card').height).toBeLessThan(before);
  });
});
