// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { createShareSection } from './shareSection.js';

const mit = {
  kind: 'iconify',
  prefix: 'tabler',
  name: 'tree',
  setTitle: 'Tabler Icons',
  licence: 'MIT',
  author: 'Paweł Kuna',
};

describe('share text', () => {
  const section = createShareSection<{ headline: string }>('test', (s) => s.headline);

  it('carries the credit for the icons in the design', () => {
    const props = section.propsFactory(
      {
        headline: 'Bäume pflanzen',
        selectedIcons: ['iconify:tabler:tree'],
        iconStates: { 'iconify:tabler:tree': { source: mit } },
      } as never,
      {} as never
    );
    expect(props.canvasText).toBe(
      'Bäume pflanzen\n\nIcon: Tabler Icons von Paweł Kuna (MIT, https://spdx.org/licenses/MIT.html)'
    );
    expect(props.imageText).toBe('Bäume pflanzen');
  });

  it('adds nothing for a design with bundled icons only', () => {
    const props = section.propsFactory(
      {
        headline: 'Hallo',
        selectedIcons: ['tabler:sun'],
        iconStates: { 'tabler:sun': {} },
      } as never,
      {} as never
    );
    expect(props.canvasText).toBe('Hallo');
  });
});
