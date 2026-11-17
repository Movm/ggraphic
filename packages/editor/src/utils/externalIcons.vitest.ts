// SPDX-License-Identifier: AGPL-3.0-only
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
  isSafeColor,
  pageIconSources,
  registerExternalIcon,
  registerStoredExternalIcons,
  resetExternalIcons,
  setIconHashForTest,
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

describe('hash collisions', () => {
  it('keys by the full markup when two different icons share a hash', () => {
    setIconHashForTest(() => 'same');
    try {
      const other = SVG.replace('M0 0h24', 'M5 5h5');
      const a = registerExternalIcon('iconify:lets:tree', SVG, source)!;
      const b = registerExternalIcon('iconify:lets:tree', other, source)!;
      expect(a).toBe('iconify:lets:tree@same');
      expect(b).not.toBe(a);
      expect(getExternalIcon(a)?.svg).toContain('M0 0h24');
      expect(getExternalIcon(b)?.svg).toContain('M5 5h5');
      // Looking an icon up finds the same key again, for either markup.
      expect(externalIconKey('iconify:lets:tree', SVG)).toBe(a);
      expect(externalIconKey('iconify:lets:tree', other)).toBe(b);
    } finally {
      setIconHashForTest(null);
    }
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

  it('sizes a self-closing root without breaking the tag', () => {
    const url = externalIconDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"/>',
      64,
      '#000'
    );
    expect(decode(url)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64"/>'
    );
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

describe('isSafeColor', () => {
  it.each([
    '#fff',
    '#336699',
    '#33669980',
    'rebeccapurple',
    'transparent',
    'none',
    'currentcolor',
    'rgb(10, 20, 30)',
    'rgba(10 20 30 / 50%)',
    'hsl(120deg 50% 50%)',
    'hsl(120, 50%, 50%)',
    'hsla(0.5turn, 50%, 50%, 0.5)',
    'hsl(2rad 50% 50%)',
    'hsl(100grad 50% 50%)',
    'hwb(194 0% 0%)',
    'lab(29.2345% 39.3825 20.0664)',
    'lch(52.2345% 72.2 56.2)',
    'oklab(59.686% 0.1009 0.1192 / 0.5)',
    'oklch(60% 0.15 50)',
    'oklch(none 0.15 50deg)',
    'color(display-p3 1 0.5 0)',
    'color(srgb 1 0 0 / 0.5)',
    'color-mix(in oklch, red, blue)',
    'color-mix(in srgb, #fff 30%, rgb(0 0 0))',
    'color-mix(in hsl longer hue, hsl(10 50% 50%) 20%, oklch(60% 0.15 50))',
  ])('accepts %s', (color) => {
    expect(isSafeColor(color)).toBe(true);
  });

  it.each([
    '',
    'url(https://tracker.example/x.svg#a)',
    'red; background: url(x)',
    'red" onload="alert(1)',
    "red' onload='x'",
    '<script>',
    'red>',
    'rgb(0 0 0) }',
    'expression(alert(1))',
    'var(--x)',
    'oklch(60% 0.15 50 / url(x))',
    'oklch(60% 0.15 50);',
    'oklch(60% 0.15 50',
    'oklch(60% 0.15 50))',
    'color-mix(in oklch, url(x), blue)',
    'color-mix(in oklch, red, blue) url(x)',
    'color-mix(in url(x), red, blue)',
    'color(url(x) 1 0 0)',
    'oklch(60% 0.15 50)\\',
    'oklch(60% 0.15 {50})',
    'rgb(calc(1 + 2) 0 0)',
    'foo(1 2 3)',
    'oklch(60%\n0.15 50) ; x',
    'red\n',
    ' red',
    '#fff\n',
  ])('rejects %j', (color) => {
    expect(isSafeColor(color)).toBe(false);
  });

  it('refuses a deeply nested colour-mix', () => {
    const deep = `color-mix(in srgb, ${'color-mix(in srgb, '.repeat(6)}red, blue${', blue)'.repeat(6)}, blue)`;
    expect(isSafeColor(deep)).toBe(false);
  });
});
