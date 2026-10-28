// SPDX-License-Identifier: MPL-2.0
import { beforeEach, describe, expect, it } from 'vitest';

import { resolveIconDef } from './iconInstances.js';

import {
  attributionLine,
  externalIconDefs,
  externalIconDataUrl,
  externalIconId,
  externalIconKey,
  getExternalIcon,
  iconCreditLine,
  isExternalIconId,
  pageIconSources,
  registerExternalIcon,
  registerStoredExternalIcons,
  resetExternalIcons,
  type IconSource,
} from './externalIcons.js';

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path stroke="currentColor" d="M0 0h24"/></svg>';

const source: IconSource = {
  kind: 'iconify',
  prefix: 'lets',
  name: 'tree',
  setTitle: 'Lets Icons',
  licence: 'CC-BY-4.0',
  author: 'Leonid Tsvetkov',
};

beforeEach(resetExternalIcons);

describe('external icon ids', () => {
  it('namespaces the id so it cannot collide with a bundled set', () => {
    expect(externalIconId('lets', 'tree')).toBe('iconify:lets:tree');
    expect(isExternalIconId('iconify:lets:tree')).toBe(true);
    expect(isExternalIconId('tabler:tree')).toBe(false);
    expect(isExternalIconId('iconify-ish')).toBe(false);
  });
});

describe('registry', () => {
  const key = (svg = SVG) => externalIconKey('iconify:lets:tree', svg)!;

  it('knows a registered icon by id and content, with a readable name', () => {
    expect(registerExternalIcon('iconify:lets:tree', SVG, source)).toBe(key());
    expect(getExternalIcon(key())).toMatchObject({
      def: { id: key(), name: 'Tree', library: 'Lets Icons' },
    });
    expect(getExternalIcon(key())?.svg).toContain('<path');
  });

  it('keys an icon by a hash of its sanitised markup', () => {
    expect(key()).toMatch(/^iconify:lets:tree@[0-9a-z]+$/);
    expect(key(SVG.replace('M0 0h24', 'M1 1h24'))).not.toBe(key());
    // Markup that sanitises to the same tree is the same icon.
    expect(key(SVG.replace('<path', '<path onclick="x()"'))).toBe(key());
  });

  it('re-registers the svg stored in a document, e.g. after a reload', () => {
    registerStoredExternalIcons(['iconify:lets:tree', 'tabler:sun'], {
      'iconify:lets:tree': { svg: SVG, source },
      'tabler:sun': {},
    });
    expect(getExternalIcon(key())).not.toBeNull();
  });

  it('resolves a copy through its iconId', () => {
    registerStoredExternalIcons(['icon-7'], {
      'icon-7': { iconId: 'iconify:lets:tree', svg: SVG, source },
    });
    expect(getExternalIcon(key())).not.toBeNull();
  });

  it('refuses a stored svg that is not safe', () => {
    registerStoredExternalIcons(['iconify:x:y'], {
      'iconify:x:y': { svg: '<svg xmlns="http://www.w3.org/2000/svg"/onload=x()>' },
    });
    expect(externalIconKey('iconify:x:y', '<html><script>alert(1)</script></html>')).toBeNull();
    expect(externalIconDefs()).toEqual({});
  });

  it('stores the sanitised markup, not the stored one', () => {
    registerExternalIcon(
      'iconify:lets:tree',
      SVG.replace('<path', '<script>x()</script><path onclick="x()"'),
      source
    );
    const stored = getExternalIcon(key())!.svg;
    expect(stored).not.toMatch(/script|onclick/);
  });

  it('keeps two documents with different markup for one id apart', () => {
    const other = SVG.replace('M0 0h24', 'M5 5h5');
    const docA = {
      selectedIcons: ['iconify:lets:tree'],
      iconStates: { 'iconify:lets:tree': { svg: SVG, source } },
    };
    const docB = {
      selectedIcons: ['iconify:lets:tree'],
      iconStates: { 'iconify:lets:tree': { svg: other, source } },
    };
    registerStoredExternalIcons(docA.selectedIcons, docA.iconStates);
    registerStoredExternalIcons(docB.selectedIcons, docB.iconStates);
    const a = resolveIconDef('iconify:lets:tree', docA.iconStates, externalIconDefs());
    const b = resolveIconDef('iconify:lets:tree', docB.iconStates, externalIconDefs());
    expect(a?.id).not.toBe(b?.id);
    expect(getExternalIcon(a!.id)?.svg).toContain('M0 0h24');
    expect(getExternalIcon(b!.id)?.svg).toContain('M5 5h5');
    // Rendering one never changes what the other draws.
    const urlA = externalIconDataUrl(getExternalIcon(a!.id)!.svg, 64, '#000000');
    const urlB = externalIconDataUrl(getExternalIcon(b!.id)!.svg, 64, '#000000');
    expect(urlA).not.toBe(urlB);
  });
});

describe('externalIconDataUrl', () => {
  const decode = (url: string) => Buffer.from(url.split(',')[1]!, 'base64').toString();

  it('bakes the colour in and sizes the svg for the canvas', () => {
    const url = externalIconDataUrl(SVG, 128, '#ff0000');
    expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const svg = decode(url);
    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).not.toContain('currentColor');
    expect(svg).toContain('width="128"');
    expect(svg).toContain('height="128"');
  });

  it('refuses a colour that could break out of the markup', () => {
    const url = externalIconDataUrl(SVG, 64, '"/><script>x()</script>');
    const svg = decode(url);
    expect(svg).not.toContain('script');
    expect(svg).toContain('stroke="#000000"');
  });

  it('takes hex, rgb(a), hsl(a) and named colours', () => {
    for (const color of [
      '#fff',
      '#ff00ff80',
      'rgb(1, 2, 3)',
      'rgba(1,2,3,.5)',
      'hsl(10 20% 30%)',
      'red',
    ]) {
      expect(decode(externalIconDataUrl(SVG, 64, color))).toContain(`stroke="${color}"`);
    }
  });

  it('survives non-latin1 text in the svg', () => {
    const url = externalIconDataUrl(
      SVG.replace('<path', '<title>Bäume ✓</title><path'),
      64,
      '#000'
    );
    expect(decode(url)).toContain('Bäume ✓');
  });
});

describe('attributionLine', () => {
  it('names set, author and licence', () => {
    expect(attributionLine(source)).toBe('Icon: Lets Icons von Leonid Tsvetkov, CC-BY-4.0');
  });

  it('leaves the author out when the set names none', () => {
    expect(attributionLine({ ...source, author: '' })).toBe('Icon: Lets Icons, CC-BY-4.0');
  });
});

describe('icon credits', () => {
  const ccBy = source;
  const mit: IconSource = { ...source, prefix: 'tabler', setTitle: 'Tabler Icons', licence: 'MIT' };

  it('collects the sources of a page, each set once', () => {
    const state = {
      selectedIcons: ['iconify:lets:tree', 'copy-1', 'tabler:sun'],
      iconStates: {
        'iconify:lets:tree': { source: ccBy },
        'copy-1': { iconId: 'iconify:lets:tree', source: ccBy },
        'tabler:sun': {},
      },
    };
    expect(pageIconSources(state)).toEqual([ccBy, ccBy]);
  });

  it('credits every licence but CC0, with a licence link', () => {
    expect(iconCreditLine([ccBy])).toBe(
      'Icon: Lets Icons von Leonid Tsvetkov (CC-BY-4.0, https://spdx.org/licenses/CC-BY-4.0.html)'
    );
    expect(iconCreditLine([mit])).toBe(
      'Icon: Tabler Icons von Leonid Tsvetkov (MIT, https://spdx.org/licenses/MIT.html)'
    );
    expect(iconCreditLine([{ ...mit, licence: 'CC0-1.0' }])).toBe('');
    expect(iconCreditLine([])).toBe('');
  });

  it('names each set once', () => {
    expect(iconCreditLine([ccBy, ccBy, mit])).toBe(
      'Icons: Lets Icons von Leonid Tsvetkov (CC-BY-4.0, https://spdx.org/licenses/CC-BY-4.0.html), ' +
        'Tabler Icons von Leonid Tsvetkov (MIT, https://spdx.org/licenses/MIT.html)'
    );
  });

  it('leaves the author out when the set names none', () => {
    expect(iconCreditLine([{ ...mit, author: '' }])).toBe(
      'Icon: Tabler Icons (MIT, https://spdx.org/licenses/MIT.html)'
    );
  });
});
