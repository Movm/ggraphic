// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Die Leiste liest Schrift und Rolle eines freien Textes aus den Leisten-Daten. Die behalten ihre
 * Referenz, solange sich nichts Abgeleitetes ändert — und müssen sich ändern, wenn die Rolle wechselt.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useFloatingModuleState } from '../useFloatingModuleState.js';

import type { FullCanvasConfig, LayoutResult } from '../../configs/types.js';

type State = Record<string, unknown>;

const config = { elements: [] } as unknown as FullCanvasConfig<State>;
const layout = {} as LayoutResult;
const HEADLINE = {
  fontFamily: 'Bricolage Grotesque, Arial, sans-serif',
  bind: { fontFamily: { ref: 'font.headline', value: 'Bricolage Grotesque' } },
};
const CONDENSED = {
  fontFamily: 'Anton, Arial, sans-serif',
  bind: { fontFamily: { ref: 'font.condensed', value: 'Anton' } },
};
const stateWith = (font: object): State => ({
  additionalTexts: [{ id: 't1', text: 'Hallo', fontSize: 40, ...font }],
});

function select(initial: State) {
  return renderHook(
    ({ state }) => useFloatingModuleState({ selectedElement: 't1', config, state, layout }),
    { initialProps: { state: initial } }
  );
}

describe('the floating module of a free text follows its font role', () => {
  it('carries the family and the binding of the text', () => {
    const { result } = select(stateWith(HEADLINE));
    expect(result.current!.data.fontFamily).toBe(HEADLINE.fontFamily);
    expect(result.current!.data.bind).toEqual(HEADLINE.bind);
  });

  it('is new when the role changes, without the selection changing', () => {
    const { result, rerender } = select(stateWith(HEADLINE));
    rerender({ state: stateWith(CONDENSED) });
    expect(result.current!.data.fontFamily).toBe(CONDENSED.fontFamily);
    expect(result.current!.data.bind).toEqual(CONDENSED.bind);
  });

  it('is new when only the binding changes', () => {
    // A family that stayed while the text was bound to another role of it.
    const { result, rerender } = select(stateWith({ ...HEADLINE, bind: undefined }));
    rerender({ state: stateWith(HEADLINE) });
    expect(result.current!.data.bind).toEqual(HEADLINE.bind);
  });

  it('keeps its reference while nothing about the text changes', () => {
    const { result, rerender } = select(stateWith(HEADLINE));
    const first = result.current;
    rerender({ state: stateWith(HEADLINE) });
    expect(result.current).toBe(first);
  });
});
