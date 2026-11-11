// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Radix gives every popover `role="dialog"`; without a name axe reports
 * `aria-dialog-name` (#4911). Every popover of the context bar therefore
 * carries its visible heading as its name.
 */
import { BackgroundZoomControl } from './FloatingBackgroundControls.js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { axe } from '../../../test-utils';

import type { ReactElement } from 'react';

const cases: Array<{ trigger: string; dialog: string; ui: ReactElement }> = [
  {
    trigger: 'Bild zoomen',
    dialog: 'Zoom',
    ui: <BackgroundZoomControl scale={1} onScaleChange={() => {}} />,
  },
];

describe('floating popovers', () => {
  it.each(cases)('names the $trigger popover', async ({ trigger, dialog, ui }) => {
    const { baseElement } = render(ui);
    await userEvent.click(screen.getByRole('button', { name: trigger }));

    expect(screen.getByRole('dialog', { name: dialog })).toBeTruthy();
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
