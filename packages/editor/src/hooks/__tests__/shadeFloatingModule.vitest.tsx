// SPDX-License-Identifier: MPL-2.0
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useFloatingModuleHandlers } from '../useFloatingModuleHandlers.js';

import type { GradientFill } from '../../utils/gradientFill.js';
import type { FullCanvasConfig } from '../../configs/types.js';
import type { FloatingModuleState } from '../useFloatingModuleState.js';

type State = Record<string, unknown>;

function setup() {
  const actions = { updateShape: vi.fn() };
  const { result } = renderHook(() =>
    useFloatingModuleHandlers({
      activeFloatingModule: { type: 'shape', data: { id: 's1' } } as unknown as FloatingModuleState,
      actions,
      config: { elements: [] } as unknown as FullCanvasConfig<State, typeof actions>,
      state: { shapeInstances: [{ id: 's1', fill: '#000000', shade: 'bottom' }] },
      setState: () => {},
      debouncedSaveToHistory: () => {},
    })
  );
  return { handlers: result.current, actions };
}

describe('a shade shape in the floating toolbar', () => {
  it('picking a gradient takes over: shade is cleared in the same update', () => {
    const { handlers, actions } = setup();
    const gradient: GradientFill = {
      type: 'linear',
      angle: 0,
      stops: [{ offset: 0, color: '#fff' }],
    };
    handlers.handleGradientSelect(gradient);
    expect(actions.updateShape).toHaveBeenCalledWith('s1', {
      fillGradient: gradient,
      shade: null,
      glow: false,
    });
  });

  it('picking a flat colour keeps the shade (it rebuilds from the new fill)', () => {
    const { handlers, actions } = setup();
    handlers.handleColorSelect('#ff0000');
    const patch = actions.updateShape.mock.calls[0]![1] as Record<string, unknown>;
    expect(patch['fill']).toBe('#ff0000');
    expect('shade' in patch).toBe(false);
  });
});
