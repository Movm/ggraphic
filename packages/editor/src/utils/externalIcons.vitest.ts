// SPDX-License-Identifier: MPL-2.0
import { beforeEach, describe, expect, it } from 'vitest';

import {
  attributionLine,
  externalIconDataUrl,
  externalIconId,
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
  it('knows a registered icon with its svg and a readable name', () => {
    registerExternalIcon('iconify:lets:tree', SVG, source);
    expect(getExternalIcon('iconify:lets:tree')).toMatchObject({
      svg: SVG,
      def: { id: 'iconify:lets:tree', name: 'Tree', library: 'Lets Icons' },
    });
  });

  it('re-registers the svg stored in a document, e.g. after a reload', () => {
    registerStoredExternalIcons(['iconify:lets:tree', 'tabler:sun'], {
      'iconify:lets:tree': { svg: SVG, source },
      'tabler:sun': {},
    });
    expect(getExternalIcon('iconify:lets:tree')?.svg).toBe(SVG);
    expect(getExternalIcon('tabler:sun')).toBeNull();
  });

  it('resolves a copy through its iconId', () => {
    registerStoredExternalIcons(['icon-7'], {
      'icon-7': { iconId: 'iconify:lets:tree', svg: SVG, source },
    });
    expect(getExternalIcon('iconify:lets:tree')).not.toBeNull();
  });

  it('refuses a stored svg that is not plain markup', () => {
    registerStoredExternalIcons(['iconify:x:y'], {
      'iconify:x:y': { svg: '<svg><script>alert(1)</script></svg>' },
    });
    expect(getExternalIcon('iconify:x:y')).toBeNull();
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
    expect(attributionLine(source)).toBe('Icon: Lets Icons by Leonid Tsvetkov, CC-BY-4.0');
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

  it('credits only licences that ask for attribution, once per set', () => {
    expect(iconCreditLine([ccBy, ccBy, mit])).toBe(
      'Icon: Lets Icons by Leonid Tsvetkov, CC-BY-4.0'
    );
    expect(iconCreditLine([mit])).toBe('');
  });

  it('joins several sets', () => {
    const other: IconSource = { ...ccBy, prefix: 'x', setTitle: 'Other', author: 'Ann' };
    expect(iconCreditLine([ccBy, other])).toBe(
      'Icons: Lets Icons by Leonid Tsvetkov (CC-BY-4.0), Other by Ann (CC-BY-4.0)'
    );
  });
});
