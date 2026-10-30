// SPDX-License-Identifier: MPL-2.0
import { fireEvent, render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useFloatingModuleHandlers } from '@ggraphic/editor/hooks/useFloatingModuleHandlers';
import { messages } from '@ggraphic/editor/i18n/messages';
import { axe } from '../../../test-utils';

import { FloatingImageLookControl } from './FloatingImageLookControl';

describe('FloatingImageLookControl', () => {
  it('shows the current look and reports a choice', () => {
    const onChange = vi.fn();
    render(<FloatingImageLookControl image={{ grayscale: true }} onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: messages().topBar.imageLook });
    expect((select as HTMLSelectElement).value).toBe('bw');
    fireEvent.change(select, { target: { value: 'darken' } });
    expect(onChange).toHaveBeenCalledWith('darken');
  });

  it('has no axe violations', async () => {
    const { container } = render(<FloatingImageLookControl image={{}} onChange={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('handleImageLookChange', () => {
  it('writes the choice in one updateUserImage call (one history entry)', () => {
    const updateUserImage = vi.fn();
    const img = { id: 'a', grayscale: true, contrast: 6 };
    const { result } = renderHook(() =>
      useFloatingModuleHandlers({
        actions: { updateUserImage },
        state: { userImageInstances: [img], brandScheme: 'dark' },
        config: { elements: [] },
        setState: vi.fn(),
        debouncedSaveToHistory: vi.fn(),
        activeFloatingModule: null,
      } as never)
    );
    result.current.handleImageLookChange('a', 'duotone');
    expect(updateUserImage).toHaveBeenCalledTimes(1);
    expect(updateUserImage.mock.calls[0]![1]).toMatchObject({
      grayscale: false,
      bind: { duotoneLow: { ref: 'duo-low' }, duotoneHigh: { ref: 'duo-high' } },
    });
  });
});
