// SPDX-License-Identifier: AGPL-3.0-only
import { SidebarSlider } from '../../entries/sidebar.js';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

describe('SidebarSlider', () => {
  it.each([
    ['%', 0.5, '50 %'],
    ['px', 12, '12 px'],
    ['°', 45, '45 °'],
    ['', 3, '3'],
  ])('nennt den Wert mit Einheit %s', (unit, value, expected) => {
    render(
      <SidebarSlider label="Wert" value={value} onValueChange={vi.fn()} max={100} unit={unit} />
    );
    expect(screen.getByRole('slider', { name: 'Wert' })).toHaveAttribute(
      'aria-valuetext',
      expected
    );
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <SidebarSlider label="Grösse" value={12} onValueChange={vi.fn()} max={100} unit="px" />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
