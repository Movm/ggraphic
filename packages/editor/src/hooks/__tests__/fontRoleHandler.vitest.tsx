// SPDX-License-Identifier: AGPL-3.0-only
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useCanvasElementHandlers } from '../useCanvasElementHandlers.js';

import type { FullCanvasConfig, LayoutResult } from '../../configs/types.js';
import type { OptionalCanvasActions } from '../useCanvasElementHandlers.js';

type State = Record<string, unknown>;

function handlersWith(actions: OptionalCanvasActions) {
  const { result } = renderHook(() =>
    useCanvasElementHandlers({
      config: {
        elements: [{ id: 'headline', type: 'text', textKey: 'headline' }],
      } as unknown as FullCanvasConfig<State, OptionalCanvasActions>,
      state: { additionalTexts: [{ id: 'free-1' }] },
      setState: () => {},
      actions,
      layout: {} as LayoutResult,
      callbacks: {},
      selectElement: () => {},
      updateElementPosition: () => {},
      saveToHistory: () => {},
      debouncedSaveToHistory: () => {},
    })
  );
  return result.current;
}

describe('handleFontRoleChange', () => {
  it('hands a free text and its role to the host action', () => {
    const setAdditionalTextFontRole = vi.fn();
    handlersWith({ setAdditionalTextFontRole }).handleFontRoleChange('free-1', 'serif');
    expect(setAdditionalTextFontRole).toHaveBeenCalledExactlyOnceWith('free-1', 'serif');
  });

  it('leaves a template text alone', () => {
    const setAdditionalTextFontRole = vi.fn();
    handlersWith({ setAdditionalTextFontRole }).handleFontRoleChange('headline', 'serif');
    expect(setAdditionalTextFontRole).not.toHaveBeenCalled();
  });

  it('does nothing when the host has no such action', () => {
    expect(() => handlersWith({}).handleFontRoleChange('free-1', 'serif')).not.toThrow();
  });
});
