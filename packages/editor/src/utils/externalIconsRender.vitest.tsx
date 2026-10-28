// SPDX-License-Identifier: MPL-2.0
import { beforeEach, describe, expect, it } from 'vitest';

import { generateIconDataUrl, getIconMapSync } from './canvasIcons.js';
import { registerStoredExternalIcons, resetExternalIcons } from './externalIcons.js';
import { resolveIconDef } from './iconInstances.js';

const svg = (d: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path stroke="currentColor" d="${d}"/></svg>`;
const decode = (url: string | null) => Buffer.from(url!.split(',')[1]!, 'base64').toString();

beforeEach(resetExternalIcons);

describe('two documents with different markup for the same external icon id', () => {
  const doc = (d: string) => ({
    selectedIcons: ['iconify:lets:tree'],
    iconStates: { 'iconify:lets:tree': { svg: svg(d) } },
  });

  it('each draws its own svg, whatever was drawn before', async () => {
    const a = doc('M0 0h24');
    const b = doc('M5 5h5');
    registerStoredExternalIcons(a.selectedIcons, a.iconStates);
    registerStoredExternalIcons(b.selectedIcons, b.iconStates);

    const defA = resolveIconDef('iconify:lets:tree', a.iconStates, getIconMapSync());
    const defB = resolveIconDef('iconify:lets:tree', b.iconStates, getIconMapSync());
    expect(defA).not.toBeNull();
    expect(defB).not.toBeNull();

    // Same size and colour: only the content tells the cached data URLs apart.
    expect(decode(await generateIconDataUrl(defA!.id, 64, '#112233'))).toContain('M0 0h24');
    expect(decode(await generateIconDataUrl(defB!.id, 64, '#112233'))).toContain('M5 5h5');
    expect(decode(await generateIconDataUrl(defA!.id, 64, '#112233'))).toContain('M0 0h24');
  });

  it('draws nothing for a document whose copy is not safe', () => {
    const states = { 'iconify:lets:tree': { svg: '<html/>' } };
    registerStoredExternalIcons(['iconify:lets:tree'], states);
    expect(resolveIconDef('iconify:lets:tree', states, getIconMapSync())).toBeNull();
  });
});
