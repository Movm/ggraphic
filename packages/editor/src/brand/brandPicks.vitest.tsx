// SPDX-License-Identifier: MPL-2.0
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { brandDefault, type BrandPack, type Bindings } from '@ggraphic/core';
import { activeBrand, registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { FloatingColorPicker } from '@ggraphic/editor/components/TopBar/modules/FloatingColorPicker';
import { useFloatingModuleHandlers } from '@ggraphic/editor/hooks/useFloatingModuleHandlers';
import { IllustrationSettings } from '@ggraphic/editor/sidebar/sections/IllustrationSettings';
import { asColorOptions } from '@ggraphic/editor/utils/colorOptions';

import type { FullCanvasConfig } from '@ggraphic/editor/configs/types';
import type { FloatingModuleState } from '@ggraphic/editor/hooks/useFloatingModuleState';
import type { KawaiiInstance } from '@ggraphic/editor/utils/illustrations/types';

type State = Record<string, unknown>;

const SWATCH = { id: 'primary', label: 'Primär', color: '#1d3557', ref: 'brand.primary' } as const;
const PACK: BrandPack = { ...brandDefault, palette: [SWATCH], textPalette: [SWATCH] };
const BOUND: Bindings = {
  fill: { ref: 'brand.primary', value: '#1d3557' },
  shadowColor: { ref: 'brand.accent', value: '#ffcc00' },
};

const original = activeBrand();
beforeEach(() => registerBrandPacks([PACK]));
afterEach(() => registerBrandPacks([original]));

function setup(module: FloatingModuleState, state: State = {}, elements: object[] = []) {
  let committed = state;
  const actions = {
    updateShape: vi.fn(),
    updateIcon: vi.fn(),
    updateIllustration: vi.fn(),
    updateAdditionalText: vi.fn(),
    updatePillBadge: vi.fn(),
    updateUserImage: vi.fn(),
  };
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
    })
  );
  return { handlers: result.current, actions, page: () => committed };
}

const shapeModule = { type: 'shape', data: { id: 's1' } } as unknown as FloatingModuleState;
const shapeState = { shapeInstances: [{ id: 's1', fill: '#000000', bind: BOUND }] };

describe('colour options', () => {
  it('asColorOptions copies the ref of a swatch', () => {
    expect(asColorOptions([SWATCH])[0]).toMatchObject({ value: '#1d3557', ref: 'brand.primary' });
  });
});

describe('FloatingColorPicker', () => {
  it('passes the ref of the picked swatch', () => {
    const onColorSelect = vi.fn();
    render(
      <FloatingColorPicker
        currentColor="#000000"
        onColorSelect={onColorSelect}
        isExpanded
        colors={asColorOptions([SWATCH])}
      />
    );
    fireEvent.click(screen.getByLabelText('Primär'));
    expect(onColorSelect).toHaveBeenCalledWith('#1d3557', 'brand.primary');
  });
});

describe('colour picks', () => {
  it('picking a swatch with a ref binds the field', () => {
    const { handlers, actions } = setup(shapeModule, {
      shapeInstances: [{ id: 's1', fill: '#000' }],
    });
    handlers.handleColorSelect('#1d3557', 'brand.primary');
    expect(actions.updateShape).toHaveBeenCalledWith('s1', {
      fill: '#1d3557',
      fillGradient: null,
      bind: { fill: { ref: 'brand.primary', value: '#1d3557' } },
    });
  });

  it('picking a colour without a ref removes that field’s binding and keeps the others', () => {
    const { handlers, actions } = setup(shapeModule, shapeState);
    handlers.handleColorSelect('#abcdef');
    expect(actions.updateShape).toHaveBeenCalledWith('s1', {
      fill: '#abcdef',
      fillGradient: null,
      bind: { shadowColor: BOUND.shadowColor },
    });
  });

  it('picking a free colour on an unbound field adds no bind key', () => {
    const { handlers, actions } = setup(shapeModule, {
      shapeInstances: [{ id: 's1', fill: '#000' }],
    });
    handlers.handleColorSelect('#abcdef');
    expect(actions.updateShape.mock.calls[0]![1]).not.toHaveProperty('bind');
  });

  it('removing the last binding clears bind', () => {
    const { handlers, actions } = setup(shapeModule, {
      shapeInstances: [{ id: 's1', fill: '#000', bind: { fill: BOUND.fill } }],
    });
    handlers.handleColorSelect('#abcdef');
    expect(actions.updateShape.mock.calls[0]![1]).toHaveProperty('bind', undefined);
  });

  it('picking a swatch binds an icon, a text and a badge', () => {
    const icon = setup({ type: 'icon', data: { id: 'i1' } } as unknown as FloatingModuleState);
    icon.handlers.handleColorSelect('#1d3557', 'brand.primary');
    expect(icon.actions.updateIcon).toHaveBeenCalledWith('i1', {
      color: '#1d3557',
      bind: { color: { ref: 'brand.primary', value: '#1d3557' } },
    });

    const text = setup({ type: 'text', data: { id: 't1' } } as unknown as FloatingModuleState, {
      additionalTexts: [{ id: 't1' }],
    });
    text.handlers.handleColorSelect('#1d3557', 'brand.primary');
    expect(text.actions.updateAdditionalText).toHaveBeenCalledWith('t1', {
      fill: '#1d3557',
      fillGradient: null,
      bind: { fill: { ref: 'brand.primary', value: '#1d3557' } },
    });

    const badge = setup({
      type: 'pill-badge',
      data: { id: 'p1' },
    } as unknown as FloatingModuleState);
    badge.handlers.handleColorSelect('#1d3557', 'brand.primary');
    expect(badge.actions.updatePillBadge).toHaveBeenCalledWith('p1', {
      backgroundColor: '#1d3557',
      bind: { backgroundColor: { ref: 'brand.primary', value: '#1d3557' } },
    });
  });

  it('picking a background swatch with a ref binds the page field', () => {
    const { handlers, page } = setup(
      { type: 'background', data: { id: 'bg' } } as unknown as FloatingModuleState,
      { backgroundColor: '#ffffff' },
      [{ id: 'bg', type: 'background', fillStateKey: 'backgroundColor' }]
    );
    handlers.handleColorSelect('#1d3557', 'brand.primary');
    expect(page()).toMatchObject({
      backgroundColor: '#1d3557',
      bind: { backgroundColor: { ref: 'brand.primary', value: '#1d3557' } },
    });
  });

  it('a free pick on the background removes the page binding', () => {
    const { handlers, page } = setup(
      { type: 'background', data: { id: 'bg' } } as unknown as FloatingModuleState,
      {
        backgroundColor: '#1d3557',
        bind: { backgroundColor: { ref: 'brand.primary', value: '#1d3557' } },
      },
      [{ id: 'bg', type: 'background', fillStateKey: 'backgroundColor' }]
    );
    handlers.handleColorSelect('#abcdef');
    expect(page()).toEqual({ backgroundColor: '#abcdef' });
  });
});

describe('shadow and outline picks', () => {
  it('a shadow colour from a free pick removes the shadowColor binding only', () => {
    const { handlers, actions } = setup(shapeModule, shapeState);
    handlers.handleShadowChange('s1', { shadowColor: '#abcdef' }, 'shape');
    expect(actions.updateShape).toHaveBeenCalledWith('s1', {
      shadowColor: '#abcdef',
      bind: { fill: BOUND.fill },
    });
  });

  it('a shadow blur leaves the bindings alone', () => {
    const { handlers, actions } = setup(shapeModule, shapeState);
    handlers.handleShadowChange('s1', { shadowBlur: 8 }, 'shape');
    expect(actions.updateShape).toHaveBeenCalledWith('s1', { shadowBlur: 8 });
  });

  it('an outline colour from a free pick removes the stroke binding', () => {
    const text = {
      type: 'text',
      data: { id: 't1' },
    } as unknown as FloatingModuleState;
    const stroke = { ref: 'brand.accent', value: '#ffcc00' } as const;
    const { handlers, actions } = setup(text, {
      additionalTexts: [{ id: 't1', bind: { stroke } }],
    });
    handlers.handleOutlineChange('t1', { stroke: '#abcdef' });
    const patch = actions.updateAdditionalText.mock.calls[0]![1];
    expect(patch).toEqual({ stroke: '#abcdef', bind: undefined });
    expect(patch).toHaveProperty('bind');
  });
});

describe('IllustrationSettings', () => {
  const illustration = {
    id: 'ill-1',
    illustrationId: 'cat',
    source: 'kawaii',
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    color: '#000000',
    mood: 'happy',
    bind: { color: { ref: 'brand.accent', value: '#ffcc00' } },
  } as unknown as KawaiiInstance;

  it('picking a swatch with a ref binds the colour', () => {
    const onUpdateIllustration = vi.fn();
    render(
      <IllustrationSettings
        selectedIllustration={{ ...illustration, bind: undefined }}
        onUpdateIllustration={onUpdateIllustration}
        onRemoveIllustration={() => {}}
      />
    );
    fireEvent.click(screen.getByTitle('Primär'));
    expect(onUpdateIllustration).toHaveBeenCalledWith('ill-1', {
      color: '#1d3557',
      bind: { color: { ref: 'brand.primary', value: '#1d3557' } },
    });
  });
});
