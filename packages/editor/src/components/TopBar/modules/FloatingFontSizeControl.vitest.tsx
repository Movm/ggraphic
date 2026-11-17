// SPDX-License-Identifier: AGPL-3.0-only
/** The size field takes a typed number, and follows a corner drag while the pointer is down. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { setLiveFontSize } from '../../../hooks/useLiveFontSize.js';
import { messages } from '../../../i18n/messages.js';
import { FloatingFontSizeControl } from './FloatingFontSizeControl.js';

function setup(fontSize = 40) {
  const onFontSizeChange = vi.fn();
  render(
    <FloatingFontSizeControl
      elementId="t1"
      fontSize={fontSize}
      onFontSizeChange={onFontSizeChange}
    />
  );
  const input = screen.getByRole('textbox', { name: messages().topBar.fontSizeInput });
  return { input: input as HTMLInputElement, onFontSizeChange };
}

describe('FloatingFontSizeControl', () => {
  it('applies a typed size on Enter', () => {
    const { input, onFontSizeChange } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '72' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onFontSizeChange).toHaveBeenCalledWith(72);
  });

  it('applies on blur and accepts a decimal comma', () => {
    const { input, onFontSizeChange } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '55,6' } });
    fireEvent.blur(input);
    expect(onFontSizeChange).toHaveBeenCalledWith(56);
  });

  it('drops the draft on Escape and ignores what is not a number', () => {
    const { input, onFontSizeChange } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(onFontSizeChange).not.toHaveBeenCalled();
    expect(input.value).toBe('40');
  });

  it('steps with the arrow keys, by ten with shift', () => {
    const { input, onFontSizeChange } = setup();
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowDown', shiftKey: true });
    expect(onFontSizeChange.mock.calls).toEqual([[41], [30]]);
  });

  it('shows the live size of a corner drag on its own text only', () => {
    const { input } = setup();
    act(() => setLiveFontSize({ id: 'other', size: 90 }));
    expect(input.value).toBe('40');
    act(() => setLiveFontSize({ id: 't1', size: 90 }));
    expect(input.value).toBe('90');
    act(() => setLiveFontSize(null));
    expect(input.value).toBe('40');
  });
});
