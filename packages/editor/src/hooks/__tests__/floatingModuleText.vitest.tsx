// SPDX-License-Identifier: MPL-2.0
/**
 * Die Format-Knöpfe eines nur ausgewählten Textes lesen den gespeicherten Text aus den
 * Leisten-Daten: bei freien Texten und bei bearbeitbaren Texten der Vorlage, nirgends sonst.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useFloatingModuleState } from '../useFloatingModuleState.js';

import type { FullCanvasConfig, LayoutResult } from '../../configs/types.js';

type State = Record<string, unknown>;

const layout = {} as LayoutResult;
const textElement = (editable: boolean) =>
  ({
    id: 'headline',
    type: 'text',
    textKey: 'headlineText',
    fontSize: 40,
    fontFamily: 'Instrument Sans, Arial, sans-serif',
    ...(editable && { editable: true }),
  }) as const;

function select(selectedElement: string, initial: State, editable = true) {
  const config = { elements: [textElement(editable)] } as unknown as FullCanvasConfig<State>;
  return renderHook(
    ({ state }) => useFloatingModuleState({ selectedElement, config, state, layout }),
    { initialProps: { state: initial } }
  );
}

const free = (patch: object = {}): State => ({
  additionalTexts: [{ id: 't1', text: 'Hallo', fontSize: 40, ...patch }],
});

describe('the text in the floating module of a free text', () => {
  it('carries the stored text', () => {
    expect(select('t1', free()).result.current!.data.text).toBe('Hallo');
  });

  it('says whether the text brings an accent or a marker style of its own', () => {
    const plain = select('t1', free()).result.current!.data;
    expect([plain.hasAccent, plain.hasMarker]).toEqual([false, false]);
    const styled = select('t1', free({ accentFill: '#E6007E', markerFill: '#FFFFFF' })).result
      .current!.data;
    expect([styled.hasAccent, styled.hasMarker]).toEqual([true, true]);
  });

  it('has none for a page counter, which is not edited', () => {
    expect(select('t1', free({ counter: 'page' })).result.current!.data.text).toBeUndefined();
  });

  it('is new when the text changes, without the selection changing', () => {
    const { result, rerender } = select('t1', free());
    rerender({ state: free({ text: '**Hallo**' }) });
    expect(result.current!.data.text).toBe('**Hallo**');
  });
});

describe('the text in the floating module of a text of the template', () => {
  it('carries the text of its state key and the font, where the field is edited', () => {
    const { data } = select('headline', { headlineText: 'Klima' }).result.current!;
    expect(data.text).toBe('Klima');
    expect(data.fontFamily).toBe('Instrument Sans, Arial, sans-serif');
    expect([data.hasAccent, data.hasMarker]).toEqual([undefined, undefined]);
  });

  it('is an empty text while the state holds none yet', () => {
    expect(select('headline', {}).result.current!.data.text).toBe('');
  });

  it('has none where the field is not edited', () => {
    expect(
      select('headline', { headlineText: 'Klima' }, false).result.current!.data.text
    ).toBeUndefined();
  });

  it('is new when the text changes, without the selection changing', () => {
    const { result, rerender } = select('headline', { headlineText: 'Klima' });
    rerender({ state: { headlineText: '**Klima**' } });
    expect(result.current!.data.text).toBe('**Klima**');
  });
});
