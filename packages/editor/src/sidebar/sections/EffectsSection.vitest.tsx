// SPDX-License-Identifier: MPL-2.0
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { messages } from '@ggraphic/editor/i18n/messages';
import { EffectsSection } from '@ggraphic/editor/sidebar/sections/EffectsSection';
import { axe } from '../../test-utils';

import type { FloatingModuleState } from '@ggraphic/editor/hooks/useFloatingModuleState';

/** The "Effects" area: gradient, outline and shadow — `effectsFor` decides who has which. */

const t = messages();

const freeText: FloatingModuleState = {
  type: 'text',
  data: { id: 't1', fill: '#005538', isInstanceText: true },
};
const templateText: FloatingModuleState = { type: 'text', data: { id: 't2', fill: '#005538' } };
const line: FloatingModuleState = { type: 'shape', data: { id: 's1', type: 'line' } };

const handlers = () => ({
  onGradientChange: vi.fn(),
  onOutlineChange: vi.fn(),
  onShadowChange: vi.fn(),
});

describe('EffectsSection', () => {
  it('shows a free text gradient, outline and shadow', async () => {
    const h = handlers();
    const { baseElement } = render(<EffectsSection module={freeText} {...h} />);
    for (const name of [t.topBar.gradient, t.topBar.outline, t.topBar.shadow]) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    await userEvent.click(
      screen.getByRole('button', {
        name: `${t.topBar.outline}: ${t.sidebar.imageAdjust.enable}`,
      })
    );
    expect(h.onOutlineChange).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ strokeWidth: 2 })
    );
    expect(await axe(baseElement)).toHaveNoViolations();
  });

  it('gives a line only the shadow', () => {
    render(<EffectsSection module={line} {...handlers()} />);
    expect(screen.getByRole('heading', { name: t.topBar.shadow })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: t.topBar.gradient })).toBeNull();
    expect(screen.queryByRole('heading', { name: t.topBar.outline })).toBeNull();
  });

  // The editor then closes the area; empty, it draws nothing.
  it('draws nothing when the selection has no effects', () => {
    const { container } = render(<EffectsSection module={templateText} {...handlers()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
