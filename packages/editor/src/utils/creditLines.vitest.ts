// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { creditLines } from './photoCredits.js';

const lets = {
  kind: 'iconify',
  prefix: 'lets',
  name: 'tree',
  setTitle: 'Lets Icons',
  licence: 'CC-BY-4.0',
  author: 'Leonid Tsvetkov',
};

describe('creditLines', () => {
  it('is empty for a design without credits', () => {
    expect(creditLines([{ selectedIcons: [], iconStates: {} }])).toBe('');
  });

  it('puts the photo line above the icon line', () => {
    const page = {
      imageAttribution: {
        photographer: 'Ann',
        photoUrl: 'https://unsplash.com/photos/a',
      },
      selectedIcons: ['iconify:lets:tree'],
      iconStates: { 'iconify:lets:tree': { source: lets } },
    };
    expect(creditLines([page])).toBe(
      'Foto: Ann auf Unsplash\nIcon: Lets Icons von Leonid Tsvetkov (CC-BY-4.0, https://spdx.org/licenses/CC-BY-4.0.html)'
    );
  });

  it('credits a set once across the pages of a deck', () => {
    const page = {
      selectedIcons: ['iconify:lets:tree'],
      iconStates: { 'iconify:lets:tree': { source: lets } },
    };
    expect(creditLines([page, page])).toBe(
      'Icon: Lets Icons von Leonid Tsvetkov (CC-BY-4.0, https://spdx.org/licenses/CC-BY-4.0.html)'
    );
  });
});
