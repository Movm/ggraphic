// SPDX-License-Identifier: MPL-2.0
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as CanvasIcons from '../../utils/canvasIcons.js';

// Hosts mock `@iconify/react` to keep the real `Icon` off the network, often without
// `addCollection`; a registration at import then fails before any of their tests run (#140).
const addCollection = vi.hoisted(() => vi.fn());
vi.mock('@iconify/react', () => ({
  addCollection,
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

const onIconSetLoaded = vi.hoisted(() => vi.fn());
vi.mock('../../utils/canvasIcons.js', async (importOriginal) => ({
  ...(await importOriginal<typeof CanvasIcons>()),
  onIconSetLoaded,
}));

afterEach(cleanup);

describe('icon set registration', () => {
  it('importing the icon UI has no side effect', async () => {
    await import('./assets/ElementThumb.js');
    await import('./IconsSection.js');
    expect(onIconSetLoaded).not.toHaveBeenCalled();
  });

  it('registers the bundled sets once an icon thumb renders', async () => {
    const { ElementThumb } = await import('./assets/ElementThumb.js');
    render(<ElementThumb thumb={{ t: 'icon', iconId: 'tabler:flower' }} />);
    expect(onIconSetLoaded).toHaveBeenCalledWith(addCollection);
  });
});
