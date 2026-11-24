// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The text colour of a whole text element against an accent in its own colour.
 *
 * An accent with a colour (`=={#RRGGBB}…==`) is how a part of a text gets a colour of its own. Put
 * over the whole text, it is the colour the text shows, and the text colour (`fill`) lies hidden
 * beneath it: the colour button then showed one colour, the page another, and no pick changed
 * what the page showed.
 */
import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ContextControls } from '../../components/TopBar/ContextControls.js';
import { useFloatingModuleHandlers } from '../useFloatingModuleHandlers.js';

import type { FullCanvasConfig } from '../../configs/types.js';
import type { FloatingModuleState } from '../useFloatingModuleState.js';

type State = Record<string, unknown>;

const COVERED = '=={#005538}Wir machen Solar auf jedem öffentlichen Gebäude möglich.==';

function setup(module: FloatingModuleState, state: State, elements: object[] = []) {
  let committed = state;
  const actions = { updateAdditionalText: vi.fn() };
  const callbacks = { onSubtextChange: vi.fn() };
  const { result } = renderHook(() =>
    useFloatingModuleHandlers({
      activeFloatingModule: module,
      actions,
      config: { elements } as unknown as FullCanvasConfig<State, typeof actions>,
      state,
      setState: (next) => {
        committed = typeof next === 'function' ? next(committed) : { ...committed, ...next };
      },
      debouncedSaveToHistory: () => {},
      callbacks,
    })
  );
  return { handlers: result.current, actions, callbacks, page: () => committed };
}

const textModule = (id: string, text: string, fill: string) =>
  ({ type: 'text', data: { id, text, fill } }) as unknown as FloatingModuleState;

describe('picking the text colour of a free text', () => {
  it('takes off the coloured accent that covers the text, in the same step', () => {
    const { handlers, actions } = setup(textModule('t1', COVERED, '#FFFFFF'), {
      additionalTexts: [{ id: 't1', text: COVERED, fill: '#FFFFFF' }],
    });
    handlers.handleColorSelect('#FFFFFF');
    expect(actions.updateAdditionalText).toHaveBeenCalledTimes(1);
    expect(actions.updateAdditionalText).toHaveBeenCalledWith('t1', {
      fill: '#FFFFFF',
      fillGradient: null,
      text: 'Wir machen Solar auf jedem öffentlichen Gebäude möglich.',
    });
  });

  it('keeps an accent in the colour of the template and leaves the text untouched', () => {
    const text = 'Sonne für ==alle==';
    const { handlers, actions } = setup(textModule('t1', text, '#FFFFFF'), {
      additionalTexts: [{ id: 't1', text, fill: '#FFFFFF' }],
    });
    handlers.handleColorSelect('#000000');
    expect(actions.updateAdditionalText.mock.calls[0]![1]).not.toHaveProperty('text');
  });
});

describe('picking the text colour of a template text field', () => {
  const element = {
    id: 'subtext-text',
    type: 'text',
    textKey: 'subtext',
    fillStateKey: 'secondaryColor',
  };

  it('writes colour and text together and hands the text to the field’s callback', () => {
    const { handlers, callbacks, page } = setup(
      textModule('subtext-text', COVERED, '#FFFFFF'),
      { subtext: COVERED, secondaryColor: '#FFFFFF' },
      [element]
    );
    handlers.handleColorSelect('#000000');
    const plain = 'Wir machen Solar auf jedem öffentlichen Gebäude möglich.';
    expect(page()).toMatchObject({ subtext: plain, secondaryColor: '#000000' });
    expect(callbacks.onSubtextChange).toHaveBeenCalledWith(plain);
  });

  it('calls no text callback when the text has no coloured accent', () => {
    const { handlers, callbacks, page } = setup(
      textModule('subtext-text', 'Hallo', '#FFFFFF'),
      { subtext: 'Hallo', secondaryColor: '#FFFFFF' },
      [element]
    );
    handlers.handleColorSelect('#000000');
    expect(page()).toMatchObject({ subtext: 'Hallo', secondaryColor: '#000000' });
    expect(callbacks.onSubtextChange).not.toHaveBeenCalled();
  });
});

describe('the colour button of a text', () => {
  const renderBar = (module: FloatingModuleState) =>
    render(
      <ContextControls
        selectedElement={module.data.id}
        activeFloatingModule={module}
        canMoveUp={false}
        canMoveDown={false}
        canDuplicate={false}
        handlers={{
          handleMoveLayer: () => {},
          handleDuplicate: () => {},
          handleColorSelect: () => {},
          handleOpacityChange: () => {},
          handleFontSizeChange: () => {},
        }}
      />
    );

  const swatchColour = () =>
    screen
      .getAllByRole('button')
      .map((b) => b.querySelector<HTMLElement>('[style*="background"]')?.style.backgroundColor)
      .find(Boolean);

  it('shows the colour of an accent that covers the whole text', () => {
    renderBar(textModule('t1', COVERED, '#FFFFFF'));
    expect(swatchColour()).toBe('rgb(0, 85, 56)');
  });

  it('shows the text colour when no coloured accent covers the text', () => {
    renderBar(textModule('t1', 'Sonne für =={#005538}alle==', '#FFFFFF'));
    expect(swatchColour()).toBe('rgb(255, 255, 255)');
  });
});
